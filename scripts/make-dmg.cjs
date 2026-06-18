#!/usr/bin/env node

const { spawnSync } = require("node:child_process")
const { existsSync, readdirSync, readFileSync, rmSync, statSync } = require("node:fs")
const { join } = require("node:path")

const rootDir = join(__dirname, "..")
const outDir = join(rootDir, "out")
const packagedAppDir = join(outDir, "Ousia-darwin-arm64")
const makeDir = join(outDir, "make")
const staleDirs = [
  packagedAppDir,
  makeDir,
  join(outDir, "dmgroot"),
  join(outDir, "manual"),
]
const nativeDmgDependencies = ["macos-alias", "fs-xattr"]
const forgeBin = join(rootDir, "node_modules", ".bin", "electron-forge")
const buildStartedAt = Date.now()
const npmExecPath = process.env.npm_execpath

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(message)
    process.exit(1)
  }
}

function listFiles(dir, predicate) {
  if (!existsSync(dir)) {
    return []
  }

  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(path, predicate))
    } else if (predicate(path)) {
      files.push(path)
    }
  }
  return files
}

function rebuildNativeDmgDependencies() {
  if (npmExecPath) {
    run(process.execPath, [npmExecPath, "rebuild", ...nativeDmgDependencies])
    return
  }
  run("npm", ["rebuild", ...nativeDmgDependencies])
}

for (const dir of staleDirs) {
  rmSync(dir, { force: true, recursive: true })
}

rebuildNativeDmgDependencies()
run(process.execPath, [forgeBin, "package"])

const mainBundle = join(
  packagedAppDir,
  "Ousia.app",
  "Contents",
  "Resources",
  "app",
  ".vite",
  "build",
  "main2.js"
)
assert(
  existsSync(mainBundle),
  [
    `Missing packaged main bundle: ${mainBundle}`,
    `Node ${process.version} may have made Electron Forge exit before packaging finished.`,
  ].join("\n")
)

const mainBundleSource = readFileSync(mainBundle, "utf8")
assert(
  mainBundleSource.includes(".tmp") && /\.rename\(/.test(mainBundleSource),
  "Packaged app does not include atomic app-state writes."
)
assert(
  mainBundleSource.includes("appData") && mainBundleSource.includes("userData"),
  "Packaged app is missing current startup path logging."
)

run(process.execPath, [forgeBin, "make", "--skip-package"])

const dmgFiles = listFiles(makeDir, (path) => path.endsWith(".dmg")).filter(
  (path) => statSync(path).mtimeMs >= buildStartedAt
)
assert(dmgFiles.length > 0, "Forge completed without producing a fresh DMG.")

const newestDmg = dmgFiles.sort(
  (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
)[0]

if (process.platform === "darwin") {
  run("hdiutil", ["verify", newestDmg])
}

console.log(`Fresh DMG: ${newestDmg}`)
