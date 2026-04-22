---
action: context
tool: (edit|write)
event: after
name: use-context-service
description: Use Context.Service instead of legacy ServiceMap.Service APIs
glob: '**/*.ts'
detector: ast
pattern: ServiceMap.Service
level: warning
suggestSkills:
    - effect-service-implementation
---

# Use `Context.Service` Instead of `ServiceMap.Service`

```haskell
-- Transformation
ServiceMap.Service :: <S>() -> String -> Service  -- beta.43-era API
Context.Service    :: <S>() -> String -> Service  -- beta.46 API
```

```haskell
-- Pattern
bad :: Service definition
bad = class MyService extends ServiceMap.Service<MyService>()(
  "@app/MyService",
  { ... }
)

good :: Service definition
good = class MyService extends Context.Service<MyService>()(
  "@app/MyService",
  { ... }
)
```

Effect v4 beta.46 renamed the `ServiceMap` module to `Context` across exports, docs, and tests. Use `Context.Service` for service definitions, and update any related imports/accessors (`ServiceMap.get` -> `Context.get`, `effect/ServiceMap` -> `effect/Context`).

`Context.Service` gives you service identity and lookup. It does not replace explicit layer design:

- export `layer` to expose the real dependency graph
- export `defaultLayer` only when there are unsatisfied requirements to wire
- capture dependencies in `Layer.effect`, not hidden module globals
- access services with `yield* MyService` or `MyService.use(...)`
