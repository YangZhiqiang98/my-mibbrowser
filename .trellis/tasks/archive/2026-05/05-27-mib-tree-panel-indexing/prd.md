# MIB Tree Panel Indexing

## Goal

Reduce repeated full-tree scans inside the MIB tree panel by deriving reusable lookup indexes from the loaded MIB tree. This is the first remaining P1 performance task and should stay scoped to renderer-side lookup paths.

## Requirements

* Build reusable indexes from `MibTreeNodeData[]`: `nodeById`, `parentById`, `validNodeIds`, and subtree key lookup.
* Replace MIB tree panel recursive helpers used for select, right-click, drag start, search ancestor expansion, and expand/collapse subtree actions.
* Keep existing MIB tree UI behavior unchanged.
* Do not change DataNode conversion/render caching in this task.
* Do not change main-process IPC or tool-window payload contracts in this task.

## Acceptance Criteria

* [ ] Selecting a tree node still updates selected node and query OID.
* [ ] Right-click menu actions still target the correct node.
* [ ] Search still finds matching names/OIDs and expands ancestors.
* [ ] Expand All / Collapse All still operate on the selected subtree.
* [ ] Drag start still publishes the correct tree node.
* [ ] Unit tests cover tree index lookup, ancestor lookup, subtree keys, and search collection.
* [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Definition of Done

* Focused code changes only.
* Regression tests added for the new index utility.
* No unrelated formatting churn.
* Commit, archive, journal record, and push before starting the next P1 task.

## Technical Approach

Create a small renderer utility near existing MIB tree utilities. The component will compute the index with `useMemo` when `mibTree` changes, then use O(1) lookup or precomputed ancestor/subtree data instead of recursive tree walks.

## Out of Scope

* DataNode render caching.
* Lazy loading MIB tree data from main process.
* Tool-window context slimming.
* Main-process MIB tree caching.

## Technical Notes

* Main target: `src/renderer/src/components/MibTreePanel.tsx`.
* Existing utility area: `src/renderer/src/utils/`.
* Existing related tests: `src/renderer/src/utils/mibTreeUtils.ts`, `src/renderer/src/components/MibTreePanel.resolveBulkOids.test.ts`.
