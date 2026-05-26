import { basename } from "node:path"
import { platform } from "node:process"
import * as pty from "node-pty"

import type {
  OusiaTerminalCreatePayload,
  OusiaTerminalCreateResult,
  OusiaTerminalDisposePayload,
  OusiaTerminalOperationResult,
  OusiaTerminalResizePayload,
  OusiaTerminalWritePayload,
} from "./chat-types.js"
import { resolveProjectRoot } from "./host-paths.js"

type TerminalEvent =
  | { type: "data"; terminalId: string; data: string }
  | {
      type: "exit"
      terminalId: string
      exitCode?: number
      signal?: number
    }
  | { type: "error"; terminalId: string; message: string }

type ProjectTerminalModuleOptions = {
  emitTerminalEvent: (event: TerminalEvent) => void
}

function terminalKey(context: OusiaTerminalDisposePayload) {
  return `${context.projectPath}::${context.sessionId}::${context.terminalId}`
}

function clampTerminalSize(value: number, fallback: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(value), 2), max)
}

function defaultShell() {
  if (platform === "win32") {
    return process.env.COMSPEC || "powershell.exe"
  }
  return process.env.SHELL || "/bin/zsh"
}

function defaultShellArgs(shellPath: string) {
  if (platform === "win32") {
    return []
  }
  if (basename(shellPath) === "zsh") {
    return ["-l"]
  }
  if (basename(shellPath) === "bash") {
    return ["-l"]
  }
  return []
}

export function createProjectTerminalModule({
  emitTerminalEvent,
}: ProjectTerminalModuleOptions) {
  const terminalSessions = new Map<string, pty.IPty>()

  async function createTerminal(
    payload: OusiaTerminalCreatePayload
  ): Promise<OusiaTerminalCreateResult> {
    const cwd = resolveProjectRoot(payload.projectPath)
    const key = terminalKey(payload)
    const previousTerminal = terminalSessions.get(key)
    terminalSessions.delete(key)
    previousTerminal?.kill()

    const cols = clampTerminalSize(payload.cols, 80, 500)
    const rows = clampTerminalSize(payload.rows, 24, 200)
    const shellPath = defaultShell()
    const terminalProcess = pty.spawn(shellPath, defaultShellArgs(shellPath), {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        TERM_PROGRAM: "Ousia",
      },
    })

    terminalSessions.set(key, terminalProcess)
    terminalProcess.onData((data) => {
      if (terminalSessions.get(key) !== terminalProcess) {
        return
      }
      emitTerminalEvent({
        type: "data",
        terminalId: payload.terminalId,
        data,
      })
    })
    terminalProcess.onExit(({ exitCode, signal }) => {
      if (terminalSessions.get(key) !== terminalProcess) {
        return
      }
      terminalSessions.delete(key)
      emitTerminalEvent({
        type: "exit",
        terminalId: payload.terminalId,
        exitCode,
        signal,
      })
    })

    return { terminalId: payload.terminalId }
  }

  async function writeTerminal(
    payload: OusiaTerminalWritePayload
  ): Promise<OusiaTerminalOperationResult> {
    terminalSessions.get(terminalKey(payload))?.write(payload.data)
    return { ok: true }
  }

  async function resizeTerminal(
    payload: OusiaTerminalResizePayload
  ): Promise<OusiaTerminalOperationResult> {
    const terminal = terminalSessions.get(terminalKey(payload))
    if (terminal) {
      terminal.resize(
        clampTerminalSize(payload.cols, terminal.cols, 500),
        clampTerminalSize(payload.rows, terminal.rows, 200)
      )
    }
    return { ok: true }
  }

  async function disposeTerminal(
    payload: OusiaTerminalDisposePayload
  ): Promise<OusiaTerminalOperationResult> {
    const key = terminalKey(payload)
    const terminal = terminalSessions.get(key)
    if (terminal) {
      terminalSessions.delete(key)
      terminal.kill()
    }
    return { ok: true }
  }

  function disposeAllTerminals() {
    terminalSessions.forEach((terminal) => terminal.kill())
    terminalSessions.clear()
  }

  return {
    createTerminal,
    disposeAllTerminals,
    disposeTerminal,
    resizeTerminal,
    writeTerminal,
  }
}
