import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { inspect } from "node:util"

export const OUSIA_LOG_DIR = join(homedir(), ".ousia", "logs")
export const OUSIA_DESKTOP_LOG_PATH = join(OUSIA_LOG_DIR, "ousia-desktop.log")

type LogLevel = "debug" | "info" | "warn" | "error"

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
}

let isInstalled = false

function ensureLogDir() {
  mkdirSync(OUSIA_LOG_DIR, { recursive: true })
}

function formatLogValue(value: unknown) {
  if (typeof value === "string") {
    return value
  }
  if (value instanceof Error) {
    return value.stack || value.message
  }
  return inspect(value, {
    breakLength: 140,
    depth: 6,
    maxArrayLength: 80,
  })
}

function appendLine(line: string) {
  ensureLogDir()
  writeFileSync(OUSIA_DESKTOP_LOG_PATH, `${line}\n`, {
    encoding: "utf8",
    flag: "a",
  })
}

export function writeRuntimeLog(
  source: string,
  level: LogLevel,
  ...values: unknown[]
) {
  const message = values.map(formatLogValue).join(" ")
  appendLine(`${new Date().toISOString()} [${level}] [${source}] ${message}`)
}

export function installRuntimeLogger() {
  if (isInstalled) {
    return
  }
  isInstalled = true
  ensureLogDir()
  appendLine(`${new Date().toISOString()} [info] [main] Ousia desktop starting`)

  console.debug = (...values: unknown[]) => {
    writeRuntimeLog("main.console", "debug", ...values)
    originalConsole.debug(...values)
  }
  console.info = (...values: unknown[]) => {
    writeRuntimeLog("main.console", "info", ...values)
    originalConsole.info(...values)
  }
  console.log = (...values: unknown[]) => {
    writeRuntimeLog("main.console", "info", ...values)
    originalConsole.log(...values)
  }
  console.warn = (...values: unknown[]) => {
    writeRuntimeLog("main.console", "warn", ...values)
    originalConsole.warn(...values)
  }
  console.error = (...values: unknown[]) => {
    writeRuntimeLog("main.console", "error", ...values)
    originalConsole.error(...values)
  }

  process.on("uncaughtExceptionMonitor", (error) => {
    writeRuntimeLog("main.uncaughtException", "error", error)
  })
  process.on("unhandledRejection", (reason) => {
    writeRuntimeLog("main.unhandledRejection", "error", reason)
    originalConsole.error(reason)
  })
}
