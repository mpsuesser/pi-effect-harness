---
action: context
tool: (edit|write)
event: after
name: context-tag-extends
description: Avoid class *Tag extends Context.Tag naming - use Context.Service instead
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - pattern: 'class $A extends Context.Tag'
        - pattern: 'class $A extends Context.Tag<$$$>() { $$$ }'
        - pattern: 'Context.GenericTag<$$$>'
        - pattern: 'Context.Tag($$$)'
        - pattern: 'Effect.Service<$$$>()'
level: warning
suggestSkills:
    - effect-service-implementation
---

# Avoid `Context.Tag` and `Effect.Service` — Use `Context.Service`

```haskell
-- Anti-pattern: *Tag suffix = naming smell
class ParallelClientTag extends Context.Tag    -- removed in v4
data ParallelClientService = ...               -- separate *Service interface
-- two names for one concept = unnecessary coupling

-- Anti-pattern: Effect.Service (also removed in v4)
class ParallelClient extends Effect.Service<ParallelClient>()(...) -- removed

-- Fix: Context.Service (beta.46 API)
class ParallelClient extends Context.Service<ParallelClient>()(
  "@parallel/ParallelClient"
)
```

**`Context.Tag` and `Effect.Service` are legacy service-definition patterns.** Use `Context.Service` for concrete or interface-style services.

```typescript
// Concrete service (single implementation)
export class ParallelClient extends Context.Service<ParallelClient>()(
	'@parallel/ParallelClient'
) {}

// Interface-style service (multiple implementations, config, infrastructure)
export class Clipboard extends Context.Service<Clipboard>()(
	'@Clipboard/Clipboard'
) {}
```

- **Never** use a `*Tag` suffix — name the service directly
- `Context.Service` replaces both `Effect.Service` and `Context.Tag`
