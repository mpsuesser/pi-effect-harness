# AGENTS.md — pi-effect-enforcer

a harness specifically for writing Effect v4 code

## Build / Lint / Test Commands

```sh
bun run check          # format + lint + typecheck
bun run test           # vitest run (all tests)
bun run fmt            # dprint format
bun run fmt:check      # dprint check (no write)
bun run lint           # oxlint
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
bun run check && bun run test
```

## Project Structure

```
src/             Source modules
test/            Test files — one per source module
patterns/        Pattern definitions (markdown with YAML frontmatter)
skills/          Effect v4 skill files
dprint.json      Formatter config (dprint)
oxlintrc.json    Linter config (oxlint)
vitest.config.ts Test config
```

Single-package project. Bun is the package manager. No monorepo tooling.
