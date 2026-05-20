# Widget Runtime

## Concept

Widgets are React components. The app shell itself is moving toward a widget-composed model:

- Sidebar widget area
- Chat widget area
- Workspace widget tabs

The MVP implements workspace tabs first.

## Current Implementation

Widget registry:

- `src/widgets/registry.ts`

Widget renderer:

- `src/widgets/WidgetSlot.tsx`

Widget context:

- `src/widgets/context.ts`

System widgets:

- `src/widgets/system/BrowserWidget.tsx`
- `src/widgets/system/EditorWidget.tsx`
- `src/widgets/system/TerminalWidget.tsx`

The system browser widget uses Electron's native `<webview>` tag. The renderer
owns the browser chrome and address bar, while Electron main enables the tag and
sanitizes attached webviews before they load remote content. It uses a shared
`persist:ousia-browser` partition so cookies, local storage, and login state
survive app restarts and are shared across projects.

The same browser partition is configured in Electron main for WebAuthn account
selection. On macOS, Touch ID / Secure Enclave passkey prompts require
`app.configureWebAuthn()` with a keychain access group supplied through
`OUSIA_WEBAUTHN_KEYCHAIN_ACCESS_GROUP` or derived from `OUSIA_APPLE_TEAM_ID`.
The keychain access group must match the packaged app's signing entitlement.

The system editor widget embeds Monaco Editor. It fills the workspace tab edge to
edge, shows a project-scoped file navigation sidebar powered by `@pierre/trees`,
and reads/saves files through Electron main IPC instead of giving the renderer
direct filesystem access.

The system terminal widget embeds xterm.js edge to edge in the workspace tab.
It does not spawn shell processes from the renderer; it sends input and resize
events through preload IPC to Electron main, where `node-pty` owns the shell
session for the selected project/session context.

Custom widget example:

- `src/widgets/custom/WidgetOverview.tsx`

Runtime widget docs:

- `docs/runtime-widgets.md`

Runtime widget authoring skill for pi:

- `/Users/bytedance/.pi/agent/skills/ousia-runtime-widgets/SKILL.md`

## Intended Direction

System widgets should be compiled into the app bundle.

Custom widgets can be written into a user-writable directory, scanned by the app, compiled by Electron main, then mounted into workspace tabs. The current MVP supports project-local `.ousia/widgets` and global app `userData/widgets`; see `docs/runtime-widgets.md`.

The long-term desired flow:

1. User asks the agent to create a widget.
2. Agent writes a widget directory under `.ousia/widgets`.
3. App compiles the widget after the workspace refresh button is clicked.
4. App registers it into workspace tabs.
5. User can interact with the widget immediately.

## Out Of Scope For MVP

- Separate Extension Host.
- Third-party marketplace.
- Security sandboxing for arbitrary remote code.
- Complex widget manifest schema.

Avoid adding heavy widget protocols too early. The user wants agents to write ordinary React components with minimal new conventions.
