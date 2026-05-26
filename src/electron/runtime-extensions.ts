import { existsSync, mkdirSync, watch, type FSWatcher } from "node:fs"
import { readdir, readFile, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { build } from "esbuild"
import type {
  OusiaRuntimeExtension,
  OusiaRuntimeExtensionDeletePayload,
  OusiaRuntimeExtensionDeleteResult,
  OusiaRuntimeExtensionsChangedEvent,
  OusiaRuntimeExtensionError,
  OusiaRuntimeExtensionSlot,
  OusiaRuntimeExtensionsResult,
} from "./chat-types.js"

type RuntimeExtensionAppManifest = {
  id?: unknown
  title?: unknown
  slot?: unknown
  entry?: unknown
  distribution?: unknown
}

type RuntimeExtensionPackage = {
  name?: unknown
  version?: unknown
  ousia?: {
    app?: unknown
    backend?: unknown
    permissions?: unknown
  }
}

type RuntimeExtensionModuleOptions = {
  emitRuntimeExtensionsChanged: (
    event: OusiaRuntimeExtensionsChangedEvent
  ) => void
}

const runtimeExtensionWatchDebounceMs = 1000
function getRuntimeExtensionsDir() {
  return join(homedir(), ".ousia", "extensions")
}

function isPathInside(parent: string, child: string) {
  const segment = relative(parent, child)
  return segment === "" || (!segment.startsWith("..") && !isAbsolute(segment))
}

function isRuntimeExtensionSlot(value: unknown): value is OusiaRuntimeExtensionSlot {
  return value === "workspace.tab"
}

function normalizeRuntimeExtensionId(
  packageDirname: string,
  packageJson: RuntimeExtensionPackage
) {
  const id =
    typeof packageJson.name === "string" && packageJson.name.trim()
      ? packageJson.name.trim()
      : packageDirname

  if (!id || !/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(
      "扩展包名只能包含字母、数字、点、下划线和短横线。"
    )
  }

  return id
}

function normalizeRuntimeExtensionAppManifest(
  extensionId: string,
  manifest: RuntimeExtensionAppManifest
) {
  const title =
    typeof manifest.title === "string" && manifest.title.trim()
      ? manifest.title.trim()
      : extensionId
  const slot = manifest.slot ?? "workspace.tab"
  const entry =
    typeof manifest.entry === "string" && manifest.entry.trim()
      ? manifest.entry.trim()
      : "App.tsx"

  if (!isRuntimeExtensionSlot(slot)) {
    throw new Error("当前仅支持 workspace.tab 运行时扩展插槽。")
  }
  if (entry.includes("\0") || entry.startsWith("/")) {
    throw new Error("运行时扩展应用入口必须是相对路径。")
  }
  if (
    manifest.distribution !== undefined &&
    manifest.distribution !== "user-local"
  ) {
    throw new Error(
      "运行时扩展 distribution 必须省略或设置为 user-local。"
    )
  }

  return {
    id: `extension.userLocal.${extensionId}`,
    title,
    slot,
    entry,
  }
}

async function compileRuntimeExtensionApp(sourcePath: string) {
  const result = await build({
    entryPoints: [sourcePath],
    absWorkingDir: dirname(sourcePath),
    bundle: true,
    platform: "browser",
    external: ["react"],
    format: "cjs",
    target: "es2022",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    sourcemap: "inline",
    write: false,
  })
  const output = result.outputFiles[0]?.text
  if (!output) {
    throw new Error("扩展编译未生成输出。")
  }
  return output
}

async function loadRuntimeExtension(
  extensionsDir: string,
  packageDirname: string
): Promise<
  Array<
    | { extension: OusiaRuntimeExtension; error?: never }
    | { extension?: never; error: OusiaRuntimeExtensionError }
  >
> {
  const extensionDir = resolve(extensionsDir, packageDirname)
  const packagePath = join(extensionDir, "package.json")
  try {
    const packageJson = JSON.parse(
      await readFile(packagePath, "utf8")
    ) as RuntimeExtensionPackage
    const extensionId = normalizeRuntimeExtensionId(packageDirname, packageJson)
    const normalized = normalizeRuntimeExtensionAppManifest(
      extensionId,
      (packageJson.ousia?.app ?? {}) as RuntimeExtensionAppManifest
    )
    const sourcePath = resolve(extensionDir, normalized.entry)
    if (!isPathInside(extensionDir, sourcePath)) {
      throw new Error(
        "运行时扩展应用入口必须位于扩展目录内。"
      )
    }
    const code = await compileRuntimeExtensionApp(sourcePath)
    return [
      {
        extension: {
          id: normalized.id,
          title: normalized.title,
          slot: normalized.slot,
          distribution: "user-local",
          trust: "local-user",
          extensionDir,
          sourcePath,
          code,
        },
      },
    ]
  } catch (error) {
    return [
      {
        error: {
          id: `extension.userLocal.${packageDirname}`,
          title: packageDirname,
          distribution: "user-local",
          trust: "local-user",
          extensionDir,
          sourcePath: existsSync(packagePath) ? packagePath : undefined,
          message: error instanceof Error ? error.message : String(error),
        },
      },
    ]
  }
}

async function loadRuntimeExtensionRoot(extensionsDir: string) {
  mkdirSync(extensionsDir, { recursive: true })
  const entries = await readdir(extensionsDir, { withFileTypes: true })
  return (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => loadRuntimeExtension(extensionsDir, entry.name))
    )
  ).flat()
}

function dedupeRuntimeExtensionResults(
  loaded: Array<
    | { extension: OusiaRuntimeExtension; error?: never }
    | { extension?: never; error: OusiaRuntimeExtensionError }
  >
) {
  const seenIds = new Set<string>()
  return loaded.filter((result) => {
    const id = result.extension?.id ?? result.error?.id
    if (!id || seenIds.has(id)) {
      return false
    }
    seenIds.add(id)
    return true
  })
}

export function createRuntimeExtensionModule({
  emitRuntimeExtensionsChanged,
}: RuntimeExtensionModuleOptions) {
  let watchers: FSWatcher[] = []
  let watchDirs: string[] = []
  let watchDebounce: ReturnType<typeof setTimeout> | undefined
  let watchGeneration = 0

  async function listRuntimeExtensions(): Promise<OusiaRuntimeExtensionsResult> {
    const extensionsDir = getRuntimeExtensionsDir()
    const loaded = await loadRuntimeExtensionRoot(extensionsDir)
    const deduped = dedupeRuntimeExtensionResults(loaded)
    return {
      extensionsDir,
      extensionDirs: [extensionsDir],
      extensions: deduped.flatMap((result) =>
        result.extension ? [result.extension] : []
      ),
      errors: deduped.flatMap((result) => (result.error ? [result.error] : [])),
    }
  }

  function emitChanged() {
    if (watchDebounce) {
      clearTimeout(watchDebounce)
    }
    watchDebounce = setTimeout(() => {
      watchDebounce = undefined
      emitRuntimeExtensionsChanged({ extensionDirs: watchDirs })
    }, runtimeExtensionWatchDebounceMs)
  }

  async function deleteRuntimeExtension(
    payload: OusiaRuntimeExtensionDeletePayload
  ): Promise<OusiaRuntimeExtensionDeleteResult> {
    const extensionDir = resolve(payload.extensionDir)
    const extensionsDir = getRuntimeExtensionsDir()
    if (!isPathInside(extensionsDir, extensionDir)) {
      throw new Error(
        "运行时扩展目录位于全局扩展根目录之外。"
      )
    }
    await rm(extensionDir, { recursive: true, force: true })
    emitChanged()
    return { ok: true }
  }

  function closeRuntimeExtensionWatchers(invalidate = true) {
    if (invalidate) {
      watchGeneration += 1
    }
    for (const watcher of watchers) {
      watcher.close()
    }
    watchers = []
    watchDirs = []
    if (watchDebounce) {
      clearTimeout(watchDebounce)
      watchDebounce = undefined
    }
  }

  async function watchRuntimeExtensions(): Promise<OusiaRuntimeExtensionsResult> {
    const currentGeneration = watchGeneration + 1
    watchGeneration = currentGeneration
    closeRuntimeExtensionWatchers(false)

    const result = await listRuntimeExtensions()
    if (currentGeneration !== watchGeneration) {
      return result
    }
    watchDirs = result.extensionDirs

    for (const dir of watchDirs) {
      if (currentGeneration !== watchGeneration) {
        break
      }
      mkdirSync(dir, { recursive: true })
      try {
        const watcher = watch(dir, { recursive: true }, emitChanged)
        watcher.on("error", () => {
          watcher.close()
        })
        watchers.push(watcher)
      } catch {
        try {
          const watcher = watch(dir, emitChanged)
          watcher.on("error", () => {
            watcher.close()
          })
          watchers.push(watcher)
        } catch {
          // Runtime extension refresh stays available through manual reload.
        }
      }
    }

    return result
  }

  return {
    closeRuntimeExtensionWatchers,
    deleteRuntimeExtension,
    listRuntimeExtensions,
    watchRuntimeExtensions,
  }
}
