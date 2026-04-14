# AGENTS.md — pi-effect-enforcer

a harness specifically for writing Effect v4 code

## Build / Lint / Test Commands

```sh
bun run check          # lint + format + typecheck (with auto-fix)
bun run test           # vitest run (all tests)
bun run typecheck      # tsgo type-check only
```

### Running a single test

```sh
bunx vitest run test/Example.test.ts            # single file
bunx vitest run -t "some test name"              # by test name pattern
bunx vitest run test/Example.test.ts -t "match"  # file + name
```

### Verification before submitting

All three must pass:

```sh
bun run check && bun run test && bun run typecheck
```

## Project Structure

```
src/           Source modules
test/          Test files — one per source module
vite.config.ts Lint rules, formatting, test config (vite-plus)
```

Single-package project. Bun is the package manager. No monorepo tooling.
