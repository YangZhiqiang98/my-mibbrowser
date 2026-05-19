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

## Cross-References

- `src/renderer/src/components/MibTreePanel.tsx` — `resolveBulkOids` helper and right-click GETBULK handler.
- `src/main/snmp/client.ts` — `snmpGetBulk` accepts a multi-OID repeaters list; see also `flattenBulkVarbinds` for how the response rows are interleaved.
- [`backend/snmp-guidelines.md`](../backend/snmp-guidelines.md) — Protocol-layer rules for OID comparison and walk termination. Any UI that drives walks (not just bulk) inherits those rules through the main process API.
- [component-guidelines.md](./component-guidelines.md) — General component patterns for `MibTreePanel.tsx`.
