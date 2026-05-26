import { useEffect, useRef, useState } from "react"
import { ThemeService } from "@univerjs/core"
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import UniverPresetSheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN"
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets"
import "@univerjs/preset-sheets-core/lib/index.css"

import type { ExtensionProps } from "@/extensions/types"

export function UniverSheetsExtension({ context }: ExtensionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const themeServiceRef = useRef<ThemeService | null>(null)
  const [error, setError] = useState("")
  const isDark = context.theme.resolved === "dark"

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    try {
      const { univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN),
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
          }),
        ],
      })

      univerAPI.createWorkbook({
        name: `${context.project.name || "Ousia"} 工作簿`,
      })
      const themeService = (
        univerAPI as unknown as {
          _injector?: { get?: (token: typeof ThemeService) => ThemeService }
        }
      )._injector?.get?.(ThemeService)
      themeServiceRef.current = themeService ?? null
      themeService?.setDarkMode(
        document.documentElement.classList.contains("dark")
      )

      return () => {
        themeServiceRef.current = null
        univerAPI.dispose()
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Univer 加载失败"
      queueMicrotask(() => setError(message))
    }
  }, [context.project.name])

  useEffect(() => {
    themeServiceRef.current?.setDarkMode(isDark)
  }, [isDark])

  if (error) {
    return (
      <div className="grid h-full place-items-center bg-background p-6 text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  return (
    <section className="h-full min-h-0 overflow-hidden bg-background">
      <div ref={containerRef} className="h-full min-h-0 w-full" />
    </section>
  )
}
