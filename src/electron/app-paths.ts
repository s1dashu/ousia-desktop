import { app } from "electron"
import { join } from "node:path"

export const OUSIA_APP_NAME = "Ousia"
export const OUSIA_USER_DATA_DIR_NAME = "ousia-desktop"

export function getCanonicalUserDataPath() {
  return join(app.getPath("appData"), OUSIA_USER_DATA_DIR_NAME)
}

export function configureOusiaAppPaths() {
  app.setName(OUSIA_APP_NAME)
  app.setPath("userData", getCanonicalUserDataPath())
}
