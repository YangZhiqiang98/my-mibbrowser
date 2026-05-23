# Move GET/SET Overlay to Electron Tool Window

## Goal

Move the multi-node GET and SET UI from in-window Ant Design modals to a unified independent Electron tool window so users can drag it outside the main application window while keeping the current SNMP behavior, result rendering, and workflow semantics.

## What I already know

* The current GET/SET UI is rendered inside the main React renderer as AntD `Modal` components:
  * `src/renderer/src/components/GetMultiNodeDialog/index.tsx`
  * `src/renderer/src/components/SetMultiNodeDialog/index.tsx`
* Both dialogs are currently opened from `MibTreePanel` right-click actions.
* Both dialogs rely on `useAppStore` for:
  * `snmpConfig`
  * `mibTree`
  * result/status setters
  * `pendingDragNode` for tree-to-dialog drag append
* SNMP operations already cross Electron through preload APIs backed by main-process IPC:
  * `window.api.snmp.get`
  * `window.api.snmp.set`
  * `window.api.snmp.walk`
  * `window.api.snmp.cancel`
* The main process currently owns only the main `BrowserWindow` in `src/main/index.ts`; IPC handlers are centralized in `src/main/ipc/handlers.ts`.
* The renderer currently has a single React entry (`src/renderer/src/main.tsx`) and a single `App` component.

## Assumptions

* GET and SET should share one real Electron child/tool window, not in-window floating panels.
* The tool window should be opened from the existing right-click GET/SET menu items.
* Existing GET/SET row behavior should remain the baseline unless explicitly scoped out.
* SNMP result sessions should still end up in the main window `ResultsPanel`, not only inside the tool window.

## Requirements

* Right-click GET opens the unified Electron GET/SET tool window seeded with the selected MIB node.
* Right-click SET opens the unified Electron GET/SET tool window seeded with the selected MIB node.
* There is at most one GET/SET tool window at a time.
* If the user chooses GET/SET again while the tool window is already open, the existing window should focus and reset to the newly selected seed node.
* The tool window can be moved outside the main window bounds.
* The tool window uses the existing preload/SNMP IPC surface for device operations where practical.
* The tool window exposes both `执行 GET` and `执行 SET` actions against the same row list.
* SET success should keep the tool window open so the user can immediately run GET to verify the written value.
* Tool window actions that produce result sessions must update the main window's result/status state.
* Dragging nodes from the main MIB tree into any open area of the GET/SET tool window must append rows, preserving the current drag-add workflow across Electron windows.
* Closing the GET/SET tool window must clean up its main-process window reference and avoid stale IPC listeners.
* Reopening GET/SET after close should seed a fresh working state from the selected node.
* The existing in-window AntD modal instances should no longer be the production GET/SET surface.

## Acceptance Criteria

* [ ] Selecting GET from a MIB tree node opens the unified independent Electron GET/SET window.
* [ ] Selecting SET from a MIB tree node opens the same unified independent Electron GET/SET window.
* [ ] Selecting GET/SET again while the tool window is open focuses the existing tool window and replaces its seed with the newly selected node.
* [ ] The opened window can be dragged outside the main application window.
* [ ] GET can execute successfully from the tool window and update the main result panel.
* [ ] SET can execute successfully from the tool window and update the main result panel/status.
* [ ] SET success leaves the tool window open so the user can immediately execute GET from the same window.
* [ ] Fetching instances/current value from the tool window continues to work.
* [ ] Dragging a MIB tree node from the main window into any open area of the GET/SET tool window appends that node as a new row.
* [ ] Closing a tool window and reopening it does not reuse stale row state.
* [ ] `npm run typecheck` passes.
* [ ] Relevant tests pass or are updated where the refactor changes testable behavior.

## Definition of Done

* Tests added/updated where practical for shared row/result plumbing.
* Lint/typecheck pass, at minimum `npm run typecheck`.
* IPC channel names and payload types are explicit and typed.
* No unrelated refactors or behavior changes outside the GET/SET window migration.

## Technical Approach

Recommended approach: create a dedicated renderer mode for tool windows and keep main-window state authoritative.

* Add main-process window management for the unified GET/SET tool window.
* Add preload APIs for opening the GET/SET window and for tool-window-to-main-window messaging.
* Add typed payloads for:
  * initial window context: operation kind, selected node/seed, current SNMP config, possibly MIB tree snapshot
  * result/status updates back to the main window
  * node append events required by cross-window drag/drop
* Reuse the SET row shape for the tool window because it contains every field needed for both GET and SET: node, instance, type, target value, and current-value fetch.
* Add a tool-window React route/mode that renders the unified GET/SET content inside `ConfigProvider`/`AntApp`.
* Main window receives result/status events and applies them through `useAppStore`, preserving the current `ResultsPanel` behavior.
* Preserve drag append by replacing the current same-renderer Zustand `pendingDragNode` bridge with a cross-window bridge. The main window should publish the dragged node through IPC during tree drag start/drop, and the target GET/SET tool window should consume that payload on drop.

## Decision (ADR-lite)

**Context**: React/AntD floating layers cannot leave the bounds of the Electron renderer window because they are DOM elements inside that window.

**Decision**: Use a single real Electron `BrowserWindow` for GET/SET, opened and managed by the main process, with typed IPC for initial data and result/status propagation.

**Consequences**:

* This adds cross-process state synchronization between main renderer and tool renderer.
* The existing row validation and SNMP helper logic should be reused rather than duplicated.
* Tree-to-dialog drag append requires new cross-window messaging because the existing Zustand `pendingDragNode` bridge only works inside one renderer process.

## Open Questions

* None.

## Out of Scope

* Replacing the entire app routing/navigation system.
* Changing SNMP GET/SET semantics.
* Redesigning the ResultsPanel.
* Adding multi-window persistence across app restarts.
* Supporting separate GET and SET windows or multiple simultaneous GET/SET windows.
* Deferring cross-window drag/drop append. This is explicitly included in MVP.

## Technical Notes

* Main process entry: `src/main/index.ts`
* IPC handlers: `src/main/ipc/handlers.ts`
* Preload API: `src/preload/index.ts`
* Renderer entry: `src/renderer/src/main.tsx`
* Main app: `src/renderer/src/App.tsx`
* Right-click GET/SET launch site: `src/renderer/src/components/MibTreePanel.tsx`
* Unified GET/SET tool window content: `src/renderer/src/components/SetMultiNodeDialog/SetToolWindowContent.tsx`
* Existing in-window GET dialog retained as legacy/non-production component: `src/renderer/src/components/GetMultiNodeDialog/index.tsx`
* Existing in-window SET dialog retained as legacy/non-production component: `src/renderer/src/components/SetMultiNodeDialog/index.tsx`
* Store and result state: `src/renderer/src/stores/appStore.ts`
* Cross-layer guide applies because this change spans Electron main, preload, and renderer.
