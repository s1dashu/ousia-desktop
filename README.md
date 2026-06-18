# Ousia Desktop

Ousia Desktop is a simplified Electron client for running pi coding agent
sessions across local projects. The app focuses on a direct chat workflow:
choose a project, start or resume a session, configure your model provider, and
let the agent work in the selected project directory.

## Status

This repository is early and pre-release. The current app is intentionally
small: sidebar navigation, chat, project/session persistence, settings, and the
Electron bridge to pi coding agent. The older Ousia extension and workspace-tab
surfaces are not part of this branch.

## Features

- Electron + Vite + React desktop shell.
- Project and session navigation in the sidebar.
- Chat streaming backed by `@earendil-works/pi-coding-agent`.
- Per-project/session cwd isolation for agent tool execution.
- File and image attachments in the chat composer.
- Settings for language, appearance, fonts, model provider keys, model, thinking
  level, default chat directory, and agent tool mode.
- Runtime logs under `~/.ousia/logs/ousia-desktop.log`.

## Requirements

- Node.js 24 or newer.
- npm 11 or newer.
- macOS is the primary development target today. Electron Forge maker
  configuration exists for other platforms, but release packaging has not been
  fully validated on every OS.

## Getting Started

```bash
npm install
npm run start
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run check
```

Build a local Electron package:

```bash
npm run package
```

Create distributable artifacts:

```bash
npm run make
```

## Configuration

API keys can be entered in the app settings or read from the environment by the
underlying provider tooling. Settings are stored in Electron's app data
directory, including configured provider keys. Treat that local state as
sensitive.

Unsigned local macOS packages work without Apple credentials. To sign and
notarize macOS builds, set:

```bash
APPLE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
APPLE_ID="you@example.com"
APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
APPLE_TEAM_ID="TEAMID"
```

## Project Context

The high-signal project notes live in `AGENTS.md`. More detailed context:

- `docs/product-context.md`
- `docs/design-context.md`
- `docs/technical-architecture.md`
- `docs/development-state.md`
- `docs/streamdown.md`
- `docs/shadcn-reference.md`

## Third-Party Assets

The bundled CJK fonts are distributed under the SIL Open Font License 1.1.
Their license files are kept alongside the font files under
`src/assets/fonts/debug/`. See `NOTICE` for details.

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` before opening a pull
request, and run `npm run check` before submitting changes.

## License

Ousia Desktop is licensed under the MIT License. See `LICENSE`.
