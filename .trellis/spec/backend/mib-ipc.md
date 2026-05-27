# MIB IPC Contract

## Scenario: MIB Tree Loading Snapshots

### 1. Scope / Trigger

- Trigger: Main-process MIB load handlers update the in-memory module set and expose tree state to the renderer through IPC.
- Applies to `src/main/ipc/handlers.ts`, `src/preload/index.ts`, and renderer consumers of `window.api.mib`.
- This contract prevents duplicate full-tree IPC pulls immediately after load operations.

### 2. Signatures

```typescript
mib:open-files -> Promise<MibParseResult>
mib:open-directory -> Promise<MibParseResult>
mib:load-content(contents: Array<{ name: string; content: string }>) -> MibParseResult
mib:get-tree -> MibNode[]
```

`MibParseResult` may include:

```typescript
interface MibParseResult {
  modules: MibModule[]
  errors: MibParseError[]
  warnings: string[]
  dependencyWarnings: MibDependencyWarning[]
  tree?: MibNode[]
}
```

### 3. Contracts

- `mib:open-files`, `mib:open-directory`, and `mib:load-content` MUST return `tree` when `modules.length > 0`.
- `tree` MUST be the current full MIB tree snapshot after the accumulated module set has been updated.
- `mib:get-tree` remains the canonical hydration endpoint for app startup and cache-directory selection.
- `mib:get-tree` MUST read through the same main-side cache used by load responses.
- Main-process tree caches MUST be invalidated only when `accumulatedModules` changes.
- Parse diagnostics (`errors`, `warnings`, `dependencyWarnings`) MUST keep their existing shapes and meanings.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Dialog cancelled | Return empty parse result without `tree` |
| No active window | Return a parse error result without throwing |
| Loaded modules added or replaced | Invalidate tree cache, rebuild once, return `tree` |
| Parsed zero modules | Preserve diagnostics, do not require `tree` |
| Startup tree hydration | Renderer calls `mib:get-tree` |
| Cache directory changed | Renderer calls `mib:get-tree` after selected cache files are loaded |

### 5. Good/Base/Bad Cases

- Good: After `openFiles()` returns modules, renderer builds UI tree from `result.tree`.
- Base: If `result.tree` is absent, renderer may fall back to `mib:get-tree` for compatibility.
- Bad: Renderer calls `mib:get-tree` unconditionally after a successful load response that already contains `tree`.
- Bad: A load handler calls `buildMibTree(accumulatedModules)` directly instead of going through the shared cache helper.

### 6. Tests Required

- Unit tests should cover cache invalidation and no-rebuild reads for the pure MIB tree cache helper.
- Unit tests should cover attaching `tree` only to load results that contain parsed modules.
- Type-check must cover the shared `MibParseResult.tree` field across main, preload, and renderer.
- Renderer behavior should be verified by ensuring load paths prefer `result.tree` and retain a fallback for old responses.

### 7. Wrong vs Correct

#### Wrong

```typescript
const result = await window.api.mib.openFiles()
const nodes = await window.api.mib.getTree()
```

#### Correct

```typescript
const result = await window.api.mib.openFiles()
const nodes = result.tree ?? await window.api.mib.getTree()
```
