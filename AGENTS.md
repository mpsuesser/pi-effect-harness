# AGENTS.md — pi-effect-harness

A bun workspace that publishes [`pi-effect-harness`](./harnesses/effect): a Pi extension turning the Pi coding agent into an Effect v4–aware harness. See [README.md](./README.md) for the user-facing description.

## Layout

```
packages/
  harness-kit/           Internal kernel — Effect services for rules, hooks,
                         decisions, write projection, pattern matching.
                         Wraps Pi's ExtensionAPI in an Effect runtime.
  agentsmd-undriftable/  CLI (`amdu`) for keeping AGENTS.md sections
                         deterministically generated from TypeScript source
                         via ts-morph. Independent utility, lives here for now.

harnesses/
  effect/                The published artifact (`pi-effect-harness`).
    src/                 Extension entrypoint, services, rules, hooks, atoms.
    patterns/            46 ast-grep / regex pattern detectors (md + YAML).
    skills/              41 effect-* skills loaded into Pi's /skill: namespace.
    guidance/            Markdown docs merged into the system-prompt header.
    test/                One file per source module + a few cross-cutting
                         tests (all-patterns-covered, skill-gate-projection,
                         guidance-docs-injection, comment-string-false-positives).

sandboxes/
  amdu-demo/             Throwaway projects for trying things out.
                         Treat as ephemeral.
```

The split between `harness-kit` and `harnesses/effect` is not load-bearing. Code migrates between the two as the kernel firms up. If something feels miscategorized, it probably is — move it.

## Verification

```sh
bun run check          # dprint format + oxlint + tsgo typecheck
bun run test           # vitest run

bun run check && bun run test   # what CI runs
```

Single tests:

```sh
bunx vitest run harnesses/effect/test/avoid-any.test.ts
bunx vitest run -t "blocks Effect writes"
```

`bun install` runs `effect-tsgo patch` in `prepare` to patch tsgo for Effect's type-level encoding. Expected; not a problem.

## Where to look for common changes

| Task | Start here |
|---|---|
| Add or modify a pattern | `harnesses/effect/patterns/<name>.md` + `harnesses/effect/test/<name>.test.ts`. Use `testPattern({ name, shouldMatch, shouldNotMatch })` from `test/helpers/pattern-test-harness.ts`. |
| Add or modify a skill | `harnesses/effect/skills/<name>/SKILL.md`. The skill catalog is rebuilt from Pi's command list at session start; no registration step. |
| Change what gets injected into the system prompt | `harnesses/effect/guidance/*.md` (content) or `harnesses/effect/src/services/GuidanceCatalog.ts` (composition + the runtime preview line). |
| Change a Pi event handler | `harnesses/effect/src/index.ts` (Pi-side wiring) → `HarnessController` → `RuleSet` / `HookSet`. New rules go in `src/rules/`; new hooks in `src/hooks/`. |
| Change kernel behavior | `packages/harness-kit/src/`. Decisions in `Decision.ts`, services in `kernel/services/`, rule/hook contracts in `kernel/Harness*.ts`. |
| Change how a write is projected for matching | `packages/harness-kit/src/kernel/services/WriteProjection.ts`. |
| Touch the AGENTS.md generator | `packages/agentsmd-undriftable/src/`. The `amdu` binary; markers are `<!-- amdu:begin -->` / `<!-- amdu:end -->`. |

## Conventions

This repo enforces its own harness on its own source. The Effect-first laws and pattern set live in:

- [`harnesses/effect/guidance/effect-first-development.md`](./harnesses/effect/guidance/effect-first-development.md) — the full Effect-first specification.
- [`harnesses/effect/patterns/`](./harnesses/effect/patterns/) — every pattern that would fire on a write.

Read those rather than asking how to write code here. If you find a pattern that should fire but doesn't, that's a bug in the pattern and worth fixing.

The dprint config (`dprint.json`) handles whitespace, quote style, semis, etc. — `bun run fmt` is the source of truth there. Markdown is not formatted; pattern bodies and skill content are freeform.

## Effect references

`.references/effect-v4/` is a git submodule pointing at [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol). The harness clones the same repo into end-users' projects on activation, but in this repo it's a submodule pinned alongside the dependency. Use it. Don't guess at v4 APIs — `bun run typecheck` will catch you, but reading the source is faster.

## Things in flight

A few areas to be light-handed with:

- The `harness-kit` ↔ `harnesses/effect` boundary. The kernel may eventually be lifted out as a standalone library; until then, expect occasional refactors that move code across this line.
- `packages/agentsmd-undriftable/` is being developed in-tree because it's useful for this repo's own AGENTS.md generation. It may move to its own repo later.
- `sandboxes/*` is for trying things out. Don't build durable infrastructure there.

## Reference

- [README.md](./README.md) — user-facing extension docs (skills, patterns, lifecycle).
- [CONTRIBUTING.md](./CONTRIBUTING.md) — PR workflow.
- [`pi` extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/pi-coding-agent/docs/extensions.md) — Pi's `ExtensionAPI`, lifecycle events, mode toggles.
