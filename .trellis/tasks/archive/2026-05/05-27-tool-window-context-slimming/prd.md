# Tool Window Context Slimming

## Goal

Reduce the size of IPC payloads sent when opening or resetting GET / SET / Table Viewer tool windows. This is the third remaining P1 performance task and should stay scoped to tool-window context payloads.

## Requirements

* Stop sending the full main-window `mibTree` snapshot in every `window.api.snmpTool.open(...)` request when the tool window only needs a small set of nodes.
* Preserve GET / SET tool-window behavior:
  * launch from right-click GET or SET with the selected node;
  * drag-append nodes from the main MIB tree;
  * execute GET and SET;
  * publish result/status/toast updates back to the main window;
  * keep result column naming at least as accurate for selected/dragged rows as before.
* Preserve Table Viewer behavior for table/entry launches.
* Keep the shared IPC types explicit and typechecked across main, preload, renderer, and shared modules.
* Update project code-spec if the tool-window context contract changes.
* Do not implement main-side MIB tree cache/loading protocol optimization in this task.

## Acceptance Criteria

* [ ] `SnmpToolWindowOpenRequest` no longer requires a full `mibTree` snapshot for every tool-window launch.
* [ ] GET / SET result building uses a slim MIB context derived from the current rows instead of the full tree.
* [ ] Table Viewer still resolves table metadata and rows correctly from its launch seed.
* [ ] Main-process debug logging avoids dumping large seed/tree payloads.
* [ ] Shared/preload/renderer type declarations agree.
* [ ] Unit tests cover slim context derivation where practical.
* [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Definition of Done

* Focused cross-layer payload contract change.
* Relevant `.trellis/spec/` documentation updated because the IPC contract changes.
* No unrelated result rendering, SNMP operation, or MIB loading changes.
* Commit, archive, journal record, and push before starting the next P1 task.

## Technical Approach

Introduce a slim tool-window MIB context instead of sending the entire main `mibTree`. For GET / SET, derive the result resolution tree from the current row nodes inside the tool window. For Table Viewer, use the table/entry seed and its direct subtree. Keep drag payloads as `ToolWindowMibNode` because they are one node at a time and already required by the cross-window drag bridge.

## Out of Scope

* Main-side MIB tree cache/loading protocol optimization.
* Lazy loading full MIB tree data into tool windows.
* Result panel streaming behavior.
* Changes to SNMP request semantics.

## Technical Notes

* Shared contract: `src/shared/toolWindowTypes.ts`.
* Main owner: `src/main/toolWindows.ts`.
* Preload API: `src/preload/index.ts`.
* Main window producer: `src/renderer/src/components/MibTreePanel.tsx`.
* Tool-window consumers:
  * `src/renderer/src/ToolWindowApp.tsx`
  * `src/renderer/src/components/SetMultiNodeDialog/SetToolWindowContent.tsx`
  * `src/renderer/src/components/TableViewer/TableViewerContent.tsx`
