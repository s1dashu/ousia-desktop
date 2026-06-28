import "./pi-package-dir.js"

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  AuthStorage,
  getAgentDir,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent"

import type {
  OusiaPiConfigSource,
  OusiaPiEnvironmentStatus,
  OusiaPiInstallResult,
  OusiaPiProviderCredentialPayload,
  OusiaPiProviderCredentialResult,
} from "./chat-types.js"
import { isDeprecatedProviderModelId } from "./model-compat.js"

export const PI_INSTALL_COMMAND =
  "npm install -g --ignore-scripts @earendil-works/pi-coding-agent"

type ShellCommandResult = {
  code: number | null
  error?: string
  stderr: string
  stdout: string
  timedOut: boolean
}

type PiAuthStorageData = NonNullable<Parameters<typeof AuthStorage.inMemory>[0]>

function normalizePiConfigSource(
  source: OusiaPiConfigSource | undefined
): OusiaPiConfigSource {
  return source === "ousia" ? "ousia" : "local"
}

export function resolvePiAgentDir(
  userData: string,
  source: OusiaPiConfigSource | undefined
) {
  return normalizePiConfigSource(source) === "ousia"
    ? join(userData, "pi-agent")
    : getAgentDir()
}

function userShellCommand(command: string, timeoutMs: number) {
  const shell =
    process.env.SHELL ||
    (process.platform === "win32" ? "powershell.exe" : "/bin/zsh")
  const args =
    process.platform === "win32"
      ? ["-NoProfile", "-Command", command]
      : ["-lc", command]

  return new Promise<ShellCommandResult>((resolve) => {
    const child = spawn(shell, args, {
      env: process.env,
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    let timedOut = false
    const finish = (result: ShellCommandResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      finish({
        code: null,
        error: error.message,
        stderr,
        stdout,
        timedOut,
      })
    })
    child.on("close", (code) => {
      finish({
        code,
        stderr,
        stdout,
        timedOut,
      })
    })
  })
}

async function detectPiCli() {
  const result = await userShellCommand(
    'PI_PATH="$(command -v pi)"; test -n "$PI_PATH"; printf "%s\\n" "$PI_PATH"; pi --version',
    15_000
  )
  if (result.code !== 0) {
    return {
      cliInstalled: false,
      cliError:
        result.error ||
        result.stderr.trim() ||
        (result.timedOut ? "Pi detection timed out." : "Pi CLI not found."),
    }
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    cliInstalled: true,
    cliPath: lines[0],
    cliVersion: lines.slice(1).join("\n") || undefined,
  }
}

function readAuthStorageData(authPath: string): PiAuthStorageData {
  if (!existsSync(authPath)) {
    return {}
  }

  try {
    const parsed = JSON.parse(readFileSync(authPath, "utf8")) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PiAuthStorageData)
      : {}
  } catch {
    return {}
  }
}

export function createReadOnlyPiAuthStorage(agentDir: string) {
  return AuthStorage.inMemory(readAuthStorageData(join(agentDir, "auth.json")))
}

export function createWritablePiAuthStorage(agentDir: string) {
  mkdirSync(agentDir, { recursive: true })
  return AuthStorage.create(join(agentDir, "auth.json"))
}

function configuredProvidersFromRegistry(modelRegistry: ModelRegistry) {
  const configuredProviderIds = new Set<string>()
  let modelCount = 0

  for (const model of modelRegistry.getAvailable()) {
    const provider = model.provider.trim()
    const modelId = model.id.trim()
    if (
      provider &&
      modelId &&
      model.input?.includes("text") &&
      !isDeprecatedProviderModelId(provider, modelId)
    ) {
      configuredProviderIds.add(provider)
      modelCount += 1
    }
  }

  return {
    configuredProviderIds: [...configuredProviderIds].sort(),
    modelCount,
  }
}

export async function checkPiEnvironment(
  userData: string,
  configSource?: OusiaPiConfigSource
): Promise<OusiaPiEnvironmentStatus> {
  const source = normalizePiConfigSource(configSource)
  const agentDir = resolvePiAgentDir(userData, source)
  const authJsonPath = join(agentDir, "auth.json")
  const modelsJsonPath = join(agentDir, "models.json")
  const authStorage = createReadOnlyPiAuthStorage(agentDir)
  const modelRegistry = ModelRegistry.create(authStorage, modelsJsonPath)
  const configured = configuredProvidersFromRegistry(modelRegistry)
  const cli = await detectPiCli()

  return {
    agentDir,
    authJsonExists: existsSync(authJsonPath),
    ...cli,
    configDirExists: existsSync(agentDir),
    configSource: source,
    configuredProviderIds: configured.configuredProviderIds,
    hasConfiguredCredential: configured.configuredProviderIds.length > 0,
    installCommand: PI_INSTALL_COMMAND,
    modelCount: configured.modelCount,
    modelsJsonExists: existsSync(modelsJsonPath),
  }
}

export async function installPiAndCheck(
  userData: string
): Promise<OusiaPiInstallResult> {
  const result = await userShellCommand(PI_INSTALL_COMMAND, 300_000)
  if (result.code !== 0) {
    return {
      ok: false,
      error:
        result.error ||
        result.stderr.trim() ||
        (result.timedOut ? "Pi installation timed out." : "Pi installation failed."),
      exitCode: result.code,
      stderr: result.stderr,
      stdout: result.stdout,
    }
  }

  return {
    ok: true,
    exitCode: result.code,
    stderr: result.stderr,
    stdout: result.stdout,
    status: await checkPiEnvironment(userData, "local"),
  }
}

export async function savePiProviderCredential(
  userData: string,
  payload: OusiaPiProviderCredentialPayload
): Promise<OusiaPiProviderCredentialResult> {
  const provider = payload.provider.trim()
  const apiKey = payload.apiKey.trim()
  if (!provider || !apiKey) {
    return { ok: false, error: "供应商和 API Key 不能为空。" }
  }

  try {
    const source = normalizePiConfigSource(payload.configSource)
    const agentDir = resolvePiAgentDir(userData, source)
    const authStorage = createWritablePiAuthStorage(agentDir)
    authStorage.set(provider, { type: "api_key", key: apiKey })
    return {
      ok: true,
      status: await checkPiEnvironment(userData, source),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
