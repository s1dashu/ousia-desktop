# Technical Architecture

## Stack

- Electron Forge
- Electron Forge Vite plugin
- React
- TypeScript
- shadcn/ui
- Tailwind CSS
- Electron
- Monaco Editor for the workspace editor widget
- `@pierre/trees` for the workspace editor file tree
- xterm.js + node-pty for the workspace terminal widget
- pi coding agent
- Vercel Streamdown for assistant Markdown rendering

## Build And Start Pipeline

Ousia uses Electron Forge with `@electron-forge/plugin-vite`.

Key files:

- `forge.config.cjs`
- `vite.main.config.ts`
- `vite.preload.config.ts`
- `vite.renderer.config.ts`

The package entry point is:

```json
".vite/build/main.js"
```

Forge builds separate targets for:

- Electron main process: `src/electron/main.ts`
- Electron preload: `src/electron/preload.ts`
- Renderer window: React app through `vite.renderer.config.ts`

Development start:

```bash
npm start
```

`npm run dev` is an alias for the same full Electron development app. Use `npm run renderer:dev` only when intentionally running the renderer as a plain browser page.

In development, the main process loads `MAIN_WINDOW_VITE_DEV_SERVER_URL`, injected by the Forge Vite plugin. In packaged builds, it loads the generated renderer HTML under `.vite/renderer/${MAIN_WINDOW_VITE_NAME}`.

## Process Boundary

Renderer:

- Owns the UI shell.
- Owns local project/session metadata.
- Persists project/session/app settings and the currently selected
  project/session in `localStorage`.
- Sends chat payloads to Electron preload.

Preload:

- Exposes a narrow `window.ousia` API.
- Bridges renderer to main through IPC.

Main process:

- Owns pi coding agent sessions.
- Owns terminal PTY sessions.
- Opens native directory picker.
- Routes external renderer new-window requests to the user's default browser.
- Enables Electron `<webview>` for the system browser widget and strips unsafe
  webview preferences before attachment.
- Configures the browser widget session for WebAuthn account selection and, on
  macOS, enables Electron's Touch ID / Secure Enclave platform authenticator when
  a keychain access group is configured.
- Expands `~` paths before using them as cwd.
- Creates isolated pi sessions per project/session.

## Agent Session Model

Chat payloads include:

- `projectPath`
- `sessionId`
- `prompt`
- `thinkingLevel`

Electron main caches pi sessions by:

```text
projectPath::sessionId
```

Each pi session uses:

- `cwd = selected project path`
- shared `agentDir = app userData/pi-agent`
- conversation dir under app userData grouped by project path and session id

The selected project path is therefore the default work dir for agent tools such as read/write/edit/bash.

## IPC API

Renderer-facing API is declared in:

- `src/electron/chat-types.ts`
- `src/types/ousia.d.ts`

Currently exposed on `window.ousia`:

- `sendChatMessage(payload)`
- `getChatHistory(payload)`
- `interruptChat(payload)`
- `openProjectDirectory()`
- `listEditorFiles(payload)`
- `readEditorFile(payload)`
- `saveEditorFile(payload)`
- `createTerminal(payload)`
- `writeTerminal(payload)`
- `resizeTerminal(payload)`
- `disposeTerminal(payload)`
- `listRuntimeWidgets(payload?)`
- `onChatEvent(callback)`
- `onTerminalEvent(callback)`

Chat sending is non-blocking from the renderer perspective. The main process
starts a normal pi prompt when the session is idle, and uses pi steering when a
message arrives while the session is already streaming. `interruptChat` clears
queued steering/follow-up messages and calls `AgentSession.abort()` for the
selected project/session.

The editor file APIs are project-scoped. Electron main resolves all requested
paths under the selected project root, rejects traversal outside that root, skips
large files, and ignores heavy generated directories while building the file
navigation list.

The terminal APIs are also project-scoped. Renderer widgets host xterm.js only;
Electron main creates and owns the corresponding `node-pty` process with
`cwd = selected project path`, forwards terminal output over IPC, and receives
input plus resize events from the renderer.

## Settings

App-level settings currently live in renderer `localStorage`.

Current settings:

- `defaultWorkDir`, default `~/Desktop`
- `thinkingLevel`, default `medium`
- `modelProvider`, default `deepseek`
- `modelId`, default `deepseek-v4-flash`
- `modelApiKey`, default empty

Renderer settings are stored locally, then relevant values are forwarded to pi at runtime. The current model, optional runtime API key, and thinking level are applied to the pi session before each chat turn.

## Browser WebAuthn

The system browser widget uses the `persist:ousia-browser` Electron session.
Electron requires explicit main-process setup for passkeys on macOS:

- `app.configureWebAuthn()` must be called before Touch ID / Secure Enclave
  WebAuthn requests are serviced.
- `select-webauthn-account` must be handled for the browser session; otherwise
  Electron cancels requests that return multiple discoverable credentials.
- Packaged macOS builds need a keychain access group that also appears in the
  app's `keychain-access-groups` signing entitlement.

Set one of these before launching a signed macOS build:

```bash
OUSIA_WEBAUTHN_KEYCHAIN_ACCESS_GROUP="<TEAM_ID>.com.ousia.desktop.webauthn"
```

or:

```bash
OUSIA_APPLE_TEAM_ID="<TEAM_ID>"
```

When neither variable is set, Ousia still handles WebAuthn account selection,
but it skips the macOS platform authenticator and logs a warning.

## Important Caveats

- The renderer-only page from `npm run renderer:dev` does not have Electron preload, so real pi chat only works inside the Electron window.
- macOS passkeys in the browser widget require Electron WebAuthn configuration
  plus matching signing entitlements in packaged builds. Existing passkeys from
  other browsers may not be available to Electron's app-scoped authenticator.
- Streamdown increases bundle size because it brings Markdown/code rendering support. See `docs/streamdown.md` for current link safety behavior.
- Current project/session metadata is local-only and should later move to a more durable app data store.
