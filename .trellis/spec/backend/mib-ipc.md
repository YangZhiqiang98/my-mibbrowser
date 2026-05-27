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
- When `accumulatedModules` becomes empty after a runtime cache-source change, the current tree snapshot MUST become `[]`; do not rebuild the standard root nodes as a visible placeholder.
- Renderer consumers that replace the MIB tree from `mib:get-tree` MUST clear selected/search UI state whose node ids are no longer present in the returned snapshot.
- Parse diagnostics (`errors`, `warnings`, `dependencyWarnings`) MUST keep their existing shapes and meanings.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Dialog cancelled | Return empty parse result without `tree` |
| No active window | Return a parse error result without throwing |
| Loaded modules added or replaced | Invalidate tree cache, rebuild once, return `tree` |
| Cache-source toggle removes the last module | `mib:get-tree` returns `[]` and the renderer shows the empty tree state immediately |
| Parsed zero modules | Preserve diagnostics, do not require `tree` |
| Startup tree hydration | Renderer calls `mib:get-tree` |
| Cache directory changed | Renderer calls `mib:get-tree` after selected cache files are loaded |

### 5. Good/Base/Bad Cases

- Good: After `openFiles()` returns modules, renderer builds UI tree from `result.tree`.
- Good: Disabling the only enabled cache directory invalidates the tree cache, returns `[]` from `mib:get-tree`, clears stale selection/search state, and shows the empty-tree UI before or after the modal closes.
- Base: If `result.tree` is absent, renderer may fall back to `mib:get-tree` for compatibility.
- Bad: Renderer calls `mib:get-tree` unconditionally after a successful load response that already contains `tree`.
- Bad: A load handler calls `buildMibTree(accumulatedModules)` directly instead of going through the shared cache helper.
- Bad: Rebuilding a standard `iso/org/dod/...` root-only tree when there are no loaded modules; users read this as stale MIB data after disabling the last cache source.

### 6. Tests Required

- Unit tests should cover cache invalidation and no-rebuild reads for the pure MIB tree cache helper.
- Unit tests should cover invalidating a populated tree and then reading it with an empty module list, asserting that the cached tree becomes `[]`.
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

#### Wrong

```typescript
setTree(buildMibTree([]))
```

#### Correct

```typescript
if (modules.length === 0) {
  setTree([])
} else {
  setTree(buildMibTree(modules))
}
```
