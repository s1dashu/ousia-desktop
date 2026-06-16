const { cpSync, existsSync, readdirSync, rmSync } = require("node:fs")
const { join } = require("node:path")

const { MakerDeb } = require("@electron-forge/maker-deb")
const { MakerDMG } = require("@electron-forge/maker-dmg")
const { MakerRpm } = require("@electron-forge/maker-rpm")
const { MakerSquirrel } = require("@electron-forge/maker-squirrel")
const { MakerZIP } = require("@electron-forge/maker-zip")
const { VitePlugin } = require("@electron-forge/plugin-vite")

const appBundleId = "com.ousia.desktop"
const macSignIdentity = "Developer ID Application: hongxia sun (9UXM7M6CX5)"
const macIcon = join(__dirname, "assets", "icon.icns")

module.exports = {
  packagerConfig: {
    name: "Ousia",
    executableName: "Ousia",
    appBundleId,
    appCategoryType: "public.app-category.developer-tools",
    icon: macIcon,
    osxSign: {
      identity: macSignIdentity,
      hardenedRuntime: true,
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
    asar: {
      unpack: "**/node_modules/node-pty/**/*",
    },
    ignore: (file) => {
      if (!file) {
        return false
      }

      const includedSubtrees = [
        "/.vite",
        "/node_modules/node-pty",
        "/node_modules/node-addon-api",
      ]

      if (file === "/package.json" || file === "/node_modules") {
        return false
      }

      return !includedSubtrees.some(
        (includedPath) =>
          file === includedPath || file.startsWith(`${includedPath}/`)
      )
    },
  },
  hooks: {
    postPackage: async (_config, { outputPaths, platform }) => {
      if (platform !== "darwin") {
        return
      }

      for (const outputPath of outputPaths) {
        const appBundleName = readdirSync(outputPath).find((entry) =>
          entry.endsWith(".app")
        )

        if (!appBundleName) {
          continue
        }

        const resourcesPath = join(
          outputPath,
          appBundleName,
          "Contents",
          "Resources"
        )
        if (!existsSync(resourcesPath)) {
          continue
        }

        const terminalResourcePath = join(resourcesPath, "terminal")
        rmSync(terminalResourcePath, { force: true, recursive: true })
        cpSync("src/features/terminal/resources", terminalResourcePath, {
          recursive: true,
        })
      }
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerDMG(
      {
        icon: macIcon,
        additionalDMGOptions: {
          "code-sign": {
            "signing-identity": macSignIdentity,
            identifier: appBundleId,
          },
        },
      },
      ["darwin"]
    ),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/electron/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/electron/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
}
