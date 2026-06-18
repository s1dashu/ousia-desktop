#!/usr/bin/env node

const { spawnSync } = require("node:child_process")
const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} = require("node:fs")
const { homedir } = require("node:os")
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
const osxSignBin = join(
  rootDir,
  "node_modules",
  "@electron",
  "osx-sign",
  "bin",
  "electron-osx-sign.js"
)
const packagedAppPath = join(packagedAppDir, "Ousia.app")
const buildStartedAt = Date.now()
const npmExecPath = process.env.npm_execpath
const electronVersion = require(join(
  rootDir,
  "node_modules",
  "electron",
  "package.json"
)).version
const electronCacheRoot = join(homedir(), "Library", "Caches", "electron")
const appleEnvKeys = [
  "APPLE_SIGN_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
]
const appleNetworkBypassDomains = [
  "timestamp.apple.com",
  "api.apple-cloudkit.com",
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const status = result.signal ? `signal ${result.signal}` : `exit ${result.status}`
    const error = new Error(
      `Command failed with ${status}: ${[command, ...args].join(" ")}`
    )
    error.exitCode = result.status ?? 1
    throw error
  }
  return result
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  return result
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
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

function parseScutilProxySettings(output) {
  const settings = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/)
    if (match) {
      settings[match[1]] = match[2]
    }
  }
  return settings
}

function configureNodeProxyFromSystem() {
  if (process.platform !== "darwin") {
    return
  }

  const result = capture("scutil", ["--proxy"])
  if (result.status !== 0) {
    return
  }

  const settings = parseScutilProxySettings(result.stdout)
  const proxyUrl =
    settings.HTTPSEnable === "1" &&
    settings.HTTPSProxy &&
    settings.HTTPSPort
      ? `http://${settings.HTTPSProxy}:${settings.HTTPSPort}`
      : undefined
  if (!proxyUrl) {
    return
  }

  process.env.ELECTRON_GET_USE_PROXY ||= "1"
  process.env.HTTPS_PROXY ||= proxyUrl
  process.env.https_proxy ||= proxyUrl
  process.env.HTTP_PROXY ||= proxyUrl
  process.env.http_proxy ||= proxyUrl
}

function findCachedElectronZipDir(platform, arch) {
  const fileName = `electron-v${electronVersion}-${platform}-${arch}.zip`
  const matches = listFiles(electronCacheRoot, (path) => path.endsWith(fileName))
  const newestZip = matches.sort(
    (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
  )[0]
  return newestZip ? join(newestZip, "..") : undefined
}

function rebuildNativeDmgDependencies() {
  if (npmExecPath) {
    run(process.execPath, [npmExecPath, "rebuild", ...nativeDmgDependencies])
    return
  }
  run("npm", ["rebuild", ...nativeDmgDependencies])
}

function detectDeveloperIdIdentity() {
  if (process.env.APPLE_SIGN_IDENTITY) {
    return process.env.APPLE_SIGN_IDENTITY
  }

  const result = capture("security", ["find-identity", "-v", "-p", "codesigning"])
  if (result.status !== 0) {
    return undefined
  }

  const match = result.stdout.match(/"([^"]*Developer ID Application:[^"]+)"/)
  return match?.[1]
}

function hasAppleNotarizationCredentials() {
  return Boolean(
    process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID
  )
}

function listNetworkServices() {
  const result = capture("networksetup", ["-listallnetworkservices"])
  if (result.status !== 0) {
    return []
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("An asterisk") &&
        !line.startsWith("*")
    )
}

function getProxyBypassDomains(service) {
  const result = capture("networksetup", ["-getproxybypassdomains", service])
  if (result.status !== 0) {
    return undefined
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("There aren't any bypass domains"))
}

function setProxyBypassDomains(service, domains) {
  run("networksetup", [
    "-setproxybypassdomains",
    service,
    ...(domains.length > 0 ? domains : ["Empty"]),
  ])
}

function restoreProxyBypassDomains(entries) {
  for (const entry of [...entries].reverse()) {
    try {
      setProxyBypassDomains(entry.service, entry.domains)
    } catch (error) {
      console.warn(
        `Failed to restore proxy bypass domains for ${entry.service}: ${error.message}`
      )
    }
  }
}

async function withAppleNetworkBypass(task) {
  if (process.platform !== "darwin") {
    return await task()
  }

  const restoreEntries = []
  for (const service of listNetworkServices()) {
    const domains = getProxyBypassDomains(service)
    if (!domains) {
      continue
    }

    const nextDomains = [...domains]
    for (const domain of appleNetworkBypassDomains) {
      if (!nextDomains.includes(domain)) {
        nextDomains.push(domain)
      }
    }

    if (nextDomains.length !== domains.length) {
      restoreEntries.push({ service, domains })
      setProxyBypassDomains(service, nextDomains)
    }
  }

  if (restoreEntries.length > 0) {
    console.log("Temporarily bypassing system proxy for Apple notarization hosts.")
  }

  try {
    return await task()
  } finally {
    restoreProxyBypassDomains(restoreEntries)
  }
}

function installDarwinZipExtractorPatch() {
  if (process.platform !== "darwin") {
    return
  }

  const unzipModule = require("@electron/packager/dist/unzip")
  unzipModule.extractElectronZip = async (zipPath, targetDir) => {
    mkdirSync(targetDir, { recursive: true })
    run("ditto", ["-x", "-k", zipPath, targetDir])
  }
}

async function withHiddenAppleSigningEnv(task) {
  const saved = Object.fromEntries(
    appleEnvKeys.map((key) => [key, process.env[key]])
  )
  for (const key of appleEnvKeys) {
    delete process.env[key]
  }
  try {
    return await task()
  } finally {
    for (const key of appleEnvKeys) {
      if (saved[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = saved[key]
      }
    }
  }
}

async function notarizeArtifact(artifactPath, label) {
  if (!hasAppleNotarizationCredentials()) {
    console.log(`Skipping ${label} notarization: Apple credentials are missing.`)
    return
  }

  const { notarize } = require("@electron/notarize")
  console.log(`Notarizing ${label} with Apple notarytool...`)
  await notarize({
    appPath: artifactPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
  run("xcrun", ["stapler", "validate", artifactPath])
}

function signDmg(dmgPath) {
  if (!process.env.APPLE_SIGN_IDENTITY) {
    console.log("Skipping DMG signing: APPLE_SIGN_IDENTITY is missing.")
    return
  }

  console.log(`Signing DMG: ${dmgPath}`)
  run("codesign", [
    "--force",
    "--sign",
    process.env.APPLE_SIGN_IDENTITY,
    "--timestamp",
    dmgPath,
  ])
  run("codesign", ["--verify", "--verbose=2", dmgPath])
}

function verifyAppDistribution(appPath) {
  if (process.platform !== "darwin" || !process.env.APPLE_SIGN_IDENTITY) {
    return
  }

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath])
  if (hasAppleNotarizationCredentials()) {
    run("spctl", ["-a", "-vvv", "-t", "execute", appPath])
  }
}

function verifyDmgDistribution(dmgPath) {
  if (process.platform !== "darwin") {
    return
  }

  run("hdiutil", ["verify", dmgPath])
  if (process.env.APPLE_SIGN_IDENTITY) {
    run("codesign", ["--verify", "--verbose=2", dmgPath])
  }
  if (process.env.APPLE_SIGN_IDENTITY && hasAppleNotarizationCredentials()) {
    run("spctl", ["-a", "-vvv", "-t", "install", dmgPath])
    run("spctl", [
      "-a",
      "-vvv",
      "-t",
      "open",
      "--context",
      "context:primary-signature",
      dmgPath,
    ])
  }
}

async function main() {
  const detectedIdentity = detectDeveloperIdIdentity()
  if (detectedIdentity && !process.env.APPLE_SIGN_IDENTITY) {
    process.env.APPLE_SIGN_IDENTITY = detectedIdentity
    console.log(`Using code signing identity: ${detectedIdentity}`)
  }

  for (const dir of staleDirs) {
    rmSync(dir, { force: true, recursive: true })
  }

  rebuildNativeDmgDependencies()
  configureNodeProxyFromSystem()
  installDarwinZipExtractorPatch()

  const { api } = require("@electron-forge/core")
  const electronZipDir = findCachedElectronZipDir("darwin", "arm64")
  if (electronZipDir) {
    console.log(
      `Using cached Electron ${electronVersion} zip from: ${electronZipDir}`
    )
  }

  await withHiddenAppleSigningEnv(() =>
    api.package({
      arch: "arm64",
      dir: rootDir,
      ...(electronZipDir ? { electronZipDir } : {}),
      interactive: true,
      platform: "darwin",
    })
  )

  const mainBundle = join(
    packagedAppPath,
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

  if (process.env.APPLE_SIGN_IDENTITY) {
    console.log(`Signing app: ${packagedAppPath}`)
    run(process.execPath, [
      osxSignBin,
      packagedAppPath,
      `--identity=${process.env.APPLE_SIGN_IDENTITY}`,
      "--hardened-runtime",
      "--platform=darwin",
    ])
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", packagedAppPath])
    await notarizeArtifact(packagedAppPath, "app")
    verifyAppDistribution(packagedAppPath)
  } else {
    console.log("Skipping app signing: APPLE_SIGN_IDENTITY is missing.")
  }

  await withHiddenAppleSigningEnv(() => {
    run(process.execPath, [
      forgeBin,
      "make",
      "--skip-package",
      "--arch",
      "arm64",
      "--platform",
      "darwin",
    ])
  })

  const dmgFiles = listFiles(makeDir, (path) => path.endsWith(".dmg")).filter(
    (path) => statSync(path).mtimeMs >= buildStartedAt
  )
  assert(dmgFiles.length > 0, "Forge completed without producing a fresh DMG.")

  const newestDmg = dmgFiles.sort(
    (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
  )[0]

  signDmg(newestDmg)
  await notarizeArtifact(newestDmg, "DMG")
  verifyDmgDistribution(newestDmg)

  console.log(`Fresh DMG: ${newestDmg}`)
}

withAppleNetworkBypass(main).catch((error) => {
  console.error(error)
  process.exit(error.exitCode ?? 1)
})
