import type {
  OusiaAppState,
  OusiaAppStateSaveResult,
  OusiaChatContext,
  OusiaChatEvent,
  OusiaChatGenerateTitlePayload,
  OusiaChatGenerateTitleResult,
  OusiaChatHistoryResult,
  OusiaChatInterruptResult,
  OusiaChatSendPayload,
  OusiaChatSendResult,
  OusiaEditorListFilesPayload,
  OusiaEditorListFilesResult,
  OusiaEditorReadFilePayload,
  OusiaEditorReadFileResult,
  OusiaEditorSaveFilePayload,
  OusiaEditorSaveFileResult,
  OusiaEnsureWindowWidthPayload,
  OusiaEnsureWindowWidthResult,
  OusiaExtensionStateDeletePayload,
  OusiaExtensionStateGetPayload,
  OusiaExtensionStateResult,
  OusiaExtensionStateSaveResult,
  OusiaExtensionStateSetPayload,
  OusiaOpenProjectResult,
  OusiaPdfListFilesPayload,
  OusiaPdfListFilesResult,
  OusiaPdfReadFilePayload,
  OusiaPdfReadFileResult,
  OusiaPdfSaveFilePayload,
  OusiaPdfSaveFileResult,
  OusiaRuntimeExtensionDeletePayload,
  OusiaRuntimeExtensionDeleteResult,
  OusiaRuntimeExtensionsChangedEvent,
  OusiaRuntimeExtensionsResult,
  OusiaTerminalCreatePayload,
  OusiaTerminalCreateResult,
  OusiaTerminalDisposePayload,
  OusiaTerminalEvent,
  OusiaTerminalOperationResult,
  OusiaTerminalResizePayload,
  OusiaTerminalWritePayload,
  OusiaWorkspaceAction,
  OusiaWindowFullscreenEvent,
  OusiaWindowFullscreenResult,
} from "./chat-types.js"

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }
  return {
    message: String(error),
  }
}

window.addEventListener("error", (event) => {
  ipcRenderer.send("ousia:log:renderer-error", {
    colno: event.colno,
    error: errorPayload(event.error),
    filename: event.filename,
    lineno: event.lineno,
    message: event.message,
    type: "window.error",
  })
})

window.addEventListener("unhandledrejection", (event) => {
  ipcRenderer.send("ousia:log:renderer-error", {
    reason: errorPayload(event.reason),
    type: "window.unhandledrejection",
  })
})

const api = {
  loadAppState(): Promise<OusiaAppState> {
    return ipcRenderer.invoke("ousia:app-state:load")
  },
  saveAppState(payload: OusiaAppState): Promise<OusiaAppStateSaveResult> {
    return ipcRenderer.invoke("ousia:app-state:save", payload)
  },
  getExtensionState(
    payload: OusiaExtensionStateGetPayload
  ): Promise<OusiaExtensionStateResult> {
    return ipcRenderer.invoke("ousia:extension-state:get", payload)
  },
  setExtensionState(
    payload: OusiaExtensionStateSetPayload
  ): Promise<OusiaExtensionStateSaveResult> {
    return ipcRenderer.invoke("ousia:extension-state:set", payload)
  },
  deleteExtensionState(
    payload: OusiaExtensionStateDeletePayload
  ): Promise<OusiaExtensionStateSaveResult> {
    return ipcRenderer.invoke("ousia:extension-state:delete", payload)
  },
  sendChatMessage(payload: OusiaChatSendPayload): Promise<OusiaChatSendResult> {
    return ipcRenderer.invoke("ousia:chat:send", payload)
  },
  generateChatTitle(
    payload: OusiaChatGenerateTitlePayload
  ): Promise<OusiaChatGenerateTitleResult> {
    return ipcRenderer.invoke("ousia:chat:generate-title", payload)
  },
  getChatHistory(payload: OusiaChatContext): Promise<OusiaChatHistoryResult> {
    return ipcRenderer.invoke("ousia:chat:history", payload)
  },
  interruptChat(payload: OusiaChatContext): Promise<OusiaChatInterruptResult> {
    return ipcRenderer.invoke("ousia:chat:interrupt", payload)
  },
  openProjectDirectory(): Promise<OusiaOpenProjectResult> {
    return ipcRenderer.invoke("ousia:project:open")
  },
  ensureWindowWidth(
    payload: OusiaEnsureWindowWidthPayload
  ): Promise<OusiaEnsureWindowWidthResult> {
    return ipcRenderer.invoke("ousia:window:ensure-width", payload)
  },
  getWindowFullscreenState(): Promise<OusiaWindowFullscreenResult> {
    return ipcRenderer.invoke("ousia:window:fullscreen-state")
  },
  listEditorFiles(
    payload: OusiaEditorListFilesPayload
  ): Promise<OusiaEditorListFilesResult> {
    return ipcRenderer.invoke("ousia:host:project-files:list", payload)
  },
  readEditorFile(
    payload: OusiaEditorReadFilePayload
  ): Promise<OusiaEditorReadFileResult> {
    return ipcRenderer.invoke("ousia:host:project-files:read", payload)
  },
  saveEditorFile(
    payload: OusiaEditorSaveFilePayload
  ): Promise<OusiaEditorSaveFileResult> {
    return ipcRenderer.invoke("ousia:host:project-files:save", payload)
  },
  listPdfFiles(
    payload: OusiaPdfListFilesPayload
  ): Promise<OusiaPdfListFilesResult> {
    return ipcRenderer.invoke("ousia:host:project-pdfs:list", payload)
  },
  readPdfFile(payload: OusiaPdfReadFilePayload): Promise<OusiaPdfReadFileResult> {
    return ipcRenderer.invoke("ousia:host:project-pdfs:read", payload)
  },
  savePdfFile(payload: OusiaPdfSaveFilePayload): Promise<OusiaPdfSaveFileResult> {
    return ipcRenderer.invoke("ousia:host:project-pdfs:save", payload)
  },
  listRuntimeExtensions(): Promise<OusiaRuntimeExtensionsResult> {
    return ipcRenderer.invoke("ousia:extensions:list")
  },
  watchRuntimeExtensions(): Promise<OusiaRuntimeExtensionsResult> {
    return ipcRenderer.invoke("ousia:extensions:watch")
  },
  unwatchRuntimeExtensions(): Promise<void> {
    return ipcRenderer.invoke("ousia:extensions:unwatch")
  },
  deleteRuntimeExtension(
    payload: OusiaRuntimeExtensionDeletePayload
  ): Promise<OusiaRuntimeExtensionDeleteResult> {
    return ipcRenderer.invoke("ousia:extensions:delete", payload)
  },
  onRuntimeExtensionsChanged(
    callback: (event: OusiaRuntimeExtensionsChangedEvent) => void
  ): () => void {
    const listener = (
      _event: IpcRendererEvent,
      payload: OusiaRuntimeExtensionsChangedEvent
    ) => callback(payload)
    ipcRenderer.on("ousia:extensions:changed", listener)
    return () => {
      ipcRenderer.off("ousia:extensions:changed", listener)
    }
  },
  onWorkspaceAction(callback: (event: OusiaWorkspaceAction) => void): () => void {
    const listener = (_event: IpcRendererEvent, payload: OusiaWorkspaceAction) =>
      callback(payload)
    ipcRenderer.on("ousia:workspace:action", listener)
    return () => {
      ipcRenderer.off("ousia:workspace:action", listener)
    }
  },
  createTerminal(
    payload: OusiaTerminalCreatePayload
  ): Promise<OusiaTerminalCreateResult> {
    return ipcRenderer.invoke("ousia:host:project-pty:create", payload)
  },
  writeTerminal(
    payload: OusiaTerminalWritePayload
  ): Promise<OusiaTerminalOperationResult> {
    return ipcRenderer.invoke("ousia:host:project-pty:write", payload)
  },
  resizeTerminal(
    payload: OusiaTerminalResizePayload
  ): Promise<OusiaTerminalOperationResult> {
    return ipcRenderer.invoke("ousia:host:project-pty:resize", payload)
  },
  disposeTerminal(
    payload: OusiaTerminalDisposePayload
  ): Promise<OusiaTerminalOperationResult> {
    return ipcRenderer.invoke("ousia:host:project-pty:dispose", payload)
  },
  onTerminalEvent(callback: (event: OusiaTerminalEvent) => void): () => void {
    const listener = (_event: IpcRendererEvent, payload: OusiaTerminalEvent) =>
      callback(payload)
    ipcRenderer.on("ousia:terminal:event", listener)
    return () => {
      ipcRenderer.off("ousia:terminal:event", listener)
    }
  },
  onChatEvent(callback: (event: OusiaChatEvent) => void): () => void {
    const listener = (_event: IpcRendererEvent, payload: OusiaChatEvent) =>
      callback(payload)
    ipcRenderer.on("ousia:chat:event", listener)
    return () => {
      ipcRenderer.off("ousia:chat:event", listener)
    }
  },
  onWindowFullscreenChange(
    callback: (event: OusiaWindowFullscreenEvent) => void
  ): () => void {
    const listener = (
      _event: IpcRendererEvent,
      payload: OusiaWindowFullscreenEvent
    ) => callback(payload)
    ipcRenderer.on("ousia:window:fullscreen", listener)
    return () => {
      ipcRenderer.off("ousia:window:fullscreen", listener)
    }
  },
}

contextBridge.exposeInMainWorld("ousia", api)

export type OusiaRendererApi = typeof api
