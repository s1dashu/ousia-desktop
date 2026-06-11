import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  screen,
  session as electronSession,
  shell,
  type WebAuthnAccount,
} from "electron"
import { existsSync } from "node:fs"
import { env, platform } from "node:process"
import { join } from "node:path"

import type { OusiaEnsureWindowWidthPayload } from "./chat-types.js"
import { writeRuntimeLog } from "./runtime-logger.js"

const browserPartition = "persist:ousia-browser"
const MAIN_WINDOW_MIN_WIDTH = 340

type WindowHostOptions = {
  onClosed: () => void
  onWindowChanged: (window: BrowserWindow | undefined) => void
}

function isExternalUrl(url: string) {
  try {
    const parsed = new URL(url)
    return ["http:", "https:", "mailto:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

function isAllowedWebviewUrl(url: string) {
  try {
    const parsed = new URL(url)
    return ["about:", "file:", "http:", "https:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

function installApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(platform === "darwin"
          ? [
              { type: "separator" as const },
              { role: "front" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function getWebAuthnKeychainAccessGroup() {
  const configuredGroup = env.OUSIA_WEBAUTHN_KEYCHAIN_ACCESS_GROUP?.trim()
  if (configuredGroup) {
    return configuredGroup
  }

  const teamId = env.OUSIA_APPLE_TEAM_ID?.trim() || env.APPLE_TEAM_ID?.trim()
  if (!teamId) {
    return undefined
  }

  return `${teamId}.com.ousia.desktop.webauthn`
}

function describeWebAuthnAccount(account: WebAuthnAccount) {
  return (
    account.displayName ||
    account.name ||
    account.userHandle ||
    account.credentialId
  )
}

export function createWindowHost({ onClosed, onWindowChanged }: WindowHostOptions) {
  let mainWindow: BrowserWindow | undefined
  let lastEmittedFullscreen: boolean | undefined

  function getMainWindow() {
    return mainWindow
  }

  function emitWindowFullscreenState(isFullscreen = mainWindow?.isFullScreen()) {
    const nextFullscreen = Boolean(isFullscreen)
    if (lastEmittedFullscreen === nextFullscreen) {
      return
    }
    lastEmittedFullscreen = nextFullscreen
    mainWindow?.webContents.send("ousia:window:fullscreen", {
      isFullscreen: nextFullscreen,
    })
  }

  function emitInferredWindowFullscreenState() {
    if (!mainWindow || platform !== "darwin") {
      return
    }
    const bounds = mainWindow.getBounds()
    const displayBounds = screen.getDisplayMatching(bounds).bounds
    const tolerance = 1
    const fillsDisplay =
      Math.abs(bounds.x - displayBounds.x) <= tolerance &&
      Math.abs(bounds.y - displayBounds.y) <= tolerance &&
      Math.abs(bounds.width - displayBounds.width) <= tolerance &&
      Math.abs(bounds.height - displayBounds.height) <= tolerance

    emitWindowFullscreenState(mainWindow.isFullScreen() || fillsDisplay)
  }

  function getWindowFullscreenState() {
    return {
      isFullscreen: Boolean(mainWindow?.isFullScreen()),
    }
  }

  function ensureWindowWidth(payload: OusiaEnsureWindowWidthPayload) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, width: 0 }
    }

    const bounds = mainWindow.getBounds()
    const minWidth = Math.max(MAIN_WINDOW_MIN_WIDTH, Math.ceil(payload.minWidth))
    if (bounds.width >= minWidth || mainWindow.isFullScreen()) {
      return { ok: true, width: bounds.width }
    }

    const delta = minWidth - bounds.width
    const x = payload.anchor === "right" ? bounds.x - delta : bounds.x
    mainWindow.setBounds({ ...bounds, x, width: minWidth }, true)
    return { ok: true, width: minWidth }
  }

  function configureBrowserWebAuthn() {
    const browserSession = electronSession.fromPartition(browserPartition)

    browserSession.on(
      "select-webauthn-account",
      async (_event, details, callback) => {
        try {
          if (details.accounts.length === 0) {
            callback()
            return
          }

          if (details.accounts.length === 1) {
            callback(details.accounts[0].credentialId)
            return
          }

          const buttons = details.accounts.map(describeWebAuthnAccount)
          const cancelId = buttons.length
          const result = await dialog.showMessageBox(mainWindow!, {
            type: "question",
            title: "选择通行密钥",
            message: `为 ${details.relyingPartyId} 选择一个通行密钥`,
            buttons: [...buttons, "取消"],
            cancelId,
            defaultId: 0,
            noLink: true,
          })

          callback(
            result.response === cancelId
              ? undefined
              : details.accounts[result.response]?.credentialId
          )
        } catch {
          callback()
        }
      }
    )

    if (platform !== "darwin") {
      return
    }

    const keychainAccessGroup = getWebAuthnKeychainAccessGroup()
    if (!keychainAccessGroup) {
      console.warn(
        "Skipping macOS WebAuthn platform authenticator: set OUSIA_WEBAUTHN_KEYCHAIN_ACCESS_GROUP or OUSIA_APPLE_TEAM_ID."
      )
      return
    }

    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup,
        promptReason: "登录 $1",
      },
    })
  }

  async function createWindow() {
    installApplicationMenu()

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: MAIN_WINDOW_MIN_WIDTH,
      minHeight: 600,
      title: "Pi Desk",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 12 },
      backgroundColor: "#111111",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, "preload.js"),
        webviewTag: true,
      },
    })
    onWindowChanged(mainWindow)

    mainWindow.webContents.on(
      "will-attach-webview",
      (event, webPreferences, params) => {
        delete webPreferences.preload
        webPreferences.contextIsolation = true
        webPreferences.nodeIntegration = false
        webPreferences.sandbox = true

        if (!isAllowedWebviewUrl(params.src)) {
          event.preventDefault()
        }
      }
    )

    mainWindow.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        const normalizedLevel =
          level === 2 ? "warn" : level === 3 ? "error" : "info"
        writeRuntimeLog("renderer.console", normalizedLevel, {
          line,
          message,
          sourceId,
        })
      }
    )

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      writeRuntimeLog("renderer.process", "error", details)
    })

    mainWindow.webContents.on(
      "did-fail-load",
      (_event, code, description, url) => {
        writeRuntimeLog("renderer.load", "error", { code, description, url })
      }
    )

    mainWindow.on("unresponsive", () => {
      writeRuntimeLog("window", "warn", "Main window became unresponsive")
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalUrl(url)) {
        void shell.openExternal(url)
      }
      return { action: "deny" }
    })

    mainWindow.webContents.on("context-menu", (_event, params) => {
      const menuTemplate: Electron.MenuItemConstructorOptions[] = []
      if (params.selectionText) {
        menuTemplate.push({ role: "copy" })
      }
      if (params.isEditable) {
        if (menuTemplate.length) {
          menuTemplate.push({ type: "separator" })
        }
        menuTemplate.push(
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { type: "separator" },
          { role: "selectAll" }
        )
      }
      if (!menuTemplate.length) {
        return
      }
      Menu.buildFromTemplate(menuTemplate).popup({ window: mainWindow })
    })

    mainWindow.webContents.once("did-finish-load", () =>
      emitWindowFullscreenState()
    )
    mainWindow.on("resize", emitInferredWindowFullscreenState)
    mainWindow.on("move", emitInferredWindowFullscreenState)
    mainWindow.on("enter-full-screen", () => emitWindowFullscreenState())
    mainWindow.on("leave-full-screen", () => emitWindowFullscreenState())
    mainWindow.on("closed", () => {
      onClosed()
      mainWindow = undefined
      onWindowChanged(undefined)
    })

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    } else {
      const indexHtml = join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
      )
      if (!existsSync(indexHtml)) {
        throw new Error(`未找到渲染进程构建产物：${indexHtml}`)
      }
      await mainWindow.loadFile(indexHtml)
    }
  }

  return {
    configureBrowserWebAuthn,
    createWindow,
    ensureWindowWidth,
    getWindowFullscreenState,
    getMainWindow,
  }
}
