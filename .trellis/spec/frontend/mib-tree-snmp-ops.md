# MIB Tree SNMP Operations

> Executable contracts for SNMP operations triggered from the MIB tree UI (right-click actions, double-click actions, etc.). The reference implementation lives in `src/renderer/src/components/MibTreePanel.tsx`.

---

## Scope

Applies to any user-initiated SNMP operation that takes a `MibTreeNodeData` as its target — typically the MIB tree right-click menu, but also any future affordances (toolbar shortcuts, drag-into-query, keyboard handlers) that resolve a tree node to an SNMP request.

---

## Constraint: GETBULK on a `table` / `entry` Node Must Send All Column OIDs

When the user triggers a GETBULK on a node whose `kind === 'table'` or `kind === 'entry'`, the request must include **every column OID** under that entry as repeaters in a single multi-OID `getBulk` call:

```typescript
const oids = resolveBulkOids(node)
window.api.snmp.getBulk(snmpConfig, oids, /* maxRepetitions */ 10)
```

For any other node kind (`scalar`, `column`, leaf, or unrecognized), GETBULK uses `[node.oid]` — the single-OID behavior. The branching lives in `resolveBulkOids` in `src/renderer/src/components/MibTreePanel.tsx`. Reuse that helper; do not re-derive the column list at each call site.

### Why

GETBULK with a single OID retrieves successive rows of **one column only**. When a user right-clicks a table node and asks for GETBULK, the intent is almost always "show me a quick preview of this table" — getting one column back is misleading and forces a follow-up walk to be useful.

Multi-OID GETBULK is a standard part of the SNMP PDU: the request carries a varbind list, `nonRepeaters` and `maxRepetitions`, and the agent returns each repeater iterated `maxRepetitions` times. One round-trip yields one preview row across all columns. This is strictly cheaper than running a walk and matches what every mature MIB browser does on a table node.

Single-OID GETBULK is still correct on a `column` or `scalar`, because there is nothing to fan out across.

### How to Apply

- New code paths that take a `MibTreeNodeData` and produce SNMP OIDs for a bulk-shaped operation must go through `resolveBulkOids`. Do not branch on `kind` ad-hoc at the call site.
- `resolveBulkOids` semantics:
  - `kind === 'table'` → find the (single) `entry` child, collect every direct `column` child with a non-empty OID. Fall back to `[node.oid]` if no entry / no columns are found.
  - `kind === 'entry'` → collect every direct `column` child with a non-empty OID. Fall back to `[node.oid]` if no columns are found.
  - Everything else → `[node.oid]`.
- The fallback `[node.oid]` is load-bearing: callers can always assume the helper returns at least one OID. Do not change `resolveBulkOids` to return `[]` for malformed trees.
- When adding a new bulk-shaped operation (e.g. a future "preview first N rows" button), reuse the same helper. If the desired semantics differ enough to need a different shape, add a sibling helper next to `resolveBulkOids` rather than duplicating the `kind` switch.
- Renderer-side decisions about which OIDs to send belong here, not in the main process. `src/main/snmp/client.ts` accepts an `oids: string[]` and treats them all as repeaters when `nonRepeaters === 0`; it does not (and should not) know about MIB tree structure.

---

## Constraint: SNMP Operation Results Go Through a Single Write Path

Every renderer-side entry point that fires an SNMP request must funnel its outcome through the same sequence and through `buildResultSession` + `appStore.setResult`. The result panel is overwrite-style — each new operation replaces the previous session — and there are multiple trigger sites (`QueryPanel.handleSend`, `MibTreePanel.executeSnmpOperation`, `SetMultiNodeDialog.handleSubmit`, `GetMultiNodeDialog.handleSubmit`, and any future toolbar / keyboard / drag affordance). If each site rolls its own `setStatus` + ad-hoc varbind formatting, the panel desynchronizes: some paths leave stale rows visible during the next query, others format types inconsistently, and error states diverge.

### Required Sequence

```typescript
setResult(null)                          // 1. clear previous session immediately
setIsQuerying(true)                      // 2. flip the busy flag
setConnectionStatus('connecting')        // 3. status pill reflects in-flight call
try {
  const result = await window.api.snmp.<op>(...)
  if (result.success) {
    const session = buildResultSession(op, rootOid, result, mibTree)
    setResult(session)                   // 4. single write of the new session
    setStatusMessage(/* per-op summary */)
  } else {
    appMessage.error(result.error)
    setStatusMessage(`Error: ${result.error}`)
  }
} finally {
  setIsQuerying(false)                   // 5. always clear busy flag
}
```

### Why

- **Overwrite semantics depend on step 1 firing every time.** If a trigger site forgets `setResult(null)`, the old session lingers under the loading spinner and reappears if the new call fails. Users read this as "the new request silently succeeded with old data".
- **Formatting consistency lives in `buildResultSession`.** It is the only place that knows how to assemble `ResultColumn[]` headers, fold varbinds into rows by instance, and run `formatVarbindValue` per type. Earlier revisions of this codebase had two inline `formatValue` / `formatVarbindValue` copies that drifted apart — that mistake is the reason this constraint exists.
- **Status / error wiring is part of the contract.** A trigger that fires `setResult` but forgets `setStatusMessage` leaves the StatusBar showing the previous operation's summary, which is worse than no message at all.

### How to Apply

- Constructing a `ResultRow` or `ResultColumn` literal inside any component is forbidden. The only producer is `buildResultSession` in `src/renderer/src/utils/resultColumns.ts`. If a new operation shape needs different column-resolution logic, extend `buildResultSession` (or add a sibling helper next to it) — do not inline.
- `appStore.setResult` is the only allowed writer for `currentResult`. The legacy `addResult` / `addResults` setters and the `results: ResultRow[]` field are kept as compile-only shims for the old transcript view; do not introduce new callers. `clearResults` is the only other path that touches `currentResult` and it sets it to `null`.
- Failure handling uses `appMessage.error(result.error)` plus `setStatusMessage('Error: …')`. Do not call `setResult(emptySession)` to "show" an error — leave `currentResult` as `null` so the empty-state UI renders.
- New trigger sites (e.g. a future "rerun last operation" button) reuse this exact sequence. Pulling it into a `useSnmpOperation` hook is acceptable as long as every caller of that hook ends up at `setResult` + `buildResultSession`.

---

## Constraint: SNMP SET Authority Is the Device Response, Not the MIB `access` Field

The MIB `access` attribute (`read-only`, `read-write`, `read-create`, `not-accessible`, `accessible-for-notify`) declares the **MIB author's stated semantics**, not the runtime writability of any particular device. A node marked `read-write` can be refused by a device that protects it through a separate mechanism; a node marked `read-only` can be writable on a vendor that ships extensions. The same gap applies to reads on `not-accessible` rows.

UI must therefore not pre-filter operations based on `node.access`. The only allowed UI gate is "we don't have an OID to operate on" (`!hasOid`). Everything else — including SET on a `read-only` node — is offered to the user, sent to the device, and resolved by the response.

### Why

- Pre-filtering by `access` blocks users from confirming what their device actually does. The MIB browser is the diagnostic surface; refusing the request locally defeats the purpose.
- Devices regularly disagree with their own MIBs. A SET that the MIB declares legal may still return `noAccess` / `notWritable` / `authorizationError`; a SET that the MIB declares illegal may still succeed when the vendor extended the table. Both directions need to be observable.
- The error-rendering path is already symmetric for protocol-level rejections (Constraint above): on `result.success === false`, `appMessage.error(result.error)` + `setStatusMessage('Error: …')` covers refused SETs and refused GETs identically. Adding a UI-side gate would create a third class of "request never sent" that bypasses this and looks indistinguishable from a connection failure.

### How to Apply

- Right-click menu items in `MibTreePanel.tsx` (`contextMenuItems`) set `disabled` based on `!hasOid` only. Do not add `node.access === 'read-only'` (or any `access`-based predicate) to a `disabled` expression for GET / GETBULK / WALK / BULK_WALK / SET.
- The SET dialog (`SetMultiNodeDialog` opened from `openSetDialog`) and GET dialog (`GetMultiNodeDialog` opened from `openGetDialog`) are reachable from any node with an OID. Type / value / instance validation belongs inside the dialogs, not in the menu gate.
- If a future affordance wants to *hint* at expected writability (e.g. a tooltip "MIB declares this read-only"), render it as a non-blocking annotation. The action stays enabled.
- This rule does not override transport-level guards. Missing community string / unreachable host still blocks at `window.api.snmp.*` and surfaces through the same error path — those are not `access`-driven decisions.

---

## Constraint: Right-Click GET / SET Open Multi-Node Dialogs; Others Fire Directly

Right-click menu actions split into two execution shapes based on whether the operation needs an **instance suffix** to be useful:

| Operation | Shape | Why |
|---|---|---|
| GET, SET | Opens a multi-node dialog (`GetMultiNodeDialog` / `SetMultiNodeDialog`) | Both operate on a fully-qualified instance OID. A bare `node.oid` for a scalar / column returns `noSuchInstance`. The dialog lets the user pick / type the instance suffix (and optionally `WALK` to discover them) before any request is sent. |
| GETBULK, WALK, BULK_WALK, GETNEXT (internal) | Fires directly via `executeSnmpOperation` | These take a root / subtree OID and traverse below it. `node.oid` is already the right input — no instance suffix is needed. |

The instance composition rule is the same for both dialogs: `buildFullOid(node.oid, instance)` in `src/renderer/src/components/SetMultiNodeDialog/rowUtils.ts`, which normalizes dots and defaults an empty instance to `'0'` so scalar SETs / GETs work without typing.

### Why

- Pre-`05-23`: right-click GET fired `executeSnmpOperation('GET', node)` directly, passing `node.oid` with no instance composition. For every non-scalar (and even scalar OIDs without an implied `.0`), the device returned `noSuchInstance` and the user had to learn to type the instance into QueryPanel manually. The dialog form makes the instance picker an explicit, discoverable step.
- Pre-`05-23`: right-click SET went through a single-OID legacy modal. Multi-node SET (atomic varbind list in one SNMP SET request) only works through `SetMultiNodeDialog`, so the menu was promoted to that dialog as a one-way switch.
- GETBULK / WALK / BULK_WALK do not benefit from an instance picker — the user's intent is "traverse below this OID". Putting them through a dialog would just be friction.

### How to Apply

- `openGetDialog(node)` and `openSetDialog(node)` are the only producers of `getDialogSeed` / `setDialogSeed` state in `MibTreePanel.tsx`. Right-click menu items for GET / SET must call these instead of `executeSnmpOperation('GET' | 'SET', ...)`. The latter signature is reserved for the direct-fire operations.
- Both dialogs use the multi-row + drag-append shape: a top drop zone that consumes the `pendingDragNode` Zustand bridge (see [state-management.md](./state-management.md) → "Cross-component drag-bridge"), per-row instance Input/Select with a `WALK` discovery button, and a single submit that dispatches one atomic multi-OID SNMP request.
- Both dialogs are intentionally non-modal: `mask={false}` + a `pointer-events: none` wrap class so the underlying MIB tree stays interactive while the dialog is open. This is what lets the user drag additional nodes in. New similarly-shaped dialogs must follow the same pattern; do not introduce a masking modal that blocks tree interaction.
- The legacy `MibTreePanel.handleSetConfirm` flow and the single-OID SET `Modal` have been removed. Any reintroduction of "fire GET / SET directly from the menu" requires lifting the instance-picker affordance somewhere else first (e.g., into a slash command or keyboard shortcut), not regressing the dialog.
- GET dialog has no "convert to SET" affordance. The two flows are independent on purpose: GET retrieves, SET writes, and crossing them would require unstable invariants (instance still selected? value still valid? user's intent?) that aren't worth the UI surface. If a user wants to edit-from-current, they right-click → SET, then click the row's "fetch current → fill target" button inside SetMultiNodeDialog.

---

## Constraint: Result-Column Resolution Uses Longest-Prefix MIB Matching on Segment Boundaries

`resolveOidToColumn(varbindOid, mibTree)` in `src/renderer/src/utils/resultColumns.ts` decides, for each varbind in a response, which column it belongs to and what its instance suffix is. The result panel's correctness — table shape, row grouping, header labels — depends entirely on this function. Two properties are mandatory.

### Required Properties

1. **Segment-boundary prefix match**: a candidate MIB OID `prefix` matches a varbind OID `oid` iff `oid === prefix || oid.startsWith(prefix + '.')`. Reuse the same predicate shape as `oidInSubtree` in `src/main/snmp/client.ts` (see [`backend/snmp-guidelines.md`](../backend/snmp-guidelines.md) Constraint 1). Raw `String.startsWith` without the dot guard is wrong.
2. **Longest-prefix wins**: when multiple MIB nodes match, the deepest (most OID segments) is chosen. The canonical implementation flattens the MIB tree, sorts by segment count descending, and picks the first hit.

### Why

- **Without the segment-boundary check**, `1.3.6.1.2.1.2` (ifTable) lexically captures every OID under sibling subtrees like `1.3.6.1.2.1.20`, `1.3.6.1.2.1.21`, etc. Every varbind from those subtrees would be misclassified into the ifTable column, producing nonsense rows with mixed-source data. This is the same bug class that motivated `oidInSubtree` on the backend.
- **Without longest-prefix-wins**, a fully-qualified instance OID like `1.3.6.1.2.1.2.2.1.2.1` matches *both* the column (`...2.2.1.2`) and every ancestor (`...2.2.1`, `...2.2`, `...2`, `...`) up to the MIB root. Picking any of the ancestors collapses the whole table into a single "group" column where every row shares the same `columnKey`, and the row-grouping by instance falls apart.

### How to Apply

- Container helpers used inside `resolveOidToColumn` (`isOidWithinPrefix`, `suffixAfterPrefix`, `flattenMibTree`) are local to `src/renderer/src/utils/resultColumns.ts`. Any new column-resolution logic — including any future "group by parent table" or "merge sub-columns" feature — extends this file and reuses these helpers. Do not duplicate them in components.
- Flattening must keep the segment-count sort. If a future refactor switches `flattenMibTree` to lazy iteration, the sort property still has to hold at the consumer of the iterator.
- The fallback path (no MIB match) must produce a non-empty `columnKey` and `columnName`. The current shape uses `oid.lastIndexOf('.')` to split into `(prefix, instance)`, with the instance suffix being the final segment. A single-segment OID (rare but legal in malformed responses) must not throw — return the whole OID as both `columnKey` and a `columnName` of the OID itself, with empty `instance`. Crashing here would break the result panel for the entire session.
- Cross-layer parity: the segment-boundary rule used here is **the same predicate** the backend uses to terminate walks. Treat them as one rule with two implementations. If either side relaxes the rule (e.g. to support a non-numeric OID component), the other side must follow in the same change — otherwise walk termination and column resolution disagree on what "in subtree" means and the result panel desyncs from the protocol layer.

---

## Cross-References

- `src/renderer/src/components/MibTreePanel.tsx` — `resolveBulkOids` helper, right-click GETBULK / WALK / BULK_WALK handler (`executeSnmpOperation`), `openGetDialog` / `openSetDialog`, `contextMenuItems`, tree drag handlers writing `pendingDragNode`.
- `src/renderer/src/components/QueryPanel.tsx` — `handleSend` (third trigger site that must follow the single-write-path sequence); also the `GETNEXT` → `GET` fallback effect that ages out stale `queryOperation` state after the GETNEXT UI was removed.
- `src/renderer/src/components/SetMultiNodeDialog/` — multi-node SET dialog (drop zone + per-row walk + atomic SET). `rowUtils.ts` exports `buildFullOid` / `stripBaseOid` which are reused by the GET dialog. `types.ts` exports `SetSeed` for callers that need to pre-fill the first row.
- `src/renderer/src/components/GetMultiNodeDialog/` — multi-node GET dialog. Same five-file shape (`types.ts` / `rowUtils.ts` / `useGetRows.ts` / `GetRow.tsx` / `index.tsx`) as the SET dialog, trimmed to GET-only fields. Imports `buildFullOid` / `stripBaseOid` from the SET dialog's `rowUtils.ts`.
- `src/renderer/src/utils/resultColumns.ts` — `resolveOidToColumn`, `buildResultSession`, `formatVarbindValue` (renderer-side). Single producer of `ResultSession`.
- `src/renderer/src/stores/appStore.ts` — `setResult` is the only allowed writer of `currentResult`; legacy `addResult` / `addResults` / `results` are compile-only shims. `pendingDragNode` is the cross-component drag bridge consumed by both Set and Get multi-node dialogs (see [state-management.md](./state-management.md)).
- `src/main/snmp/client.ts` — `snmpGetBulk` accepts a multi-OID repeaters list; see also `flattenBulkVarbinds` for how the response rows are interleaved. `snmpGetNext` is still exported and used internally by `snmpWalk`, even though the GETNEXT UI entry points were removed.
- [`backend/snmp-guidelines.md`](../backend/snmp-guidelines.md) — Protocol-layer rules for OID comparison and walk termination. The segment-boundary rule used in `resolveOidToColumn` is the same rule used by `oidInSubtree` — keep them in sync.
- [component-guidelines.md](./component-guidelines.md) — General component patterns for `MibTreePanel.tsx`, plus the AntD Dropdown menu item click constraint that the right-click menu and `Toolbar.tsx` profile menu both depend on.
- [state-management.md](./state-management.md) — "Cross-component drag-bridge via the store" section documents why `pendingDragNode` lives in Zustand instead of the native DataTransfer.
