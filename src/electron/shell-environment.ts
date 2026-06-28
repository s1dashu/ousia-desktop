import { spawnSync } from "node:child_process"

import { writeRuntimeLog } from "./runtime-logger.js"

const SHELL_ENV_TIMEOUT_MS = 5_000
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const SENSITIVE_ENV_NAME_PATTERN =
  /(API|AUTH|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i

function parseNullSeparatedEnv(stdout: Buffer) {
  const parsed = new Map<string, string>()
  for (const entry of stdout.toString("utf8").split("\0")) {
    const equalsIndex = entry.indexOf("=")
    if (equalsIndex <= 0) {
      continue
    }
    const name = entry.slice(0, equalsIndex)
    if (!ENV_NAME_PATTERN.test(name)) {
      continue
    }
    parsed.set(name, entry.slice(equalsIndex + 1))
  }
  return parsed
}

function readShellEnvironment(shell: string, args: string[]) {
  const result = spawnSync(shell, args, {
    env: {
      ...process.env,
      TERM: process.env.TERM || "xterm-256color",
    },
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: SHELL_ENV_TIMEOUT_MS,
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    writeRuntimeLog("shell-env", "warn", {
      error: result.error instanceof Error ? result.error.message : undefined,
      signal: result.signal,
      status: result.status,
      stderr: result.stderr.toString("utf8").trim().slice(0, 500),
    })
    return undefined
  }
  return parseNullSeparatedEnv(result.stdout)
}

function shouldImportShellEnv(name: string) {
  return process.env[name] === undefined || process.env[name] === "" || name === "PATH"
}

export function hydrateShellEnvironment() {
  if (process.platform !== "darwin") {
    return
  }

  const shell = process.env.SHELL?.trim() || "/bin/zsh"
  const command = "printf '\\0'; /usr/bin/env -0"
  const shellEnv =
    readShellEnvironment(shell, ["-ilc", command]) ??
    readShellEnvironment(shell, ["-lc", command])
  if (!shellEnv) {
    return
  }

  const importedNames: string[] = []
  for (const [name, value] of shellEnv) {
    if (!shouldImportShellEnv(name)) {
      continue
    }
    process.env[name] = value
    importedNames.push(name)
  }

  writeRuntimeLog("shell-env", "info", {
    importedCount: importedNames.length,
    sensitiveEnvNames: importedNames
      .filter((name) => SENSITIVE_ENV_NAME_PATTERN.test(name))
      .sort(),
    shell,
  })
}
