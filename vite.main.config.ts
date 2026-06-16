import { builtinModules } from "node:module"
import { defineConfig } from "vite"

const external = [
  "bufferutil",
  "electron",
  "esbuild",
  "utf-8-validate",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]

export default defineConfig({
  build: {
    rollupOptions: {
      external,
      output: {
        chunkFileNames: "[name].js",
      },
    },
  },
})
