import { useEffect, useRef } from "react"
import { Excalidraw, THEME } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"

import type { ExtensionProps } from "@/extensions/types"

type ExcalidrawScene = {
  elements: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

type OpenExcalidrawArgs = {
  path: string
  name?: string
  projectPath?: string
  scene?: ExcalidrawScene
}

type ExcalidrawApi = {
  updateScene: (sceneData: ExcalidrawScene) => void
  scrollToContent: (elements?: unknown[]) => void
}

type PendingOpenFile = {
  args: OpenExcalidrawArgs
  projectPath: string
  requestId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isOpenExcalidrawArgs(value: unknown): value is OpenExcalidrawArgs {
  if (!isRecord(value) || typeof value.path !== "string") {
    return false
  }
  if (value.scene === undefined) {
    return true
  }
  return isRecord(value.scene) && Array.isArray(value.scene.elements)
}

export function ExcalidrawExtension({ context }: ExtensionProps) {
  const apiRef = useRef<ExcalidrawApi | null>(null)
  const lastActionIdRef = useRef("")
  const pendingOpenFileRef = useRef<PendingOpenFile | null>(null)
  const excalidrawTheme =
    context.theme.resolved === "dark" ? THEME.DARK : THEME.LIGHT

  useEffect(() => {
    const action = context.action
    if (
      !action ||
      action.requestId === lastActionIdRef.current ||
      action.extensionId !== "extension.firstParty.excalidraw"
    ) {
      return
    }
    if (action.action === "openAndFocus") {
      lastActionIdRef.current = action.requestId
      return
    }
    if (action.action !== "openFile" || !isOpenExcalidrawArgs(action.args)) {
      lastActionIdRef.current = action.requestId
      return
    }

    const args = action.args
    const api = apiRef.current
    if (!api) {
      pendingOpenFileRef.current = {
        args,
        projectPath: context.project.path,
        requestId: action.requestId,
      }
      return
    }

    lastActionIdRef.current = action.requestId
    openFile(api, args, args.projectPath ?? context.project.path)
  }, [context.action, context.project.path])

  return (
    <section className="h-full min-h-0 overflow-hidden bg-background">
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api
          const pending = pendingOpenFileRef.current
          if (!pending) {
            return
          }
          pendingOpenFileRef.current = null
          lastActionIdRef.current = pending.requestId
          openFile(api, pending.args, pending.args.projectPath ?? pending.projectPath)
        }}
        theme={excalidrawTheme}
        name="Ousia Excalidraw"
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
          },
        }}
      />
    </section>
  )
}

function openFile(
  api: ExcalidrawApi,
  args: OpenExcalidrawArgs,
  projectPath: string
) {
  queueMicrotask(() => {
    if (args.scene) {
      loadScene(api, args.scene)
      return
    }
    void loadSceneFromFile(api, args.path, projectPath)
  })
}

function loadScene(api: ExcalidrawApi, scene: ExcalidrawScene) {
  api.updateScene({
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
  })
  api.scrollToContent(scene.elements)
}

async function loadSceneFromFile(
  api: ExcalidrawApi,
  path: string,
  projectPath: string
) {
  if (!window.ousia) {
    return
  }
  try {
    const file = await window.ousia.readEditorFile({ projectPath, path })
    const scene = JSON.parse(file.content) as unknown
    if (isRecord(scene) && Array.isArray(scene.elements)) {
      api.updateScene({
        elements: scene.elements,
        appState: isRecord(scene.appState) ? scene.appState : undefined,
        files: isRecord(scene.files) ? scene.files : undefined,
      })
      api.scrollToContent(scene.elements)
    }
  } catch {
    // Restoring a workspace tab should not crash the whole extension.
  }
}
