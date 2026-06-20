#!/usr/bin/env node

const { notarizeExistingDmg } = require("./mac-build.cjs")

notarizeExistingDmg({ dmgPath: process.argv[2] }).catch((error) => {
  console.error(error)
  process.exit(error.exitCode ?? 1)
})
