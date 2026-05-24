# Add dedicated SNMP table viewer and row editor

## Goal

Add a dedicated SNMP Table Viewer workflow so users can open a table or entry node from the MIB tree, fetch its rows, inspect/filter/sort/export the table, and edit basic writable cells without manually composing instance OIDs.

This task follows the confirmed conservative MVP strategy from `goal.md`: implement a reliable table workflow and read-write cell editing first, avoid global UI rewrites, and leave Add Row / Delete Row and snapshot/diff functionality for later work.

## What I Already Know

- MIB tree right-click operations live in `src/renderer/src/components/MibTreePanel.tsx`.
- GET / SET Electron tool windows are managed by `src/main/toolWindows.ts` and `window.api.snmpTool`.
- Renderer result grouping currently lives in `src/renderer/src/utils/resultColumns.ts`.
- MIB node metadata now includes richer parser output from Task 1, including table/entry/column/INDEX and type metadata.
- SNMP SET authority remains the device response, not the MIB `access` field, but table editing should still use `access` as a hint for expected editability.

## Requirements

- Users can open a dedicated Table Viewer from a MIB tree `table` or `entry` node.
- The viewer automatically identifies:
  - entry node
  - column nodes
  - column OIDs
  - index columns
  - instance suffixes
- The viewer fetches data using BULK WALK by default, with WALK fallback if needed.
- Data is displayed as a table grouped by row instance and column.
- The viewer supports refresh, filter, sort, column visibility, copy, and CSV export.
- Read-write and read-create columns provide basic editing controls.
- SET requests are built with full instance OIDs and MIB-aware value/type conversion.
- Enum values use select controls where metadata is available.
- Integer, IP/OID, and string-like values use appropriate basic inputs.
- SET failures are shown at the row/column/value level where possible.
- Large tables should avoid obvious UI freezes; use AntD table scroll/pagination or virtual-friendly patterns as needed.

## Acceptance Criteria

- [ ] Right-clicking a table or entry node exposes an action to open the Table Viewer.
- [ ] The Table Viewer displays rows fetched from the device without requiring the user to manually type OIDs.
- [ ] Table columns are derived from MIB entry column children.
- [ ] Row instances are derived from varbind suffixes.
- [ ] Users can refresh the table.
- [ ] Users can filter and sort displayed rows.
- [ ] Users can hide/show columns.
- [ ] Users can copy rows and export CSV.
- [ ] Editable columns support at least one-cell edit + SET flow.
- [ ] SET failures are visible without corrupting the displayed table state.
- [ ] Existing ResultsPanel GET / WALK / BULK WALK flows still work.
- [ ] Existing GET / SET tool-window behavior still works.
- [ ] Unit tests cover table row assembly and SET value building.

## Definition Of Done

- Tests added or updated for table session assembly and edit value building.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- Trellis quality check is run after implementation.
- Work is committed before `trellis-finish-work`.
- `trellis-finish-work` is run after the work commit.
- Commits are pushed to GitHub, using temporary `127.0.0.1:7897` Git proxy only if network push fails.

## Technical Approach

1. Create a table-specific data model and utilities near the existing result utilities.
2. Reuse the longest-prefix OID matching and segment-boundary rules from `resultColumns.ts`.
3. Add a Table Viewer Electron tool window or dedicated tool surface, reusing the existing tool-window IPC pattern where practical.
4. Add a MIB tree right-click action for table/entry nodes.
5. Fetch table data with `window.api.snmp.bulkWalk` first; if a fallback is needed, use `window.api.snmp.walk`.
6. Build a `TableSession` from varbinds and MIB column metadata.
7. Implement UI controls for refresh, filtering, sorting, column visibility, copy, and CSV export.
8. Implement conservative single-cell edit + SET flow for basic writable columns.
9. Keep ResultsPanel and existing GET / SET tool windows unchanged except for shared type/helper reuse if needed.

## Decision (ADR-lite)

**Context**: The current ResultsPanel can display dynamic SNMP results, but table usage still requires manual OID knowledge and does not provide a table-specific edit workflow.

**Decision**: Add a dedicated conservative Table Viewer workflow instead of replacing the current ResultsPanel. Use existing SNMP IPC calls and MIB metadata, with table-specific row assembly and edit helpers.

**Consequences**:

- Lower risk to existing GET / WALK / SET flows.
- Table workflow becomes discoverable from the MIB tree.
- Add Row / Delete Row and advanced table transactions remain future work.
- Some complex INDEX editing scenarios may still need later enhancements.

## Out Of Scope

- Add Row / Delete Row.
- Batch transaction commit/rollback.
- Multi-device table comparison.
- Table snapshot diff.
- Realtime polling charts.
- Complex INDEX visual editor.
- Trap/Inform console, Agent Simulator, or global UI redesign.

## Technical Notes

- Follow `.trellis/spec/frontend/mib-tree-snmp-ops.md` for right-click operation behavior and result flow constraints.
- Follow `.trellis/spec/backend/snmp-guidelines.md` for OID boundary and leading-dot handling.
- Preserve the rule that UI may hint at MIB-declared writability but the device response is the final authority.
