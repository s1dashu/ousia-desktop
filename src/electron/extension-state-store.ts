import { app } from "electron"
import { existsSync, mkdirSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type {
  OusiaExtensionStateDeletePayload,
  OusiaExtensionStateGetPayload,
  OusiaExtensionStateResult,
  OusiaExtensionStateSaveResult,
  OusiaExtensionStateScope,
  OusiaExtensionStateSetPayload,
} from "./chat-types.js"

type ExtensionStateFile = Record<
  string,
  Partial<Record<OusiaExtensionStateScope, Record<string, unknown>>>
>

const extensionStateFileName = "extension-state.json"

function extensionStatePath() {
  return join(app.getPath("userData"), extensionStateFileName)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function sanitizePayload(payload: OusiaExtensionStateGetPayload) {
  const extensionId = payload.extensionId.trim()
  const key = payload.key.trim()
  if (!extensionId || !key) {
    throw new Error("Extension state requires extensionId and key.")
  }
  return {
    extensionId,
    key,
    scope: payload.scope,
  }
}

async function readStateFile(): Promise<ExtensionStateFile> {
  const filePath = extensionStatePath()
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown
    return isRecord(parsed) ? (parsed as ExtensionStateFile) : {}
  } catch {
    return {}
  }
}

async function writeStateFile(state: ExtensionStateFile) {
  const filePath = extensionStatePath()
  mkdirSync(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

export async function getExtensionState(
  payload: OusiaExtensionStateGetPayload
): Promise<OusiaExtensionStateResult> {
  const { extensionId, key, scope } = sanitizePayload(payload)
  const state = await readStateFile()
  return {
    value: state[extensionId]?.[scope]?.[key] ?? null,
  }
}

export async function setExtensionState(
  payload: OusiaExtensionStateSetPayload
): Promise<OusiaExtensionStateSaveResult> {
  const { extensionId, key, scope } = sanitizePayload(payload)
  const state = await readStateFile()
  state[extensionId] ??= {}
  state[extensionId][scope] ??= {}
  state[extensionId][scope][key] = payload.value
  await writeStateFile(state)
  return { ok: true }
}

export async function deleteExtensionState(
  payload: OusiaExtensionStateDeletePayload
): Promise<OusiaExtensionStateSaveResult> {
  const { extensionId, key, scope } = sanitizePayload(payload)
  const state = await readStateFile()
  delete state[extensionId]?.[scope]?.[key]
  await writeStateFile(state)
  return { ok: true }
}
