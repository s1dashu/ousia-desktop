# Design Context

The `simple-gui` branch keeps the interface quiet and direct: sidebar plus chat.
Avoid reintroducing app-launcher, marketplace, tabbed workspace, right-side
workspace panels, or extension-management UI.

## Shell

- Left sidebar: projects, sessions, and settings.
- Center: chat and model controls.
- Keep resize handles thin and unobtrusive.
- Preserve current shadcn theme direction and compact desktop density.

## Icon Policy

- Use HugeIcons for all interface icons, including ordinary utility controls
  and workspace-level signals.
- Route icon imports through `src/components/icons/huge-icons.tsx` so icon
  sizing and stroke handling stay consistent.

## Settings

- Settings sections are vertically stacked.
- Do not add a left settings navigation rail.
- Appearance settings include mode and Radix color scale.
- Model settings manage provider API keys; model and thinking level selection
  stay in the chat input controls.

## Sidebar

- `会话` and `项目` are top-level sortable sections.
- Section drag overlays should cover the full section row area, including the
  empty-state row when present.
