# Runtime Widgets

Runtime widgets are user-writable React widgets loaded into workspace tabs without changing the app source.

## Widget Locations

Ousia scans two directories:

- Project-local widgets: `<project>/.ousia/widgets`
- Global widgets: Electron `userData/widgets`

Project-local widgets are the preferred path for agent-authored widgets because the coding agent runs with the selected project as its working directory.

## Pi Skill Route

Ousia development currently uses pi as the in-app coding agent. The widget-authoring skill lives only under pi:

```text
/Users/bytedance/.pi/agent/skills/ousia-runtime-widgets/SKILL.md
```

When an agent is asked to create, update, debug, or remove a runtime widget, route it to that skill. Do not duplicate this skill into Codex skill directories unless the development agent changes.

## File Shape

Each widget lives in its own directory:

```text
.ousia/widgets/my-widget/
  widget.json
  Widget.tsx
```

`widget.json`:

```json
{
  "id": "my-widget",
  "title": "My Widget",
  "slot": "workspace.tab",
  "entry": "Widget.tsx"
}
```

`Widget.tsx`:

```tsx
import type { WidgetProps } from "../../../src/widgets/types"

export default function MyWidget({ context }: WidgetProps) {
  return (
    <section className="my-widget">
      <style>{`
        .my-widget {
          background: var(--card);
          color: var(--card-foreground);
          min-height: 100%;
          padding: 16px;
          width: 100%;
        }

        .my-widget__title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.3;
        }

        .my-widget__body {
          margin: 4px 0 0;
          color: var(--muted-foreground);
          font-size: 12px;
          line-height: 1.5;
        }
      `}</style>
      <h3 className="my-widget__title">{context.project.name}</h3>
      <p className="my-widget__body">
        Runtime widget loaded from the selected project.
      </p>
    </section>
  )
}
```

## Current Runtime Contract

- Only `workspace.tab` is supported.
- Widget source can be `.tsx` or `.ts`.
- The widget must export a React component as `default` or named `Widget`.
- Runtime widgets can import `react`; other runtime package imports are not exposed yet.
- Type-only imports are erased during compilation.
- Runtime widget styling should be plain CSS, usually in a scoped `<style>` tag inside the component.
- Do not rely on Tailwind utilities for layout or visual styling. Runtime widget files do not update Tailwind's generated CSS, so new, arbitrary, responsive, or dynamic utility classes may silently render unstyled.
- Runtime widgets are mounted edge-to-edge in the workspace tab. The root element should set `width: 100%` and `min-height: 100%`, with no outside margin, outer wrapper card, or artificial gap from the host frame.
- Scope CSS selectors with a widget-specific root class, and use Ousia theme variables such as `--background`, `--foreground`, `--card`, `--card-foreground`, `--muted-foreground`, `--border`, `--primary`, and `--radius`.

## Refresh

Ousia watches the global and current project runtime widget directories while
the app is open. Creating, editing, or removing runtime widget files triggers an
automatic workspace widget refresh.

Compile and load errors appear as workspace tabs so the agent can see what needs
fixing.
