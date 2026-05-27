# Performance Optimization Pass

## Goal

Improve responsiveness and memory behavior for large MIB trees and large SNMP WALK/BULK_WALK result sets. The first implementation pass should target the highest-impact bottlenecks found in the performance review without redesigning the whole MIB loading protocol.

## Requirements

* Add an indexed OID name resolver in the main process so resolving SNMP varbind names no longer scans every MIB node for every varbind.
* Reduce duplicate IPC payloads for streaming WALK/BULK_WALK operations. Progress events should carry result rows, while the final invoke response should only carry metadata needed to finalize the session.
* Batch renderer-side streaming result appends so frequent progress events do not copy the full result array and re-render on every small batch.
* Improve high-risk O(n*m) table-session construction by avoiding per-varbind linear column scans where practical.
* Keep existing user-visible behavior for GET, GETBULK, SET, WALK, BULK_WALK, cancellation, empty results, and status messages.
* Preserve existing tests and add/update focused tests for resolver/index behavior and streaming finalization semantics where appropriate.

## Acceptance Criteria

* [ ] WALK/BULK_WALK progress still displays incrementally in the Results panel.
* [ ] Successful streaming operations finalize using streamed rows without requiring the final response to resend all varbinds.
* [ ] Aborted streaming operations keep partial rows and show the existing aborted status message.
* [ ] OID-to-name resolution returns the same symbolic names as before for exact, child, leading-dot, and non-matching OIDs.
* [ ] Table Viewer still maps table varbinds into the correct rows/columns.
* [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Definition of Done

* Tests added or updated for changed behavior.
* Lint, typecheck, and tests pass.
* Code changes stay scoped to performance-related paths.
* No unrelated refactors or formatting churn.

## Technical Approach

* Build a resolver context from current MIB nodes when `mibNodes` changes. Use the context in IPC handlers and Trap name resolution instead of repeatedly scanning the raw node list.
* Extend the SNMP result contract with an optional `streamed` marker or equivalent metadata for WALK/BULK_WALK final responses. Existing non-streaming operations retain full varbind payloads.
* Add a small renderer hook/utility that buffers streaming progress batches and flushes them on animation frames or short timers through the existing Zustand store.
* Replace Table Viewer column lookup with a pre-sorted column prefix list so longest-prefix matching does not run a naive `.find` over columns for every varbind.

## Decision (ADR-lite)

**Context**: Large SNMP walks amplify three costs: repeated OID prefix resolution, duplicate IPC transfer of the same varbinds, and repeated immutable array copies in renderer state.

**Decision**: Optimize the existing architecture in place. Keep the current IPC endpoints and UI flows, but add indexes and streaming finalization metadata.

**Consequences**: This should provide most of the performance benefit with moderate risk. It does not yet implement lazy MIB tree loading or separate renderer bundles; those remain future work.

## Out of Scope

* Lazy-loading MIB tree children from the main process.
* Splitting main-window and tool-window renderer bundles.
* Replacing AntD Tree/Table components.
* Adding persistent benchmark tooling.

## Technical Notes

* Main-process resolver hotspots: `src/main/mib/parser.ts`, `src/main/ipc/handlers.ts`.
* Renderer streaming hotspots: `src/renderer/src/stores/appStore.ts`, `src/renderer/src/components/QueryPanel.tsx`, `src/renderer/src/components/MibTreePanel.tsx`.
* Table Viewer hotspot: `src/renderer/src/utils/tableSession.ts`.
* Prior review found existing strengths: result panel virtual scrolling, bounded debug/trap buffers, and MIB cache reuse.
