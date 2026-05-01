---
action: context
tool: (edit|write)
event: after
name: use-filesystem-service
description: Use FileSystem service instead of direct Node.js fs imports
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["''](?:node:)?fs["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
constraints:
    SPEC:
        regex: '^["''](?:node:)?fs["'']$'
level: high
suggestSkills:
    - effect-filesystem
---

# Use FileSystem Service Instead of `fs`

```haskell
-- Transformation
import "node:fs"    :: Node → IO a        -- platform-coupled, untestable
import "fs"         :: Node → IO a        -- same problem

-- Instead
FileSystem          :: Effect a FileSystem  -- platform-agnostic
```

```haskell
-- Pattern
bad :: FilePath → IO String
bad path = fs.readFileSync path "utf-8"   -- R = Node, untestable

good :: FilePath → Effect String FileSystem
good path = do
  fs ← FileSystem.FileSystem
  fs.readFileString path                  -- R ⊃ FileSystem, portable

-- Platform provision at entry point
main :: Effect () (FileSystem | Console | ...)
main = program
  & provide BunContext.layer    -- or NodeContext.layer
  & runMain
```

Direct `fs` imports couple code to Node.js. Use `@effect/platform` FileSystem for portability across Node, Bun, and browser.
