# PLAN.md

## Purpose

Effectify `pi-effect-enforcer` into a reusable harness kernel for Pi agent harnesses while **retaining all current functionality**.

This file is intended to be the single handoff document for a fresh implementation session.

---

## Read This First In a Fresh Session

Before planning or writing code, the implementation agent should re-load the relevant local skills and references.

### Required skills to load

At minimum, load these Effect skills again in the fresh session:

- `effect-atom-state`
- `effect-layer-design`
- `effect-service-implementation`
- `effect-schema-v4`
- `effect-schema-composition`
- `effect-testing`
- `effect-context-witness`
- `effect-platform-abstraction`
- `effect-observability`
- `effect-managed-runtime`

### Required Effect references to read as needed

- `.references/effect-v4/LLMS.md`
- `.references/effect-v4/MIGRATION.md`
- `.references/effect-v4/packages/effect/SCHEMA.md`
- `.references/effect-v4/packages/effect/src/Context.ts`
- `.references/effect-v4/packages/effect/src/Layer.ts`
- `.references/effect-v4/packages/effect/src/ManagedRuntime.ts`
- `.references/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts`

### Required Pi references to read as needed

- `/Users/m/.bun/install/global/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/Users/m/.bun/install/global/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
- `/Users/m/.bun/install/global/node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts`

---

## Current Baseline State

The current branch already contains two important behavior changes that must be preserved:

1. `70e977e` — `fix(patterns): steer after writes instead of blocking`
2. `bd062d8` — `fix(policy): inspect prospective edit results`

The worktree was clean after these commits.

### Current behavior that exists today

#### 1. Effect mode / policy header
- The extension has an `effect` mode.
- When enabled, `before_agent_start` injects a policy/system prompt header.
- The header reminds the agent to load at least `MIN_EFFECT_SKILLS` effect skills and use `.references/effect-v4` if APIs are unclear.

#### 2. Skill gate
- The Effect skill gate still exists.
- It runs on `tool_call` for write tools.
- It only blocks when the prospective written content looks like Effect code and too few relevant skills have been read on the branch.
- It now evaluates **prospective output**, not mixed `oldText + newText` blobs.

#### 3. Pattern enforcement
- Pattern enforcement is **post-write feedback**, not pre-write blocking.
- Markdown pattern frontmatter currently reflects runtime semantics:
  - `event: after`
  - `action: context`
- After successful `write` / `edit`, matching pattern guidance is injected as a user-style follow-up via `pi.sendUserMessage(...)`.
- If the agent is streaming, the message is injected with `{ deliverAs: "steer" }`.

#### 4. Prospective edit precision
- For `edit`, prospective inspection reconstructs the would-be file contents by applying edit replacements against the current file.
- If reconstruction fails, fallback is **new text only**.
- Removed text must never be used in fallback.
- This precision applies to the skill gate and the write-focused projection logic.

#### 5. Loaded effect skills tracking
- Successful `read` calls to effect skill files append a custom session entry using:
  - `SKILL_LOADED_ENTRY = 'pi-effect-enforcer:skill-loaded'`
- Loaded skills are restored from branch history.
- Pending same-turn skill reads are tracked separately during in-flight tool execution.

#### 6. Existing behavior-critical files
The current imperative implementation lives mainly in:

- `src/index.ts`
- `src/inspectors.ts`
- `src/patterns.ts`
- `src/policy.ts`
- `src/skills.ts`
- `src/guidance.ts`
- `src/mode-toggle.ts`

These files are the behavior baseline, even though the target architecture will replace them.

---

## Non-Negotiable Invariants

These are the implementation invariants. Do not regress them.

### Behavioral invariants

1. **Pattern feedback remains post-write only**
   - no return to pattern-based pre-write blocking
   - current markdown pattern semantics remain preserved in behavior

2. **Skill gate remains pre-write**
   - it still blocks writes when needed
   - it evaluates prospective output, not raw mixed edit input

3. **Prospective reconstruction must remain trust-preserving**
   - if edit reconstruction fails, fallback is **new text only**
   - never inspect removed text when reconstruction fails

4. **Post-write pattern evaluation must inspect actual file contents**
   - for `tool_result` after successful `write` / `edit`, read actual file contents from disk when possible
   - fallback may use prospective projection if actual read fails

5. **User-style injection must remain unchanged**
   - idle: `pi.sendUserMessage(message)`
   - streaming: `pi.sendUserMessage(message, { deliverAs: 'steer' })`

6. **Loaded effect skill persistence must remain branch-based**
   - read skill files -> append custom entry
   - derive loaded skills from branch state on restore

7. **Effect mode semantics must remain**
   - mode id remains `effect`
   - policy header injection still occurs when enabled
   - reference clone bootstrapping still happens when needed

### Architectural invariants

1. **The new core must be host-agnostic**
   - the core should not depend directly on raw Pi event types
   - the core should return decisions, not execute Pi APIs directly

2. **Snapshot primitives are witness values, not ambient defaults**
   - use `Context.Service` witness tags for required snapshot values
   - do **not** use `Context.Reference` for required snapshot primitives

3. **Atoms are for deterministic fact derivation**
   - use atoms for monotonic / derived facts
   - do not force orchestration, file I/O, persistence, or message sending into atoms

4. **Pattern and Rule are separate concepts**
   - `Pattern` is detector substrate
   - `Rule` is policy

5. **No premature declarative rule DSL**
   - rules may be schema-modeled metadata
   - evaluation logic should stay code-backed in dedicated rule modules

6. **Runtime source should avoid direct Node platform imports**
   - use Effect platform abstractions where practical:
     - `FileSystem`
     - `Path`
     - `ChildProcessSpawner`
   - current runtime files with `node:*` imports should be migrated away over the refactor

---

## Core Architectural Decision

### The architecture to build

Use a **hybrid snapshot + atoms + services** kernel:

- **Snapshot values** as schema-backed witness services
- **Atoms** for deterministic fact derivation over those snapshots
- **Services/layers** for orchestration, I/O, persistence, policy evaluation, and coordination
- **Decision ADT** as the host-agnostic output of the core
- **Pi adapter layer** for translating raw Pi events into snapshots and decisions into Pi actions

### The key pattern that makes the whole design work

> **host adapter in, host adapter out**

The core should operate as:

> **snapshot values + atoms + services + rules -> decisions**

And the Pi-specific boundary should do only:

> **Pi event normalization + decision execution**

This is what makes the architecture reusable for other kinds of Pi harnesses.

---

## Stable Public Primitives to Create at the Root

At minimum, create these root modules:

```txt
src/
  UserMessage.ts
  ActiveBranch.ts
  Pattern.ts
  EditReplacement.ts
```

In addition, strongly create these root modules too:

```txt
src/
  WriteIntent.ts
  Rule.ts
  Decision.ts
```

### Design rule for all root primitives

Each root primitive should be a schema-backed namespace that exports:

- the value model (`Schema.Class` or tagged union)
- a required witness service `Current` via `Context.Service`
- `layer(value)`
- `atomRuntime(value)`

Example pattern:

- `UserMessage.Current`
- `UserMessage.layer(value)`
- `UserMessage.atomRuntime(value)`

The same pattern should apply to:

- `ActiveBranch`
- `EditReplacement`
- `Pattern`
- `WriteIntent`

`Context.Reference` should be reserved for optional ambient config/default knobs, not required snapshots.

---

## Concrete Target Module Tree

```txt
src/
  index.ts

  UserMessage.ts
  ActiveBranch.ts
  Pattern.ts
  EditReplacement.ts
  WriteIntent.ts
  Rule.ts
  Decision.ts

  atoms/
    user-message/
      content.ts
      normalizedContent.ts
      isEmpty.ts

    active-branch/
      entries.ts
      latestUserMessage.ts
      customEntriesByType.ts
      customMessagesByType.ts

    edit-replacement/
      occurrenceCount.ts
      resolution.ts
      resolvedSpan.ts
      isApplicable.ts

    pattern/
      toolMatches.ts
      globMatches.ts

    write-intent/
      rawContent.ts
      prospectiveContent.ts
      actualContent.ts

  kernel/
    adapters/
      pi/
        BranchSnapshot.ts
        ToolEventSnapshot.ts
        BeforeAgentStartSnapshot.ts
        DecisionExecutor.ts

    services/
      PatternCatalog.ts
      RuleCatalog.ts
      PatternMatcher.ts
      WriteProjection.ts
      RuleEngine.ts
      HarnessController.ts

    layers/
      KernelLayer.ts

  effect/
    atoms/
      active-branch/
        loadedEffectSkills.ts
        loadedEffectSkillCount.ts

      write-intent/
        containsEffectCode.ts

      user-message/
        referencedEffectSkills.ts

    services/
      EffectVersion.ts
      SkillCatalog.ts
      PendingSkillReads.ts
      GuidanceCatalog.ts
      ReferenceClone.ts
      ModeState.ts
      ModePersistence.ts
      GitBranch.ts

    rules/
      RequireLoadedSkillsForEffectWrites.ts
      SendPatternFeedbackAfterWrite.ts
      InjectEffectPolicyHeader.ts

    layers/
      EffectHarnessLayer.ts
```

This is the target module tree. It does not all need to land in one commit, but this is the intended final shape.

---

## Detailed Responsibilities by Module

## Root primitives

### `src/UserMessage.ts`

**Purpose:** canonical user-style message request for any harness.

#### Recommended scope for v1
Keep `UserMessage` intentionally narrow and string-first.
Do not over-model rich content yet unless forced by implementation.

#### Recommended exports
- `UserMessage.Value`
- `UserMessage.Delivery`
- `UserMessage.Current`
- `UserMessage.layer(value)`
- `UserMessage.atomRuntime(value)`

#### Recommended fields
- `content: string`
- `deliverAs?: 'steer' | 'followUp' | 'nextTurn'`

This must support current pattern feedback behavior directly.

#### Good atom families under `atoms/user-message/`
- `content`
- `normalizedContent`
- `isEmpty`
- later: skill mentions / intent derivation

---

### `src/ActiveBranch.ts`

**Purpose:** normalized branch snapshot, decoupled from raw Pi session-manager types.

#### Critical rule
Do **not** mirror Pi session-manager types 1:1.
Normalize only the facts the harness cares about.

#### Recommended exports
- `ActiveBranch.Entry` tagged union
- `ActiveBranch.Value`
- `ActiveBranch.Current`
- `ActiveBranch.layer(value)`
- `ActiveBranch.atomRuntime(value)`

#### Recommended entry variants
- `UserMessageEntry`
- `AssistantMessageEntry`
- `CustomEntry`
- `CustomMessageEntry`
- `CompactionEntry`
- `BranchSummaryEntry`
- `ThinkingLevelChangeEntry`
- `ModelChangeEntry`

This creates a stable harness-facing model and isolates Pi coupling to `kernel/adapters/pi/BranchSnapshot.ts`.

#### Good atom families under `atoms/active-branch/`
- `entries`
- `latestUserMessage`
- `customEntriesByType`
- `customMessagesByType`
- effect-specific: `loadedEffectSkills`, `loadedEffectSkillCount`

---

### `src/EditReplacement.ts`

**Purpose:** canonical text replacement intent and resolution domain for prospective-edit reasoning.

#### Recommended exports
- `EditReplacement.Value`
- `EditReplacement.Resolution` tagged union
- `EditReplacement.Current`
- `EditReplacement.layer(value)`
- `EditReplacement.atomRuntime(value)`

#### Recommended resolution variants
- `UniqueMatch`
- `MissingMatch`
- `AmbiguousMatch`
- `OverlappingMatch`
- `EmptyOldText`

This is the reusable core abstraction for edit reconstruction and should replace ad hoc replacement logic scattered across `inspectors.ts`.

#### Good atom families under `atoms/edit-replacement/`
- `occurrenceCount`
- `resolution`
- `resolvedSpan`
- `isApplicable`

---

### `src/Pattern.ts`

**Purpose:** detector substrate, **not policy**.

#### Important conceptual rule
`Pattern` should represent:
- what to inspect
- where to inspect
- how to inspect
- what guidance text is associated with the detection

`Pattern` should **not** directly represent:
- blocking vs feedback
- policy action
- cross-pattern orchestration

Those belong in `Rule.ts`.

#### Recommended exports
- `Pattern.Event`
- `Pattern.Detector` tagged union
- `Pattern.Value`
- `Pattern.Current`
- `Pattern.layer(value)`
- `Pattern.atomRuntime(value)`

#### Recommended decomposition
- `event`
- `toolRegex`
- `glob?`
- detector variant:
  - `Regex`
  - `Ast`
- guidance body
- suggested skills
- source path
- description
- name

#### Compatibility requirement
The existing markdown files in `patterns/*.md` remain the source format initially.
Those markdown files should be compiled into:
- one `Pattern.Value`
- one default `Rule.Definition` derived from the legacy metadata

This is how current behavior is preserved while uncoupling Pattern from Rule.

---

### `src/WriteIntent.ts`

**Purpose:** normalized representation of write/edit tool activity.

This is strongly recommended and should exist even though it was not in the user's minimum root file list.

#### Recommended exports
- `WriteIntent.Value` tagged union
- `WriteIntent.Phase`
- `WriteIntent.Current`
- `WriteIntent.layer(value)`
- `WriteIntent.atomRuntime(value)`

#### Recommended variants
- `WriteFile`
- `EditFile`

Each variant should carry enough information to support:
- raw projection
- prospective projection
- actual-result projection

#### Important fields
- `phase: 'tool_call' | 'tool_result'`
- `filePath?`
- raw content when available
- normalized `ReadonlyArray<EditReplacement.Value>` for edit operations

This file should replace the current loose record-based projection inputs.

---

### `src/Rule.ts`

**Purpose:** policy unit.

#### Recommended exports
- `Rule.Action`
- `Rule.Severity`
- `Rule.Definition`

#### Important guidance
Do **not** force a full declarative rule DSL yet.

Use:
- schema-modeled rule metadata where useful
- code-backed rule evaluation in dedicated `src/effect/rules/*.ts` modules

This avoids building a shallow or premature DSL.

---

### `src/Decision.ts`

**Purpose:** host-agnostic output of the core.

#### Recommended decision variants
- `BlockToolCall`
- `InjectUserMessage`
- `InjectSystemPrompt`
- `AppendCustomEntry`

These are enough to preserve all current behavior.

Potential future additions like `Notify` are fine later, but not required to preserve the current plugin.

---

## Kernel Pi adapters

These files are the only place that should know raw Pi event shapes.

### `src/kernel/adapters/pi/BranchSnapshot.ts`

**Purpose:** normalize Pi branch/session entries into `ActiveBranch.Value`.

This file should read Pi session entries and collapse them into the normalized union defined in `ActiveBranch.ts`.

### `src/kernel/adapters/pi/ToolEventSnapshot.ts`

**Purpose:** normalize Pi `tool_call` / `tool_result` data into `WriteIntent.Value` and any other tool snapshots.

It should map:
- write/edit tool call -> `WriteIntent` with `phase: 'tool_call'`
- write/edit tool result -> `WriteIntent` with `phase: 'tool_result'`

### `src/kernel/adapters/pi/BeforeAgentStartSnapshot.ts`

**Purpose:** normalize the state needed for policy-header injection / startup evaluation.

### `src/kernel/adapters/pi/DecisionExecutor.ts`

**Purpose:** translate `Decision.Value[]` into Pi effects and event return values.

It should map:

- `Decision.BlockToolCall` -> `tool_call` return `{ block: true, reason }`
- `Decision.InjectSystemPrompt` -> `before_agent_start` return `{ systemPrompt }` or chained result
- `Decision.InjectUserMessage` -> `pi.sendUserMessage(...)`
- `Decision.AppendCustomEntry` -> `pi.appendEntry(...)`

#### Required user-message behavior
For the pattern feedback path, preserve current semantics exactly:
- if idle -> `pi.sendUserMessage(message)`
- if streaming -> `pi.sendUserMessage(message, { deliverAs: 'steer' })`

The core should not know about this Pi-specific branching; the Pi adapter should.

---

## Kernel services

### `src/kernel/services/PatternCatalog.ts`

**Purpose:** load and compile `patterns/*.md`.

This service should:
- read markdown pattern files
- decode frontmatter/body
- build `Pattern.Value`
- derive compatibility `Rule.Definition` values from legacy frontmatter semantics

#### Compatibility requirement
The existing `patterns/*.md` files remain the source-of-truth initially.
Do not require rewriting them before the new engine works.

---

### `src/kernel/services/RuleCatalog.ts`

**Purpose:** merge rules from all sources.

It should merge:
- rules compiled from legacy markdown pattern files
- explicit code-defined rules from `src/effect/rules/*`

This is the future extensibility point for non-markdown harness rules.

---

### `src/kernel/services/PatternMatcher.ts`

**Purpose:** pure detector engine.

It should own:
- regex matching
- AST matching via `@ast-grep/napi`
- comment stripping behavior
- tool applicability
- glob applicability
- event applicability

This is the replacement for the detector logic currently embedded in `src/patterns.ts`.

---

### `src/kernel/services/WriteProjection.ts`

**Purpose:** the effectified replacement for `src/inspectors.ts`.

It should expose three concepts:
- raw projection
- prospective projection
- actual-result projection

#### Semantics to preserve exactly

##### Raw projection
Equivalent to the current mixed/raw projection concept. Keep it for generic use where needed.

##### Prospective projection
For `tool_call` on write/edit:
- `write` -> written content
- `edit` -> reconstruct would-be file content by applying replacements against current file contents
- if reconstruction fails -> fallback to **new text only**
- removed text must never appear in fallback

##### Actual-result projection
For successful `tool_result` on write/edit:
- read actual file contents from disk
- if actual read fails -> fallback to prospective projection

#### Important guidance
This service should absorb the current logic from `src/inspectors.ts`, including the trust-preserving precision fixes that already landed.

---

### `src/kernel/services/RuleEngine.ts`

**Purpose:** evaluate rules against normalized facts and return decisions.

Inputs should include combinations of:
- `ActiveBranch.Value`
- `WriteIntent.Value`
- loaded patterns
- effect-specific services/facts

Output:
- `ReadonlyArray<Decision.Value>`

This is the host-agnostic policy core.

---

### `src/kernel/services/HarnessController.ts`

**Purpose:** orchestrator service.

This should be the main controller for host events, with one method per lifecycle/event boundary.

#### Recommended methods
- `onSessionStart`
- `onSessionTree`
- `onBeforeAgentStart`
- `onToolCall`
- `onToolResult`

All should be implemented with `Effect.fn('HarnessController.methodName')`.

#### Critical rule
This service returns decisions.
It does **not** call Pi APIs directly.

---

## Effect-specific services

These services retain the current plugin's specialized behavior while living on top of the reusable kernel.

### `src/effect/services/EffectVersion.ts`

**Purpose:** detect / expose the active Effect version for reference-clone behavior and policy hints.

---

### `src/effect/services/SkillCatalog.ts`

**Purpose:** static index of available `effect-*` skills.

This is the effectified replacement for the static parts of `src/skills.ts`.

It should index available effect skills from Pi command/resource metadata and expose lookup operations.

---

### `src/effect/services/PendingSkillReads.ts`

**Purpose:** ephemeral in-flight read tracking.

This should own the current pending read map:
- `toolCallId -> skill name`

#### Critical separation
- **loaded effect skills** are derived from branch history and belong in branch atoms / normalized branch facts
- **pending same-turn reads** are transient, non-monotonic coordination state and belong in this service

Do not push this transient map into atoms.

---

### `src/effect/services/GuidanceCatalog.ts`

**Purpose:** load guidance docs and build the effect policy header.

This replaces:
- `src/guidance.ts`
- part of the string-building logic in `src/policy.ts`

It should own:
- loading the guidance docs from `packages/effect/guidance/`
- building policy header text
- listing reference paths

---

### `src/effect/services/ReferenceClone.ts`

**Purpose:** ensure the local `.references/effect-v4` clone exists and is appropriate for the detected version.

This replaces the current imperative reference bootstrap behavior and should use Effect platform abstractions where possible.

---

### `src/effect/services/ModeState.ts`

**Purpose:** in-memory enabled/disabled state for effect mode.

### `src/effect/services/ModePersistence.ts`

**Purpose:** persistence of effect mode state.

This should absorb the persistence responsibilities currently handled by `src/mode-toggle.ts`.

#### Semantics to preserve
- the effect mode still exists
- the persistence behavior stays the same in effect
- the current default project persistence semantics should remain unless intentionally changed

---

### `src/effect/services/GitBranch.ts`

**Purpose:** encapsulate branch name resolution and detached-head handling.

This isolates git/process concerns from mode persistence.

---

## Effect-specific atoms

### `src/effect/atoms/active-branch/loadedEffectSkills.ts`

**Purpose:** derive loaded effect skill names from normalized branch state.

This should replace the imperative branch scan logic currently performed in `src/skills.ts`.

### `src/effect/atoms/active-branch/loadedEffectSkillCount.ts`

**Purpose:** derive the loaded skill count from `loadedEffectSkills`.

### `src/effect/atoms/write-intent/containsEffectCode.ts`

**Purpose:** derive whether a write intent contains Effect code.

This should correspond to the current `EFFECT_CODE_RE` usage, but the decision to block remains rule-driven.

### `src/effect/atoms/user-message/referencedEffectSkills.ts`

**Purpose:** derive mentioned/required effect skill names from user messages if useful for future extensibility.

This is not required for the current behavior, but it is a good example of the intended atom expansion path.

---

## Effect-specific rules

These are the code-backed rules that retain current plugin behavior.

### `src/effect/rules/RequireLoadedSkillsForEffectWrites.ts`

**Purpose:** current pre-write skill gate.

#### Inputs
- prospective content from `WriteProjection`
- loaded effect skills from branch-derived facts
- pending same-turn reads from `PendingSkillReads`

#### Output
- `Decision.BlockToolCall`

#### Required semantics
This must preserve the currently-shipped prospective-output precision.

---

### `src/effect/rules/SendPatternFeedbackAfterWrite.ts`

**Purpose:** current post-write pattern feedback behavior.

#### Inputs
- actual file contents after successful `write` / `edit`
- matching patterns from the detector engine
- severity ordering / guidance rendering

#### Output
- `Decision.InjectUserMessage`

#### Required semantics
This rule must continue to use actual post-write contents and deliver user-style review guidance, not tool blocking.

---

### `src/effect/rules/InjectEffectPolicyHeader.ts`

**Purpose:** current `before_agent_start` system-prompt injection behavior.

#### Inputs
- effect mode enabled state
- loaded skill state
- guidance docs / reference hints

#### Output
- `Decision.InjectSystemPrompt`

This should preserve the current effect-mode header behavior.

---

## Runtime boundary and flow

## `src/index.ts` should end up thin

The final `index.ts` should be mostly host glue:

1. create a long-lived `ManagedRuntime` for the static layer graph
2. register Pi event handlers
3. normalize raw Pi events into snapshot witnesses
4. run controller methods through the runtime
5. execute returned decisions through `DecisionExecutor`

### End-to-end flow

```txt
Pi event
  -> Pi snapshot adapter
  -> ManagedRuntime.runPromise(HarnessController.onX(...))
  -> Decision[]
  -> Pi DecisionExecutor
```

### Important lifecycle note
The `ManagedRuntime` should contain the **long-lived static service graph**.
Per-event snapshot values like:
- `ActiveBranch`
- `WriteIntent`
- `UserMessage`

should be provided per invocation via witness layers, not baked permanently into the long-lived runtime.

That avoids rebuilding the entire runtime per event while keeping event data explicit.

---

## Modeling Guidance

## Use Schema-first models

For schema-backed property models, prefer:
- `Schema.Class`
- tagged unions via `Schema.Union([...]).pipe(Schema.toTaggedUnion(...))`

Use `Schema.TaggedErrorClass` for typed failures.

### Conventions to follow
- no `Schema` suffix in value names
- use `Effect.fn('Namespace.method')` for reusable effectful functions
- avoid `any`, type assertions, non-null assertions
- avoid raw `throw` in domain/service logic
- avoid `JSON.parse` / `JSON.stringify` in Effect-first code paths when schema codecs are appropriate

## Service pattern

Use the namespace-module service pattern where appropriate:
- `Interface`
- `Service`
- `layer`
- `defaultLayer` only when dependencies remain unsatisfied

For witness primitives like `UserMessage.Current`, `ActiveBranch.Current`, etc., use `Context.Service` directly as required-value witnesses.

## Atom guidance

### Good atom usage
Use atoms for:
- deterministic fact derivation
- monotonic / replayable state views
- convenient reusable local computations over snapshot values

### Do not use atoms for
- Pi event registration
- file I/O
- appending session entries
- sending Pi user messages
- in-flight coordination maps
- mode persistence

Atoms should be strong where they are strongest.
Do not force orchestration into a reactive graph.

---

## Exact Behavior Mapping from Current Implementation

The refactor must preserve these event-level behaviors.

### `session_start`
Current behavior to preserve:
- refresh cwd/effect version context
- restore loaded skills from branch state
- rebuild skill index
- sync effect mode status
- ensure reference clone when effect mode is enabled

### `session_tree`
Current behavior to preserve:
- restore loaded skills from branch state
- rebuild derived branch-aware state

### `before_agent_start`
Current behavior to preserve:
- if effect mode enabled, inject policy header / guidance
- keep effect-mode status semantics intact

### `tool_call`
Current behavior to preserve:
- if tool is `read`, detect reads of effect skill files and track pending skill reads
- when effect mode enabled and tool is a write tool, evaluate the Effect skill gate against **prospective output**
- if too few skills are loaded and Effect code is being written, block with the current-style skill gate reason
- do not perform pattern-based pre-write blocking

### `tool_result`
Current behavior to preserve:
- for successful `read` of effect skill files, append skill-loaded custom entry and update runtime read state
- if write/edit result is successful and effect mode enabled, inspect actual file contents and send post-write pattern feedback when matches occur

### Message delivery behavior to preserve
- idle -> regular `sendUserMessage`
- streaming -> `sendUserMessage(..., { deliverAs: 'steer' })`

### Current mode / UI constants worth preserving unless intentionally changed
- mode id: `effect`
- color: `#d4af37`
- effect mode description: `Enable Effect v4 guidance, skill gating, and pattern checks`
- current status text / branding semantics

---

## Pattern and Rule Compatibility Strategy

Current markdown files in `patterns/*.md` are still the compatibility source format.

### Current frontmatter reality
Patterns currently use:
- `event: after`
- `action: context`

### What the new system should do
`PatternCatalog` should compile each markdown file into:
- a detector-focused `Pattern.Value`
- a compatibility `Rule.Definition` that preserves current behavior

### Long-term direction
Over time, current markdown patterns are more like rule bundles than pure detectors.
The architecture should move toward:
- `Pattern` = detector atom/substrate
- `Rule` = "if facts are X, do Y"

But do not require converting the repository to that future format before the refactor works.

---

## Write Projection Semantics to Preserve Exactly

This is especially important because precision work already landed and must not regress.

### Raw projection
Keep a raw/generic mixed projection concept available for generic use if useful.

### Prospective projection for `tool_call`
#### `write`
- content is the written content

#### `edit`
- normalize edit blocks
- resolve each `oldText` against the current file contents
- require unique matches
- reject overlapping replacements
- reconstruct full candidate file contents when possible

### Fallback if reconstruction fails
- use **new text only**
- never use removed text
- false negatives are acceptable
- false positives from removed text are not acceptable

### Actual-result projection for `tool_result`
- for successful `write` / `edit`, read actual file contents from disk
- if actual read fails, fall back to the prospective projection

---

## Testing Strategy

Retain existing black-box behavior while adding new Effect-native tests around the new architecture.

### Existing tests that should keep passing
Current suite includes important behavior checks around:
- `test/prospective-tool-input.test.ts`
- `test/skill-gate-projection.test.ts`
- `test/pattern-enforcement.test.ts`
- `test/comment-string-false-positives.test.ts`
- `test/all-patterns-covered.test.ts`

These should remain the external behavior safety net during the refactor.

### New tests to add

#### Pure/schema tests with regular `vitest`
Use standard `vitest` for:
- primitive schema modules
- pure normalization helpers
- pure pattern/rule compilation helpers
- pure matcher helpers

Examples:
- `test/UserMessage.test.ts`
- `test/ActiveBranch.test.ts`
- `test/EditReplacement.test.ts`
- `test/PatternCatalog.test.ts`

#### Effect service tests with `@effect/vitest`
Use `@effect/vitest` for:
- `WriteProjection`
- `HarnessController`
- `RuleEngine`
- `SkillCatalog`
- `PendingSkillReads`
- `ModePersistence`
- `ReferenceClone`

#### Atom-focused tests
Test atom-derived facts directly and deterministically.
Examples:
- loaded effect skills derived from normalized branch entries
- edit replacement resolution facts
- prospective/actual content facts from `WriteIntent`

### Completion gate
Implementation is not done unless all pass:

- `bun run check`
- `bun run lint`
- `bun run test`

---

## Current-to-Target Mapping

Use this mapping when replacing old modules.

### `src/inspectors.ts`
Split into:
- `src/EditReplacement.ts`
- `src/WriteIntent.ts`
- `src/kernel/services/WriteProjection.ts`

### `src/patterns.ts`
Split into:
- `src/Pattern.ts`
- `src/kernel/services/PatternCatalog.ts`
- `src/kernel/services/PatternMatcher.ts`

### `src/policy.ts`
Split into:
- `src/Rule.ts`
- `src/Decision.ts`
- `src/kernel/services/RuleEngine.ts`
- `src/effect/rules/*`

### `src/skills.ts`
Split into:
- `src/effect/services/SkillCatalog.ts`
- `src/effect/services/PendingSkillReads.ts`
- effect-specific branch atoms for loaded skill derivation

### `src/guidance.ts`
Move to:
- `src/effect/services/GuidanceCatalog.ts`

### `src/mode-toggle.ts`
Absorb into:
- `src/effect/services/ModeState.ts`
- `src/effect/services/ModePersistence.ts`
- `src/effect/services/GitBranch.ts`
- thin adapter glue in `index.ts` during migration if needed

---

## Recommended Implementation Order

Do not try to land everything in one giant change.
Implement in slices.

### Slice 1 — foundation root primitives
Create:
- `UserMessage.ts`
- `ActiveBranch.ts`
- `EditReplacement.ts`
- `Pattern.ts`
- `WriteIntent.ts`
- `Rule.ts`
- `Decision.ts`

Goal:
- establish the value model and witness-layer pattern
- no major behavior changes yet

### Slice 2 — write projection kernel
Create:
- `src/kernel/services/WriteProjection.ts`

Port the semantics from `src/inspectors.ts` into the new service with no behavior change.
Keep current regression tests green.

### Slice 3 — pattern/rule separation
Create:
- `PatternCatalog.ts`
- `PatternMatcher.ts`
- `RuleCatalog.ts`

Goal:
- compile markdown patterns into `Pattern + Rule`
- preserve current pattern behavior exactly

### Slice 4 — effect services
Create:
- `SkillCatalog.ts`
- `PendingSkillReads.ts`
- `GuidanceCatalog.ts`
- `ReferenceClone.ts`
- `ModeState.ts`
- `ModePersistence.ts`
- `GitBranch.ts`

### Slice 5 — effect rules
Create:
- `RequireLoadedSkillsForEffectWrites.ts`
- `SendPatternFeedbackAfterWrite.ts`
- `InjectEffectPolicyHeader.ts`

Goal:
- re-express current behavior as code-backed rules that emit decisions

### Slice 6 — controller + Pi adapters
Create:
- `HarnessController.ts`
- Pi snapshot adapters
- `DecisionExecutor.ts`
- thin `index.ts` with `ManagedRuntime`

Goal:
- move orchestration into the controller
- keep Pi-specific behavior at the edge only

### Slice 7 — atoms
Create the first wave of atoms:
- `atoms/user-message/*`
- `atoms/active-branch/*`
- `atoms/edit-replacement/*`
- `effect/atoms/*`

Goal:
- realize the extensible deterministic fact layer
- do not force orchestration into atoms

### Slice 8 — remove legacy modules
Once the new engine is fully wired and tests are migrated/green:
- remove or collapse obsolete imperative modules
- keep only thin compatibility facades if still temporarily useful

---

## Suggested Commit Boundaries

These are suggested commit slices. Exact wording may change, but the boundaries are useful.

1. `feat(core): add harness snapshot primitives`
   - root primitive modules only

2. `refactor(write): move projection logic into WriteProjection service`
   - preserve existing behavior and tests

3. `refactor(patterns): split detectors from rules`
   - markdown compatibility compilation

4. `feat(effect): add skill, guidance, and mode services`
   - effect-specific service layer

5. `feat(rules): express effect policy as decisions`
   - code-backed rules returning decisions

6. `refactor(pi): route extension through controller runtime`
   - `ManagedRuntime`, adapters, decision executor

7. `feat(atoms): add reusable fact derivation atoms`
   - initial atom families

8. `refactor(core): remove legacy imperative modules`
   - cleanup / final architecture pass

---

## Practical Implementation Notes

### 1. Keep behavior green during the migration
It is acceptable to use temporary compatibility wrappers or bridge modules while migrating.
Do not optimize for theoretical purity if it makes the refactor harder to land safely.

### 2. Do not create a runtime per event
Create a long-lived `ManagedRuntime` for the static service graph.
Provide per-event snapshot witness layers when invoking controller methods.

### 3. Do not over-model `UserMessage` yet
Start string-first.
Only broaden to richer message content if the implementation proves it necessary.

### 4. Do not over-couple `ActiveBranch` to Pi internals
Normalize only the entry kinds and data the harness actually needs.

### 5. Do not reintroduce pattern blocking
Pattern feedback remains advisory post-write guidance.
Only the skill gate blocks writes.

### 6. Preserve the precision trust model
The prospective edit precision work already shipped and must survive the refactor untouched in behavior.

### 7. Use Effect platform abstractions in runtime code
When migrating runtime logic out of old imperative modules, prefer:
- `FileSystem`
- `Path`
- `ChildProcessSpawner`

Avoid new `node:*` imports in runtime source unless absolutely forced at the host boundary.

### 8. Observe important flows
Add logs/spans around:
- rule evaluation
- projection fallback paths
- pattern catalog loading
- reference clone setup
- skill read tracking

Do not bury these flows silently inside helpers.

---

## Final Summary

The architecture to build is:

> **host-agnostic Effect core built from snapshot witnesses, atoms, code-backed rules, and decision ADTs — wrapped by a very thin Pi adapter layer**

The reusable harness kernel should be:

> **snapshot values + atoms + services + rules -> decisions**

The Pi adapter should be:

> **Pi event normalization + decision execution**

That is the design that:
- preserves the current plugin's behavior
- keeps the new atom extensibility story
- avoids atom-overreach
- separates detector substrate from policy
- makes the result reusable for future Pi harnesses
- keeps the implementation aligned with Effect v4 patterns and services/layers

If starting from scratch in a fresh session, the first real move should be:

1. create the root primitives
2. move write projection into `WriteProjection`
3. split Pattern from Rule
4. only then move orchestration into a controller/runtime boundary
