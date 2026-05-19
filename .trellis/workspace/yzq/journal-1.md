# Journal - yzq (Part 1)

> AI development session journal
> Started: 2026-05-15

---



## Session 1: Dependency upgrade: React 19, Antd 6, TS 6, Vite 7

**Date**: 2026-05-15
**Task**: Dependency upgrade: React 19, Antd 6, TS 6, Vite 7
**Branch**: `master`

### Summary

Upgraded all project dependencies to latest major versions. Fixed vite version conflict with electron-vite@5. Added ESLint 9 flat config. All checks pass: TypeScript, ESLint, build, dev server.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `44c680c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: MIB tree OID construction + SNMP UI integration

**Date**: 2026-05-15
**Task**: MIB tree OID construction + SNMP UI integration
**Branch**: `master`

### Summary

Completed MIB tree OID resolution (::={ parent child } → full OID path), OID-to-name reverse lookup for SNMP results, drag-and-drop file loading, incremental MIB loading with cross-module reference resolution. Fixed OID prefix matching bug. All checks pass.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `0491286` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Bugfix: SNMP session, test connection, OID parsing, resizable panel, right-click menu

**Date**: 2026-05-15
**Task**: Bugfix: SNMP session, test connection, OID parsing, resizable panel, right-click menu
**Branch**: `master`

### Summary

Fixed 5 bugs: SNMP session creation (v1/v2c target format, v3 createV3Session, timeout ms unit), added test connection button, multi-segment OID parser for MIB files, resizable left panel with drag handle, right-click context menu on MIB nodes. All checks pass.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `44d8acb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: MIB parser fixes: IMPORTS pollution, OID construction, duplicate nodes

**Date**: 2026-05-15
**Task**: MIB parser fixes: IMPORTS pollution, OID construction, duplicate nodes
**Branch**: `master`

### Summary

Fixed three MIB parser bugs: (1) IMPORTS section was parsed as definitions causing 9011 invalid nodes - added stripImportsSection() helper, (2) OID resolution used array position instead of actual OID component - updated buildTreeFromNodes to prefer node.oid, (3) duplicate tree nodes and horizontal scroll issues in renderer. Task mib-file-recursive-load-and-cache AC all met.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `403e3f7` | (see git log) |
| `59c9aa8` | (see git log) |
| `358cb59` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: MIB tree OID dedup, orphan filter, configurable cache directory

**Date**: 2026-05-15
**Task**: MIB tree OID dedup, orphan filter, configurable cache directory
**Branch**: `master`

### Summary

Implemented three features: (1) OID-based deduplication in buildMibTree merging children/properties, (2) orphan node filtering to only show nodes traceable to iso root, (3) configurable cache directory with per-directory cache files and multi-cache auto-load on startup. Check agent found and fixed 4 issues including critical parentId inheritance bug in dedup logic.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2fc8cb8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: Left panel MIB tree optimization - verification

**Date**: 2026-05-15
**Task**: left-panel-mib-tree-optimization
**Branch**: `master`

### Summary

Verified that all three PRD requirements were already implemented: (1) OID fix via iterative parent-chain resolution in `mibTreeUtils.ts`, (2) colored icons per node type in CSS with clean tree layout, (3) right-click SNMP operations (GET, GETNEXT, GETBULK, WALK, BULK_WALK). Fixed unused import warning. Task archived.

### Main Changes

- Removed unused `InfoCircleOutlined` import from MibTreePanel.tsx

### Verification

- [OK] Typecheck passes (`npm run typecheck`)
- [OK] Lint passes (`npm run lint` - 0 errors, 0 warnings)
- [OK] All 5 acceptance criteria verified as implemented

### Git Commits

| Hash | Message |
|------|---------|
| `6d81d8c` | chore(task): archive 05-15-left-panel-mib-tree-optimization |

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: fix: stable node IDs, GETBULK flatten, sourceDir-aware cache dedup

**Date**: 2026-05-18
**Task**: fix: stable node IDs, GETBULK flatten, sourceDir-aware cache dedup
**Branch**: `master`

### Summary

Fixed 4 regression bugs: (1) MIB tree corruption from counter-based node ID collision replaced with content-derived stable IDs, (2) GETBULK empty results from net-snmp hybrid varbind format fixed with flattenBulkVarbinds helper, (3) cache persistence broken by name-based dedup replaced with sourceDir-aware reference tracking, (4) extractModuleName producing IMPORTS fixed by removing ^ anchor and stripping IMPORTS before fallback. Also extracted shared formatBytesToString utility and fixed 2 pre-existing TS2352 typecheck errors.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e45deb9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: Fix SNMP walk subtree + smart multi-column GETBULK on table

**Date**: 2026-05-19
**Task**: Fix SNMP walk subtree + smart multi-column GETBULK on table
**Branch**: `master`

### Summary

Fixed WALK/BULK_WALK on tables losing all-but-first varbind: oidInSubtree now uses .-segment boundary, subtree check runs before push, lastOid stripped of net-snmp leading dot on recursive getNext/getBulk. Empty tables now return [] instead of leaking the next sibling subtree. GETBULK on table/entry nodes fans out to every column OID under entry as repeaters via resolveBulkOids helper in MibTreePanel. Captured four executable SNMP constraints into new specs: backend/snmp-guidelines.md (segment-boundary subtree check, net-snmp leading-dot normalization, walk loop ordering) and frontend/mib-tree-snmp-ops.md (multi-column GETBULK on table/entry). Bootstrapped Trellis project (config/workflow/scripts/specs) and AGENTS.md; gitignored .claude/ and .cursor/ local agent tooling.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2a64378` | (see git log) |
| `7960e81` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: Dynamic result table + smart column ops + profile apply + UX polish

**Date**: 2026-05-19
**Task**: Dynamic result table + smart column ops + profile apply + UX polish
**Branch**: `master`

### Summary

Five UX/SNMP fixes in one task. (1) Column-node GETBULK now iterates via bulkWalk (returns all instances of that column); table/entry keep multi-OID single-PDU; scalar/leaf single-OID. (2) Empty SNMP results render inline antd Empty + status bar hint, no popups. (3) Toolbar profile dropdown apply moved from inner <span onClick> (unreachable through AntD v5/v6 menu item click path) to item-level onClick. (4) QueryPanel collapses by default; MIB tree right-click adds SET with value/type modal, gating !hasOid only (device responds with authorization). (5) ResultsPanel rewritten from static ResultRow[] to ResultSession with dynamic columns derived by longest-prefix MIB segment-boundary matching; per-op overwrite + loading; hand-rolled column resize + reorder (zero new deps); error varbinds remain in table as red tags. Captured four executable constraints: AntD Dropdown menu item click routing (component-guidelines.md), and single SNMP write path / device-level SET authority / longest-prefix segment-boundary column resolution (mib-tree-snmp-ops.md, cross-ref backend/snmp-guidelines.md Constraint 1).

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2a3b94f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
