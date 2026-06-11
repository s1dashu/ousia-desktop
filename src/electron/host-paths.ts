import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"

export function expandHomePath(path: string) {
  if (path === "~") {
    return homedir()
  }
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2))
  }
  return path
}

export function isPathInside(parent: string, child: string) {
  const segment = relative(parent, child)
  return segment === "" || (!segment.startsWith("..") && !isAbsolute(segment))
}

export function resolveProjectRoot(projectPath: string) {
  const projectRoot = resolve(expandHomePath(projectPath))
  if (!projectPath.trim() || !existsSync(projectRoot)) {
    throw new Error("请先选择项目，再打开项目资源。")
  }
  return projectRoot
}

export function resolveProjectFilePath(projectPath: string, filePath: string) {
  const projectRoot = resolveProjectRoot(projectPath)
  const absoluteFilePath = resolve(projectRoot, filePath)
  if (!isPathInside(projectRoot, absoluteFilePath)) {
    throw new Error("项目文件路径必须位于项目目录内。")
  }
  return { absoluteFilePath, projectRoot }
}
