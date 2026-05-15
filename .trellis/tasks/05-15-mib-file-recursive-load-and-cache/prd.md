# MIB File Recursive Load and Cache

## Goal
Support recursive folder scanning for MIB files and cache parsed results to disk for fast auto-loading on startup.

## Requirements

1. **Recursive folder scan**: `parseDirectory` recursively scans all subdirectories for .my/.mib/.txt files
2. **JSON cache**: After parsing, serialize `MibNode[]` to JSON in app user data directory
3. **Auto-load on startup**: App checks for cache file on launch, loads it silently if present
4. **Cache invalidation**: User can manually clear cache via UI (optional, nice to have)

## Acceptance Criteria

- [x] Selecting a top-level folder finds MIB files in all nested subdirectories
- [x] Parsed MIB tree is saved as JSON to app userData directory after each load
- [x] App startup auto-loads cached data without user interaction
- [x] Subsequent MIB file loads merge with cached data and update cache

## Bug Fixes (2026-05-15)

### IMPORTS section parsed as definitions
- **Root cause**: `parseObjectTypes`/`parseObjectIdentities`/`parseNotificationTypes` received full MIB content including the IMPORTS section. Regex patterns matched imported symbols (e.g., `MODULE-IDENTITY,`, `OBJECT-TYPE,`, `Counter32,`) as node definitions.
- **Impact**: 9011 invalid nodes with `module: "IMPORTS"`, 16624 nodes with empty OIDs, 3849 orphan nodes at root level.
- **Fix**: Added `stripImportsSection()` helper in `parser.ts` to remove `IMPORTS ... ;` block before parsing definitions.

### Renderer OID resolution incorrect
- **Root cause**: `buildTreeFromNodes` in `mibTreeUtils.ts` reconstructed OIDs using `parentOid.{childIndex}` (array position), which does not correspond to the actual OID component.
- **Fix**: Updated to prefer `node.oid` numeric array from the main process when available.

### Cache invalidation
- Added `CACHE_VERSION` constant in `handlers.ts`. Old caches (without version or version mismatch) are auto-deleted on startup.

## Technical Approach

### Recursive scan
- Change `parseDirectory` in `parser.ts` to use recursive `readdirSync` with `{ withFileTypes: true }`
- Or use a simple recursive helper that walks directories

### Cache storage
- Path: `app.getPath('userData')/mib-cache.json`
- Content: `{ modules: MibModule[], nodes: MibNode[], timestamp: number }`
- Save after every successful parse operation
- Load on app `ready` event, populate `mibNodes` and `accumulatedModules`

### Auto-load flow
- In `index.ts` (main process), after `registerIpcHandlers()`, call `loadCachedMibTree()`
- If cache exists, populate `mibNodes` and `accumulatedModules`
- Renderer queries `mib:get-tree` as usual and gets cached data

## Out of Scope
- Cache versioning / invalidation by file modification time
- UI for managing cache
- Compression of cache file

## Technical Notes
- Key files: `parser.ts`, `handlers.ts`, `index.ts` (main process)
- `app.getPath('userData')` gives platform-specific config directory
