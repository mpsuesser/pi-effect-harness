# scripts

Workspace-level build tooling. Not shipped to npm.

## `build-publishable.ts`

Materializes a self-contained, publish-ready copy of `pi-effect-harness` at
`harnesses/effect/dist/` with the `pi-harness-kit` workspace dependency
inlined under `dist/src/_kernel/`.

The kernel is intentionally not published as its own npm artifact (it is
internal scaffolding, not a stable library). This script gives the harness a
clean, standard-shaped tarball without forcing a separate kernel release.

### What it does

1. Copies `harnesses/effect/src/` → `harnesses/effect/dist/src/`
2. Copies `packages/harness-kit/src/` → `harnesses/effect/dist/src/_kernel/`
3. Rewrites every `from 'pi-harness-kit/X.ts'` import in `dist/src/`
   to a relative path (`../../_kernel/X.ts` etc.). Kernel-internal imports
   are already relative and need no rewriting.
4. Copies static asset directories (`skills/`, `patterns/`, `guidance/`).
5. Copies `README.md` and `LICENSE` from the workspace root.
6. Writes a fresh `dist/package.json` with `pi-harness-kit` removed from
   `dependencies`, `catalog:` references resolved to literal versions, and
   `scripts` / `devDependencies` stripped.

### Run

```sh
# from the workspace root
bun run build:publishable    # build only
bun run publish:dry          # build, then bun publish --dry-run from dist/

# CI uses:
bun run build:publishable
cd harnesses/effect/dist && bun publish --access public
```

The `dist/` directory is gitignored at the workspace root.
