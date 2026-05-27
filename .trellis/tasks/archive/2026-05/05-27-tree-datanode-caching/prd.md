# Tree DataNode Caching

## Goal

Reduce repeated full-tree Ant Design `DataNode` conversion work in the MIB tree panel. This is the second remaining P1 performance task and should stay scoped to renderer-side tree render data derivation.

## Requirements

* Cache `MibTreeNodeData` to AntD `DataNode` conversion so unchanged nodes reuse existing `DataNode` objects across renders.
* Preserve current node title, icon, leaf, child order, selected node, search highlighting, double-click query OID behavior, and drag/context menu behavior.
* Avoid rebuilding the full tree when only search match highlighting changes.
* Keep the first P1 indexing utility intact and reuse it where useful.
* Do not change main-process IPC, tool-window payload contracts, or MIB loading protocol in this task.
* Do not change DataNode virtualization or AntD Tree component selection/expand semantics beyond the cache integration.

## Acceptance Criteria

* [ ] Tree data conversion is centralized in a reusable renderer utility or hook with unit coverage.
* [ ] Unchanged unhighlighted nodes preserve `DataNode` object identity across repeated builds.
* [ ] Search highlight changes rebuild only affected match/ancestor paths as needed, while unrelated branches preserve identity.
* [ ] Node double-click still sets the query OID.
* [ ] Icons and leaf/children semantics remain unchanged.
* [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Definition of Done

* Focused renderer-only code changes.
* Regression tests added for cache reuse and search-highlight invalidation behavior.
* No unrelated formatting churn.
* Commit, archive, journal record, and push before starting the next P1 task.

## Technical Approach

Extract DataNode conversion out of `MibTreePanel.tsx` into a small renderer utility that accepts the current MIB tree, search match IDs, icon resolver, and double-click callback. The utility should maintain a cache keyed by the source node object plus the node's highlighted state and child `DataNode` identities. When search matches change, rebuild the minimum branch path required by changed titles while preserving unrelated `DataNode` references.

## Out of Scope

* Tool-window context slimming.
* Main-side MIB tree cache or loading protocol optimization.
* IPC payload shape changes.
* Result rendering or SNMP operation behavior.

## Technical Notes

* Main target: `src/renderer/src/components/MibTreePanel.tsx`.
* Utility target: `src/renderer/src/utils/`.
* The prior task added `src/renderer/src/utils/mibTreeIndex.ts`; do not fold DataNode conversion into that index unless the dependency remains renderer-only and focused.
