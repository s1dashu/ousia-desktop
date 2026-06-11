import { app } from "electron"
import { existsSync, mkdirSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  createOusiaSession,
  createDefaultOusiaAppState,
  defaultOusiaAppSettings,
  OUSIA_APP_STATE_SCHEMA_VERSION,
  type OusiaAppSettings,
  type OusiaAppState,
  type OusiaAppStateSaveResult,
  type OusiaProjectRecord,
  type OusiaSessionRecord,
} from "./chat-types.js"

const appStateFileName = "app-state.json"

function appStatePath() {
  return join(app.getPath("userData"), appStateFileName)
}

function isAppState(value: unknown): value is OusiaAppState {
  if (!value || typeof value !== "object") {
    return false
  }
  const state = value as OusiaAppState
  return (
    Boolean(state.settings) &&
    state.schemaVersion === OUSIA_APP_STATE_SCHEMA_VERSION &&
    Array.isArray(state.sessions) &&
    Array.isArray(state.projects) &&
    (state.expandedProjectIds === undefined ||
      Array.isArray(state.expandedProjectIds)) &&
    typeof state.selectedProjectId === "string" &&
    typeof state.selectedSessionId === "string" &&
    typeof state.selectedWorkspaceExtensionId === "string" &&
    Boolean(state.workspaceTabs) &&
    Array.isArray(state.workspaceTabs.tabs)
  )
}

function normalizeExpandedProjectIds(state: OusiaAppState): OusiaAppState {
  const projectIds = new Set(state.projects.map((project) => project.id))
  const storedExpandedProjectIds = Array.isArray(state.expandedProjectIds)
    ? state.expandedProjectIds.filter(
        (projectId): projectId is string =>
          typeof projectId === "string" && projectIds.has(projectId)
      )
    : state.projects.map((project) => project.id)

  return {
    ...state,
    expandedProjectIds: [...new Set(storedExpandedProjectIds)],
  }
}

function normalizeSettings(settings: OusiaAppSettings): OusiaAppSettings {
  return {
    ...defaultOusiaAppSettings,
    ...settings,
  }
}

function normalizeAppState(state: OusiaAppState): OusiaAppState {
  return normalizeExpandedProjectIds({
    ...state,
    settings: normalizeSettings(state.settings),
  })
}

type LegacyProjectRecord = OusiaProjectRecord & {
  sessions?: OusiaSessionRecord[]
}

type LegacyAppState = {
  schemaVersion?: number
  settings?: OusiaAppSettings
  projects?: LegacyProjectRecord[]
  selectedProjectId?: string
  selectedSessionId?: string
  selectedWorkspaceExtensionId?: string
  expandedProjectIds?: string[]
  workspaceTabs?: OusiaAppState["workspaceTabs"]
}

function migrateLegacyAppState(value: unknown): OusiaAppState | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const legacy = value as LegacyAppState
  if (legacy.schemaVersion !== 1 || !Array.isArray(legacy.projects)) {
    return null
  }

  const fallback = createDefaultOusiaAppState()
  const sessions: OusiaSessionRecord[] = []
  const projects: OusiaProjectRecord[] = []

  for (const project of legacy.projects) {
    if (
      !project ||
      typeof project.id !== "string" ||
      typeof project.name !== "string" ||
      typeof project.path !== "string"
    ) {
      continue
    }
    const isDefaultWorkDirProject = project.id === "default-workdir"
    if (!isDefaultWorkDirProject) {
      projects.push({
        id: project.id,
        name: project.name,
        path: project.path,
      })
    }
    for (const session of project.sessions ?? []) {
      if (
        session &&
        typeof session.id === "string" &&
        typeof session.title === "string"
      ) {
        sessions.push({
          ...session,
          projectId: isDefaultWorkDirProject ? undefined : project.id,
        })
      }
    }
  }

  const selectedSession =
    sessions.find((session) => session.id === legacy.selectedSessionId) ??
    sessions[0] ??
    createOusiaSession()
  const nextSessions = sessions.length ? sessions : [selectedSession]

  return {
    ...fallback,
    settings: normalizeSettings(legacy.settings ?? fallback.settings),
    sessions: nextSessions,
    projects,
    expandedProjectIds: Array.isArray(legacy.expandedProjectIds)
      ? legacy.expandedProjectIds.filter((projectId) =>
          projects.some((project) => project.id === projectId)
        )
      : projects.map((project) => project.id),
    selectedProjectId: selectedSession.projectId ?? "",
    selectedSessionId: selectedSession.id,
    selectedWorkspaceExtensionId:
      legacy.selectedWorkspaceExtensionId ??
      fallback.selectedWorkspaceExtensionId,
    workspaceTabs: legacy.workspaceTabs ?? fallback.workspaceTabs,
  }
}

export async function loadAppState(): Promise<OusiaAppState> {
  const filePath = appStatePath()
  if (!existsSync(filePath)) {
    return createDefaultOusiaAppState()
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown
    if (isAppState(parsed)) {
      return normalizeAppState(parsed)
    }
    return migrateLegacyAppState(parsed) ?? createDefaultOusiaAppState()
  } catch {
    return createDefaultOusiaAppState()
  }
}

export async function saveAppState(
  state: OusiaAppState
): Promise<OusiaAppStateSaveResult> {
  const filePath = appStatePath()
  mkdirSync(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  return { ok: true }
}
