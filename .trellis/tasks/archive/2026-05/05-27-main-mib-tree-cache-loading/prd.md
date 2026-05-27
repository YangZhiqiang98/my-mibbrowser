# Main-side MIB Tree Cache Loading Optimization

## Goal

Reduce repeated main-process MIB tree rebuilding and renderer pull cycles after MIB load operations. This is the last remaining P1 performance task and should stay scoped to main-side MIB tree cache/loading protocol behavior.

## Requirements

* Avoid rebuilding the main-side MIB tree when loaded MIB modules have not changed.
* Expose enough load-result data for the renderer to update its MIB tree without issuing an immediate second full `mib:get-tree` request after each load operation.
* Preserve existing renderer behavior for:
  * app startup tree hydration;
  * opening MIB files;
  * opening a MIB directory;
  * dropping MIB file contents;
  * selecting a cache directory.
* Keep MIB parse diagnostics and loaded-module state unchanged.
* Keep IPC/shared types explicit and typechecked across main, preload, and renderer.
* Update project code-spec if the MIB IPC contract changes.

## Acceptance Criteria

* [x] Main process tracks a cached MIB tree and invalidates it only when accumulated modules change.
* [x] `openFiles`, `openDirectory`, and `loadContent` return the current tree in their response when modules are loaded.
* [x] Renderer load paths consume the returned tree instead of immediately calling `window.api.mib.getTree()`.
* [x] Startup and cache-directory selection still hydrate the renderer from `mib:get-tree`.
* [x] Existing MIB parse diagnostics still render correctly.
* [x] Unit tests cover cache invalidation and load-result tree behavior where practical.
* [x] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Definition of Done

* Focused main/preload/renderer IPC contract change.
* Relevant `.trellis/spec/` documentation updated.
* No unrelated parser or renderer tree UI changes.
* Commit, archive, journal record, and push after completion.

## Technical Approach

Add a main-side cached tree helper around `buildMibTree(accumulatedModules)`. Mutating MIB load paths mark the cache dirty, then hydrate once and include that snapshot in the parse/load response. Existing `mib:get-tree` remains available for startup and cache-directory hydration, but should use the same cache instead of rebuilding.

## Out of Scope

* Renderer tree lookup/DataNode caching already completed in previous P1 tasks.
* Tool-window context payload slimming already completed in the previous P1 task.
* Parser algorithm refactors.
* Persistent cache file format redesign unless required by the cache invalidation.

## Technical Notes

* Main owner: `src/main/ipc/handlers.ts`.
* MIB types: `src/main/mib/types.ts`.
* Preload API: `src/preload/index.ts`.
* Renderer consumers:
  * `src/renderer/src/App.tsx`
  * `src/renderer/src/components/MibTreePanel.tsx`
  * `src/renderer/src/types/index.ts`
