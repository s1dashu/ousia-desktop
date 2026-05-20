# Development State

## Current Commands

Run full Electron development app:

```bash
npm start
```

Equivalent alias:

```bash
npm run dev
```

Run renderer-only Vite app:

```bash
npm run renderer:dev
```

Package with Electron Forge:

```bash
npm run package
```

Create distributables with Electron Forge makers:

```bash
npm run make
```

`npm run build` currently runs TypeScript project checks and then `electron-forge package`.

## Current Status

Implemented:

- shadcn Vite React app.
- Electron Forge + Vite plugin build/start pipeline.
- Neutral theme override.
- Electron main/preload bridge.
- Hidden inset Electron title bar.
- Three-column shell with resize.
- Workspace collapse/expand.
- Project/session sidebar.
- Sidebar collapse via `Command+B` or dragging the resize handle below 120px.
- Last selected project/session restored from renderer localStorage on refresh.
- Open local directory as project.
- Monaco-based workspace editor with project file navigation and save support.
- xterm.js-based workspace terminal backed by Electron main `node-pty`
  sessions.
- Create, select, rename, delete sessions.
- Full-page settings surface for default work dir, model, API key, and thinking level.
- Default work dir setting, default `~/Desktop`.
- Model, runtime API key, and thinking level settings passed into pi chat turns.
- pi coding agent session creation in Electron main.
- Agent cwd scoped to selected project.
- Esc interruption from the focused chat region/input through pi `abort()`.
- Steering messages: sending while the agent is working queues through pi
  `steer` instead of waiting for the current run to finish.
- Streamdown Markdown rendering for assistant messages, with Streamdown link safety disabled.
- Thinking block weak quote style, collapsed after completion.
- Runtime custom widgets loaded from project-local `.ousia/widgets` and global app `userData/widgets`, with automatic refresh from Electron main file watching.
- Browser widget WebAuthn account selection, with macOS Touch ID / Secure
  Enclave WebAuthn enabled when a matching keychain access group is configured.
- Workspace supports multiple open widget tab instances, close-on-hover tab
  icons, and a persistent new-tab button that opens a four-column widget picker.
- Open workspace widget tabs and the active tab are restored per project/session.
- The legacy `Widgets` overview widget is available as a widget, but is no
  longer opened as a default workspace tab.

## Known Gaps

- Project/session data is stored in renderer localStorage.
- Session message history in renderer is in-memory only for current app lifetime.
- Existing pi conversation history is persisted by pi, but not yet hydrated back into renderer UI.
- Rename/delete use local metadata only; deeper pi session file management is not implemented.
- Runtime widget file watching uses Node `fs.watch`.
- Runtime widgets are not sandboxed and currently expose only `react` as a runtime import.
- Forge packaging works; DMG/signing/notarization are not configured yet.

## Verification Notes

Recent builds pass with:

```bash
npm run typecheck
npm run lint
npm run build
```

Vite reports a large chunk warning after Streamdown integration. This is expected for now and does not block runtime.
