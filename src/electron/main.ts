import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { basename } from "node:path"
import { env } from "node:process"

import { createAgentConversationModule } from "./agent-conversations.js"
import { loadAppState, saveAppState } from "./app-state-store.js"
import { generateChatTitleWithUtilityModel } from "./chat-title-generator.js"
import { ousiaCliBinDir, startCliBridge } from "./cli-bridge.js"
import {
  deleteExtensionState,
  getExtensionState,
  setExtensionState,
} from "./extension-state-store.js"
import type {
  OusiaAppState,
  OusiaChatContext,
  OusiaChatEvent,
  OusiaChatGenerateTitlePayload,
  OusiaChatSendPayload,
  OusiaEditorListFilesPayload,
  OusiaEditorReadFilePayload,
  OusiaEditorSaveFilePayload,
  OusiaEnsureWindowWidthPayload,
  OusiaExtensionStateDeletePayload,
  OusiaExtensionStateGetPayload,
  OusiaExtensionStateSetPayload,
  OusiaPdfListFilesPayload,
  OusiaPdfReadFilePayload,
  OusiaPdfSaveFilePayload,
  OusiaRuntimeExtensionDeletePayload,
  OusiaRuntimeExtensionsChangedEvent,
  OusiaTerminalCreatePayload,
  OusiaTerminalDisposePayload,
  OusiaTerminalResizePayload,
  OusiaTerminalWritePayload,
} from "./chat-types.js"
import { expandHomePath, isPathInside } from "./host-paths.js"
import { createProjectFilesModule } from "./project-files.js"
import { createProjectTerminalModule } from "./project-terminal.js"
import {
  installRuntimeLogger,
  OUSIA_DESKTOP_LOG_PATH,
  writeRuntimeLog,
} from "./runtime-logger.js"
import { createRuntimeExtensionModule } from "./runtime-extensions.js"
import { createWindowHost } from "./window-host.js"

installRuntimeLogger()

const enabledTools = ["read", "write", "edit", "bash", "grep", "find", "ls"]

let mainWindow: BrowserWindow | undefined
let cliBridgeServer: Awaited<ReturnType<typeof startCliBridge>> | undefined

function installOusiaCliPath() {
  const binDir = ousiaCliBinDir()
  const currentPath = env.PATH ?? ""
  if (!currentPath.split(":").includes(binDir)) {
    env.PATH = `${binDir}:${currentPath}`
  }
}

async function ensureCliBridge() {
  if (cliBridgeServer) {
    return
  }
  cliBridgeServer = await startCliBridge({
    getMainWindow: () => mainWindow,
    expandHomePath,
    isPathInside,
  })
}

function emitChatEvent(event: OusiaChatEvent, context?: OusiaChatContext) {
  if (event.type === "error") {
    writeRuntimeLog("chat.event", "error", { context, text: event.text })
  } else if (event.type === "run_status" && event.status === "error") {
    writeRuntimeLog("chat.event", "error", { context, text: event.text })
  }
  mainWindow?.webContents.send(
    "ousia:chat:event",
    context ? { ...event, context } : event
  )
}

function emitTerminalEvent(event: unknown) {
  mainWindow?.webContents.send("ousia:terminal:event", event)
}

const agentConversations = createAgentConversationModule({
  enabledTools,
  emitChatEvent,
})

const runtimeExtensions = createRuntimeExtensionModule({
  emitRuntimeExtensionsChanged(event: OusiaRuntimeExtensionsChangedEvent) {
    mainWindow?.webContents.send("ousia:extensions:changed", event)
  },
})

const projectFiles = createProjectFilesModule()
const projectTerminal = createProjectTerminalModule({ emitTerminalEvent })
const windowHost = createWindowHost({
  onClosed() {
    runtimeExtensions.closeRuntimeExtensionWatchers()
  },
  onWindowChanged(window) {
    mainWindow = window
  },
})

ipcMain.handle("ousia:chat:send", (_event, payload: OusiaChatSendPayload) =>
  agentConversations.sendChatMessage(payload)
)

ipcMain.handle(
  "ousia:chat:generate-title",
  (_event, payload: OusiaChatGenerateTitlePayload) =>
    generateChatTitleWithUtilityModel(payload, app.getPath("userData"))
)

ipcMain.handle("ousia:chat:history", (_event, payload: OusiaChatContext) =>
  agentConversations.getChatHistory(payload)
)

ipcMain.handle("ousia:chat:interrupt", (_event, payload: OusiaChatContext) =>
  agentConversations.interruptChat(payload)
)

ipcMain.handle("ousia:project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  })
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }
  const path = result.filePaths[0]
  return {
    canceled: false,
    path,
    name: basename(path),
  }
})

ipcMain.handle(
  "ousia:window:ensure-width",
  (_event, payload: OusiaEnsureWindowWidthPayload) =>
    windowHost.ensureWindowWidth(payload)
)

ipcMain.handle("ousia:window:fullscreen-state", () =>
  windowHost.getWindowFullscreenState()
)

ipcMain.handle("ousia:app-state:load", () => loadAppState())

ipcMain.handle("ousia:app-state:save", (_event, payload: OusiaAppState) =>
  saveAppState(payload)
)

ipcMain.handle(
  "ousia:extension-state:get",
  (_event, payload: OusiaExtensionStateGetPayload) => getExtensionState(payload)
)

ipcMain.handle(
  "ousia:extension-state:set",
  (_event, payload: OusiaExtensionStateSetPayload) => setExtensionState(payload)
)

ipcMain.handle(
  "ousia:extension-state:delete",
  (_event, payload: OusiaExtensionStateDeletePayload) =>
    deleteExtensionState(payload)
)

ipcMain.handle(
  "ousia:host:project-files:list",
  (_event, payload: OusiaEditorListFilesPayload) =>
    projectFiles.listEditorFiles(payload)
)

ipcMain.handle(
  "ousia:host:project-files:read",
  (_event, payload: OusiaEditorReadFilePayload) =>
    projectFiles.readEditorFile(payload)
)

ipcMain.handle(
  "ousia:host:project-files:save",
  (_event, payload: OusiaEditorSaveFilePayload) =>
    projectFiles.saveEditorFile(payload)
)

ipcMain.handle(
  "ousia:host:project-pdfs:list",
  (_event, payload: OusiaPdfListFilesPayload) => projectFiles.listPdfFiles(payload)
)

ipcMain.handle(
  "ousia:host:project-pdfs:read",
  (_event, payload: OusiaPdfReadFilePayload) => projectFiles.readPdfFile(payload)
)

ipcMain.handle(
  "ousia:host:project-pdfs:save",
  (_event, payload: OusiaPdfSaveFilePayload) => projectFiles.savePdfFile(payload)
)

ipcMain.handle(
  "ousia:extensions:list",
  () => runtimeExtensions.listRuntimeExtensions()
)

ipcMain.handle(
  "ousia:extensions:watch",
  () => runtimeExtensions.watchRuntimeExtensions()
)

ipcMain.handle("ousia:extensions:unwatch", () => {
  runtimeExtensions.closeRuntimeExtensionWatchers()
})

ipcMain.handle(
  "ousia:extensions:delete",
  (_event, payload: OusiaRuntimeExtensionDeletePayload) =>
    runtimeExtensions.deleteRuntimeExtension(payload)
)

ipcMain.handle(
  "ousia:host:project-pty:create",
  (_event, payload: OusiaTerminalCreatePayload) =>
    projectTerminal.createTerminal(payload)
)

ipcMain.handle(
  "ousia:host:project-pty:write",
  (_event, payload: OusiaTerminalWritePayload) =>
    projectTerminal.writeTerminal(payload)
)

ipcMain.handle(
  "ousia:host:project-pty:resize",
  (_event, payload: OusiaTerminalResizePayload) =>
    projectTerminal.resizeTerminal(payload)
)

ipcMain.handle(
  "ousia:host:project-pty:dispose",
  (_event, payload: OusiaTerminalDisposePayload) =>
    projectTerminal.disposeTerminal(payload)
)

ipcMain.on("ousia:log:renderer-error", (_event, payload: unknown) => {
  writeRuntimeLog("renderer.error", "error", payload)
})

app.whenReady().then(async () => {
  writeRuntimeLog("main", "info", `Runtime log path: ${OUSIA_DESKTOP_LOG_PATH}`)
  installOusiaCliPath()
  windowHost.configureBrowserWebAuthn()
  await windowHost.createWindow()
  await ensureCliBridge()
})

app.on("window-all-closed", () => {
  writeRuntimeLog("main", "info", "All windows closed")
  cliBridgeServer?.close()
  cliBridgeServer = undefined
  projectTerminal.disposeAllTerminals()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    writeRuntimeLog("main", "info", "Recreating main window after activate")
    void windowHost.createWindow().then(() => ensureCliBridge())
  }
})
