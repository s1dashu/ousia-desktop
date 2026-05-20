# shadcn Reference

This repo keeps a generated shadcn/ui reference project under `ref/` so agents can compare local component edits against the upstream preset output before changing UI primitives.

## Reference Project

Generated with:

```bash
npx shadcn@latest init --preset bIkfG5o --base base --template vite --pointer --name shadcn-bIkfG5o-base-vite --cwd ref/shadcn-bIkfG5o-base-vite --yes
npx shadcn@latest add select --cwd ref/shadcn-bIkfG5o-base-vite/shadcn-bIkfG5o-base-vite --yes
```

Reference root:

```text
ref/shadcn-bIkfG5o-base-vite/shadcn-bIkfG5o-base-vite
```

Important reference files:

- `ref/shadcn-bIkfG5o-base-vite/shadcn-bIkfG5o-base-vite/components.json`
- `ref/shadcn-bIkfG5o-base-vite/shadcn-bIkfG5o-base-vite/src/index.css`
- `ref/shadcn-bIkfG5o-base-vite/shadcn-bIkfG5o-base-vite/src/components/ui/select.tsx`
- `ref/shadcn-bIkfG5o-base-vite/shadcn-bIkfG5o-base-vite/src/components/ui/button.tsx`

## Usage Rules

- Treat `ref/` as generated reference material, not app source.
- Before changing a shadcn/ui primitive in `src/components/ui/`, compare it with the matching file in `ref/`.
- Prefer keeping structure, state selectors, spacing, focus styles, and menu padding aligned with the reference unless the app has an explicit design reason to diverge.
- For theme-wide changes, update tokens in `src/index.css` such as `--radius` before rewriting many component classes.
- For local product fit, small component-level overrides are acceptable because shadcn/ui components are owned in this repo.

## Select Notes

The reference Base UI Select uses:

- `SelectContent` popup radius `rounded-md`
- `SelectGroup` with `p-1`, which creates the gap between menu edge and hovered items
- `SelectItem` radius `rounded-sm`
- item vertical padding `py-1.5`

When using Select, wrap option lists in `SelectGroup` unless there is a specific reason not to. Without the group padding, hovered items can touch the menu edge.
