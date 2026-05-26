# Add Table Viewer Row Lifecycle Operations

## Goal

Add conservative row lifecycle operations to the dedicated Table Viewer so users can create and delete SNMP table rows without manually composing instance OIDs and `RowStatus` SET values.

## Requirements

* Detect tables that expose a usable `RowStatus` column from parsed MIB metadata.
* Show `Add Row` only when the table has a `RowStatus` column and at least one `read-create` column.
* Let users enter a new row instance suffix and initial values for editable, non-`RowStatus` columns.
* Build one SNMP SET request for Add Row using the entered values plus `RowStatus = createAndGo(4)`.
* Let users select an existing row and delete it using `RowStatus = destroy(6)`.
* Reuse existing table-aware SET value construction and enum inputs where possible.
* Surface SET failures with the specific row operation context and leave the window usable.
* Refresh the table after successful Add Row or Delete Row.

## Acceptance Criteria

* [ ] A table with `RowStatus` and `read-create` columns shows an `Add Row` button.
* [ ] A table without `RowStatus` does not expose row lifecycle actions.
* [ ] Add Row sends SET varbinds to `<column oid>.<instance>` plus `<rowStatus oid>.<instance> = 4`.
* [ ] Delete Row sends SET to `<rowStatus oid>.<instance> = 6`.
* [ ] Add/Delete success publishes main-window status/toast feedback and refreshes Table Viewer rows.
* [ ] Add/Delete failure publishes error status/toast feedback without closing the Table Viewer.
* [ ] Unit tests cover lifecycle capability detection and SET varbind construction.

## Definition of Done

* Typecheck passes.
* Lint passes.
* Relevant Vitest tests pass.
* README current limitation is updated if behavior changes.
* Trellis quality check is run before wrap-up.

## Technical Approach

Extend `src/renderer/src/utils/tableSession.ts` with small pure helpers for row lifecycle capability detection and varbind construction. Keep SNMP protocol work on the existing `window.api.snmp.set` IPC path. Extend `TableViewerContent` with row selection, an Add Row modal, and Delete Row confirmation, keeping component business logic thin enough for unit coverage in the utility layer.

## Decision (ADR-lite)

**Context**: SNMP table row creation/deletion varies by MIB, but the broadly standardized safe path is the `RowStatus` textual convention.

**Decision**: Implement an MVP for RowStatus-backed tables only. Use `createAndGo(4)` for creation and `destroy(6)` for deletion. Do not attempt multi-step `createAndWait`, automatic RowStatus state repair, transaction rollback, or table-specific wizard behavior in this task.

**Consequences**: This covers common `read-create` tables while avoiding unreliable local guesses for arbitrary writable tables. Some devices that require multi-step creation may return an error; the UI will surface that device response and remain usable.

## Out of Scope

* Creating rows in tables without RowStatus semantics.
* `createAndWait` multi-step row staging.
* Transaction rollback when a multi-varbind SET partially fails.
* Table-specific required-field inference beyond editable columns exposed by the parsed MIB.
* Snapshot diff, bulk row lifecycle operations, or real-time polling.

## Technical Notes

* Existing table metadata and SET construction live in `src/renderer/src/utils/tableSession.ts`.
* Existing Table Viewer UI lives in `src/renderer/src/components/TableViewer/TableViewerContent.tsx`.
* Existing SET IPC path is `window.api.snmp.set(config, values)`.
* Relevant project specs:
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/mib-tree-snmp-ops.md`
  * `.trellis/spec/backend/snmp-guidelines.md`
