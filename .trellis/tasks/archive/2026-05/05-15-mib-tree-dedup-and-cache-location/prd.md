# MIB Tree Deduplication and Configurable Cache Location

## Goal

Fix MIB tree node duplication (e.g., "org" appearing multiple times), filter orphan nodes that can't resolve their parent chain, and allow users to choose a custom directory for cache file storage with auto-load of all cache files on startup.

## What I already know

### Issue 1: Orphan nodes (no parent found)
- MIB files define nodes like `system OBJECT IDENTIFIER ::= { mib-2 1 }`
- If the parent MIB (e.g., SNMPv2-SMI defining `mib-2`) is not loaded, the parent chain is incomplete
- These orphan nodes have `parentId: null` and `oid: []` but still appear in the tree as top-level items
- User wants: only one top-level node `iso` (OID 1) — no orphan top-level nodes

### Issue 2: Duplicate nodes like "org"
- `createStandardRootNodes()` creates `org` with id `root-10001`
- Many MIB files define `org OBJECT IDENTIFIER ::= { iso 3 }`, each getting a unique id like `node-5`
- `buildMibTree()` uses `nodeMap` (keyed by name) to prevent duplicate lookups, but **all nodes are pushed to `allNodes` regardless**
- `buildTreeFromNodes()` only deduplicates root nodes by `id`, not by name or OID
- Result: multiple "org" nodes in the tree, only the first (root) has children

### Issue 3: Configurable cache location
- Current cache: single `mib-cache.json` in `app.getPath('userData')`
- User wants: choose a directory to store cache files, and on startup load all cache files from that directory

### Root cause summary (from analysis)
| Stage | Issue |
|-------|-------|
| `buildMibTree` allNodes (parser.ts:454-458) | All nodes pushed to output regardless of dedup |
| `accumulatedModules` (handlers.ts:133,161,178) | Modules appended without checking if already present |
| Cache load (handlers.ts:53-78) | Restores nodes that already contain duplicates |
| `buildTreeFromNodes` (mibTreeUtils.ts:73-79) | Only deduplicates roots by `id`, not name/OID |

## Decision (ADR-lite)

**Context**: Three related issues — duplicate tree nodes, orphan nodes, and inflexible cache location.
**Decision**:
- Deduplicate by OID (not name) — same OID means same node, merge properties and children
- Hide orphan nodes directly — only nodes traceable to `iso` (1) are shown
- Each MIB directory load creates an independent cache file; startup merges all `*.json` in cache dir
- Toolbar button + folder picker dialog for cache directory selection

**Consequences**: OID-based dedup is more robust than name-based (MIB allows same name in different modules). Hidden orphans may surprise users who expect all loaded MIBs to appear — but matches user requirement of single `iso` root.

## Requirements

1. **Filter orphan nodes**: Nodes whose parent chain cannot be resolved to `iso` (1) are hidden from the tree. Only one top-level root node `iso` exists.
2. **Deduplicate by OID**: When multiple nodes share the same OID, keep one and merge: prefer standard root node, merge children and properties (description, access, etc.) from duplicates.
3. **Deduplicate accumulatedModules**: When loading a directory already present in accumulatedModules, replace rather than append.
4. **Independent cache files**: Each MIB directory load creates a separate cache file (e.g., `mib-cache-<dirname>.json`) in the chosen cache directory.
5. **Configurable cache directory**: Toolbar button opens folder picker; selected path is persisted in app config.
6. **Multi-cache auto-load**: On startup, scan the chosen cache directory for all `*.json` files, load and merge them into the tree.

## Acceptance Criteria (evolving)

- [ ] Only one top-level node "iso" (OID 1) visible in the tree
- [ ] No orphan nodes with empty OIDs at root level
- [ ] No duplicate nodes with the same OID — children and properties merged
- [ ] Reloading the same directory does not create duplicates
- [ ] User can select a custom cache directory via toolbar button
- [ ] On startup, all cache files from the chosen directory are loaded and merged
- [ ] Each MIB directory load creates an independent cache file named after the directory

## Out of Scope (explicit)

- Cache versioning by file modification time
- UI for managing/deleting individual cache files
- Compression of cache files
- Cross-module IMPORTS resolution (resolving symbols from unloaded MIBs)

## Technical Notes

- Key files: `parser.ts` (buildMibTree, buildRelationships), `handlers.ts` (IPC handlers, cache), `mibTreeUtils.ts` (renderer tree building), `index.ts` (startup)
- `app.getPath('userData')` is the current cache location
- `dialog.showOpenDialog({ properties: ['openDirectory'] })` for folder picker
