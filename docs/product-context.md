# Product Context

## Product Shape

Ousia is a programmable desktop agent client. The core product bet is that the app itself is widget-native: native UI surfaces are assembled from widgets, and users can ask an agent to create or modify widgets during normal use.

The intended first version is not an extension ecosystem. It is live widget authoring inside a desktop agent client.

## MVP Scope

Current MVP scope:

- Three-column desktop shell: sidebar, chat area, workspace.
- Project list in sidebar.
- Session list under each project.
- Real chat with pi coding agent.
- pi tools available through the agent: read, write, edit, bash, grep, find, ls.
- Workspace tabs as the first customizable widget surface.
- Project-aware agent cwd: selected project path becomes the agent work dir.
- User-configurable default work dir, defaulting to `~/Desktop`.

Deferred scope:

- Full extension host.
- Plugin marketplace.
- Sandboxed third-party widget execution.
- Native widget packaging/distribution.
- AI-generated session titles.
- Deep settings for all model/provider/runtime parameters.

## Product Principles

- Widgets are React components.
- Widgets should be as generic as possible, with minimal custom protocol for agents to learn.
- The app's own native interface should also be composed from widget-like components.
- Users should be able to replace native surfaces over time, but the MVP starts with workspace widgets.
- The workspace should remain open and free-form, not forced into a review/code-only surface.

## Current User-Facing Concepts

- Project: a local directory the agent can work inside.
- Session: a conversation under a project.
- Workspace: right-side open surface for widgets such as browser, editor, terminal, custom views.
- Default work dir: initial directory used to create the default project, currently `~/Desktop`.
