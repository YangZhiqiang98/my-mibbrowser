# Left Panel MIB Tree Optimization

## Goal
Optimize the left panel MIB tree: fix empty OID bug, improve tree display to match MG-SOFT style, add right-click SNMP operations.

## What I already know

* Three issues: (1) display optimization, (2) OID values empty in detail panel, (3) right-click SNMP operations missing
* Current tree uses antd `<Tree>` with custom titles showing icon + name + inline OID
* Node detail section at bottom shows OID, Type, Access, Module, Description — OID field is **confirmed empty** from screenshot
* Right-click menu only has: Copy OID, Copy Name, Set as Query OID, Expand/Collapse All
* SNMP operations available via IPC: get, getNext, getBulk, set, walk, bulkWalk

## Image Analysis

### MG-SOFT Reference (Image #1)
- Different colored icons per node type (yellow folders=groups, green hexagon=scalars, blue cylinder=tables, pink box=entries)
- OIDs NOT shown inline in tree
- Clean, compact tree layout
- Professional node detail display

### Current Implementation (Image #2)
- antd generic icons (all same gray style)
- OID shown inline but values are empty strings
- Detail panel OID field confirmed empty
- Clean modern design but lacking type differentiation

## Root Cause Analysis

### Issue 1: Empty OID (Critical Bug)
- MIB parser creates nodes with `oid: []` and `oidString: ''`
- `buildRelationships` resolves OIDs by walking parent chains
- If parent chain is incomplete (parent MIB not loaded), `oidString` stays empty
- `buildTreeFromNodes` maps empty `oidString` → empty `oid` in renderer
- **Fix**: Use `oidDef` field to compute OID from parent chain, or display `oidDef` as fallback

### Issue 2: Display Optimization
- Duplicate icons (both `icon` prop and inline span)
- All node types use same gray antd icons
- **Fix**: Use colored icons per node type (like MG-SOFT), remove duplicate, improve tree node layout

### Issue 3: Right-Click SNMP Operations
- Missing GET, GETNEXT, GETBULK, WALK, BULK_WALK in context menu
- **Fix**: Add SNMP operation submenu to right-click menu, execute via store actions

## Requirements

1. **Fix OID display**: Ensure OID is always available and displayed in detail panel
2. **Improve tree display**: Colored icons per type, remove inline OID from tree (show in detail only), cleaner layout
3. **Add right-click SNMP operations**: GET, GETNEXT, GETBULK, WALK, BULK_WALK in context menu

## Acceptance Criteria

- [x] OID field in detail panel always shows a value (never empty)
- [x] Tree uses distinct colored icons for different node types (table/scalar/entry/column/notification)
- [x] Tree node layout is clean (name only, no inline OID)
- [x] Right-click menu has SNMP operations section (GET, GETNEXT, GETBULK, WALK, BULK_WALK)
- [x] Clicking SNMP operation executes query and shows results in results panel

## Definition of Done

* Lint / typecheck green
* Manual verification of tree display
* Right-click SNMP operations functional
* Node detail section shows complete OID

## Out of Scope

* Query panel changes
* Results panel changes
* MIB parser rewrite (only fix OID resolution)

## Technical Approach

### OID Fix
The OID resolution happens in `buildRelationships` (parser.ts). Some nodes may have unresolved OIDs if their parent isn't found. The `oidDef` field (e.g. "system 1") can be used as a fallback display. Alternatively, we can attempt to resolve OIDs in `buildTreeFromNodes` by walking up the parent chain using parentId.

**Chosen approach**: In `buildTreeFromNodes`, walk up parentId to build full OID if `oidString` is empty. This is a renderer-side fix that doesn't touch the parser.

### Tree Display
- Remove inline OID from tree node title
- Use distinct colored SVG/circle icons per node kind
- Improve `convertToDataNode` to render cleaner node titles
- Remove duplicate icon (don't set both `icon` prop and inline icon)

### Right-Click SNMP Operations
- Add SNMP operations section to `contextMenuItems`
- Operations: GET, GETNEXT, GETBULK, WALK, BULK_WALK
- Each operation: calls window.api.snmp.*, updates store with results
- Disable operations if OID is empty or not connected

## Technical Notes

* Key files: `MibTreePanel.tsx`, `appStore.ts`, `mibTreeUtils.ts`, `styles.css`
* SNMP config from store: `useAppStore(s => s.snmpConfig)`
* Results via store: `useAppStore(s => s.addResults)`
