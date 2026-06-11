import { PDFViewer } from "@embedpdf/react-pdf-viewer"
import { useCallback, useEffect, useRef, useState } from "react"

import type { ExtensionProps } from "@/extensions/types"

type OpenPdfArgs = {
  path: string
  name?: string
  projectPath?: string
  src?: string
}

function isOpenPdfArgs(value: unknown): value is OpenPdfArgs {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { path?: unknown }).path === "string"
  )
}

export function PdfEditorExtension({ context }: ExtensionProps) {
  const [source, setSource] = useState<string>("")
  const lastActionIdRef = useRef("")

  const loadPdfFromFile = useCallback(async (path: string, projectPath: string) => {
    if (!window.ousia) {
      return
    }
    try {
      const file = await window.ousia.readPdfFile({ projectPath, path })
      const bytes = Uint8Array.from(atob(file.contentBase64), (char) =>
        char.charCodeAt(0)
      )
      const blob = new Blob([bytes], { type: "application/pdf" })
      setSource(URL.createObjectURL(blob))
    } catch {
      // Restoring a workspace tab should not crash the PDF viewer.
    }
  }, [])

  useEffect(() => {
    const action = context.action
    if (
      !action ||
      action.requestId === lastActionIdRef.current ||
      action.extensionId !== "extension.firstParty.pdfEditor"
    ) {
      return
    }
    lastActionIdRef.current = action.requestId

    if (action.action === "openAndFocus") {
      return
    }

    if (action.action !== "openFile") {
      return
    }
    if (!isOpenPdfArgs(action.args) || typeof action.args.path !== "string") {
      return
    }

    const args = action.args
    if (typeof args.src === "string") {
      queueMicrotask(() => setSource(args.src!))
      return
    }
    queueMicrotask(() => {
      void loadPdfFromFile(args.path, args.projectPath ?? context.project.path)
    })
  }, [context.action, context.project.path, loadPdfFromFile])

  return (
    <section className="h-full min-h-0 overflow-hidden bg-background text-foreground">
      <PDFViewer
        key={source || "empty"}
        config={{
          ...(source ? { src: source } : {}),
          theme: { preference: context.theme.resolved },
          annotations: { annotationAuthor: "Ousia" },
          permissions: { enforceDocumentPermissions: false },
        }}
        style={{ width: "100%", height: "100%" }}
      />
    </section>
  )
}
