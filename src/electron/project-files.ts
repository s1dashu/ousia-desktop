import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

import type {
  OusiaEditorFileEntry,
  OusiaEditorListFilesPayload,
  OusiaEditorListFilesResult,
  OusiaEditorReadFilePayload,
  OusiaEditorReadFileResult,
  OusiaEditorSaveFilePayload,
  OusiaEditorSaveFileResult,
  OusiaPdfFileEntry,
  OusiaPdfListFilesPayload,
  OusiaPdfListFilesResult,
  OusiaPdfReadFilePayload,
  OusiaPdfReadFileResult,
  OusiaPdfSaveFilePayload,
  OusiaPdfSaveFileResult,
} from "./chat-types.js"
import { resolveProjectFilePath, resolveProjectRoot } from "./host-paths.js"

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  ".ousia",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
])

const editorFileExtensions = new Set([
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
])

function shouldShowEditorFile(name: string) {
  if (name === "AGENTS.md" || name === "README" || name === "Dockerfile") {
    return true
  }
  return editorFileExtensions.has(extname(name).toLowerCase())
}

function shouldShowPdfFile(name: string) {
  return extname(name).toLowerCase() === ".pdf"
}

export function createProjectFilesModule() {
  async function listEditorFiles(
    payload: OusiaEditorListFilesPayload
  ): Promise<OusiaEditorListFilesResult> {
    const projectRoot = resolveProjectRoot(payload.projectPath)
    const files: OusiaEditorFileEntry[] = []
    const maxFiles = 2_000
    const maxEntries = 8_000
    let fileCount = 0

    async function walk(directory: string, depth: number) {
      if (files.length >= maxEntries) {
        return
      }

      const entries = await readdir(directory, { withFileTypes: true })
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      const directoriesToWalk: string[] = []

      for (const entry of entries) {
        if (files.length >= maxEntries) {
          return
        }

        const absolutePath = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name) && depth < 8) {
            directoriesToWalk.push(absolutePath)
            files.push({
              path: `${relative(projectRoot, absolutePath)}/`,
              name: entry.name,
              depth,
              extension: "",
              kind: "directory",
            })
          }
        }
      }

      for (const entry of entries) {
        if (files.length >= maxEntries) {
          return
        }
        if (
          fileCount >= maxFiles ||
          !entry.isFile() ||
          !shouldShowEditorFile(entry.name)
        ) {
          continue
        }

        const absolutePath = join(directory, entry.name)
        fileCount += 1
        files.push({
          path: relative(projectRoot, absolutePath),
          name: entry.name,
          depth,
          extension: extname(entry.name).slice(1).toLowerCase(),
          kind: "file",
        })
      }

      for (const absolutePath of directoriesToWalk) {
        if (files.length >= maxEntries) {
          return
        }
        await walk(absolutePath, depth + 1)
      }
    }

    await walk(projectRoot, 0)
    return { files }
  }

  async function readEditorFile(
    payload: OusiaEditorReadFilePayload
  ): Promise<OusiaEditorReadFileResult> {
    const { absoluteFilePath, projectRoot } = resolveProjectFilePath(
      payload.projectPath,
      payload.path
    )
    const fileStat = await stat(absoluteFilePath)
    if (!fileStat.isFile()) {
      throw new Error("编辑器只能打开文件。")
    }
    if (fileStat.size > 1024 * 1024) {
      throw new Error("编辑器文件不能超过 1 MB。")
    }
    const content = await readFile(absoluteFilePath, "utf8")
    return {
      content,
      path: relative(projectRoot, absoluteFilePath),
    }
  }

  async function saveEditorFile(
    payload: OusiaEditorSaveFilePayload
  ): Promise<OusiaEditorSaveFileResult> {
    const { absoluteFilePath } = resolveProjectFilePath(
      payload.projectPath,
      payload.path
    )
    const fileStat = await stat(absoluteFilePath)
    if (!fileStat.isFile()) {
      throw new Error("编辑器只能保存文件。")
    }
    await writeFile(absoluteFilePath, payload.content, "utf8")
    return { ok: true }
  }

  async function listPdfFiles(
    payload: OusiaPdfListFilesPayload
  ): Promise<OusiaPdfListFilesResult> {
    const projectRoot = resolveProjectRoot(payload.projectPath)
    const files: OusiaPdfFileEntry[] = []
    const maxFiles = 300

    async function walk(directory: string, depth: number) {
      if (files.length >= maxFiles) {
        return
      }

      const entries = await readdir(directory, { withFileTypes: true })
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      for (const entry of entries) {
        if (files.length >= maxFiles) {
          return
        }

        const absolutePath = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name) && depth < 8) {
            await walk(absolutePath, depth + 1)
          }
          continue
        }

        if (!entry.isFile() || !shouldShowPdfFile(entry.name)) {
          continue
        }

        const fileStat = await stat(absolutePath)
        files.push({
          path: relative(projectRoot, absolutePath),
          name: entry.name,
          depth,
          extension: "pdf",
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs,
        })
      }
    }

    await walk(projectRoot, 0)
    return { files }
  }

  async function readPdfFile(
    payload: OusiaPdfReadFilePayload
  ): Promise<OusiaPdfReadFileResult> {
    const { absoluteFilePath, projectRoot } = resolveProjectFilePath(
      payload.projectPath,
      payload.path
    )
    const fileStat = await stat(absoluteFilePath)
    if (!fileStat.isFile() || !shouldShowPdfFile(absoluteFilePath)) {
      throw new Error("PDF 编辑器只能打开 PDF 文件。")
    }
    if (fileStat.size > 60 * 1024 * 1024) {
      throw new Error("PDF 文件不能超过 60 MB。")
    }
    const content = await readFile(absoluteFilePath)
    return {
      contentBase64: content.toString("base64"),
      path: relative(projectRoot, absoluteFilePath),
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    }
  }

  async function savePdfFile(
    payload: OusiaPdfSaveFilePayload
  ): Promise<OusiaPdfSaveFileResult> {
    const { absoluteFilePath, projectRoot } = resolveProjectFilePath(
      payload.projectPath,
      payload.path
    )
    const fileStat = await stat(absoluteFilePath)
    if (!fileStat.isFile() || !shouldShowPdfFile(absoluteFilePath)) {
      throw new Error("PDF 编辑器只能保存 PDF 文件。")
    }
    await writeFile(
      absoluteFilePath,
      Buffer.from(payload.contentBase64, "base64")
    )
    const nextStat = await stat(absoluteFilePath)
    return {
      ok: true,
      path: relative(projectRoot, absoluteFilePath),
      size: nextStat.size,
      mtimeMs: nextStat.mtimeMs,
    }
  }

  return {
    listEditorFiles,
    listPdfFiles,
    readEditorFile,
    readPdfFile,
    saveEditorFile,
    savePdfFile,
  }
}
