# SNMP Protocol Handling Guidelines

> Executable contracts for any code that compares, walks, or relays OIDs against the `net-snmp` library. These are protocol-layer constraints, not style preferences — violating them produces wrong results that look plausible on common inputs and break on edge cases (empty tables, sibling subtrees, deep OID arcs).

---

## Scope

Applies to all code under `src/main/snmp/` and any module that receives raw varbinds from `net-snmp` (`session.get`, `getNext`, `getBulk`, traps). The reference implementation lives in `src/main/snmp/client.ts`.

---

## Constraint 1: OID Subtree Checks Must Respect Segment Boundaries

When deciding whether one OID is contained in another, compare OID **segments** (the dot-separated numeric components), not raw string prefixes.

### Required Pattern

```typescript
function oidInSubtree(oid: string, rootOid: string): boolean {
  return oid === rootOid || oid.startsWith(rootOid + '.')
}
```

The canonical implementation is `oidInSubtree` in `src/main/snmp/client.ts`. Reuse it; do not inline a fresh `startsWith` check elsewhere.

### Why

OIDs use dot-separated decimal segments with no fixed width per segment. A naive `oid.startsWith(rootOid)` matches lexically, not structurally:

- `"1.3.6.1.2.1.21".startsWith("1.3.6.1.2.1.2")` → `true`, but `1.3.6.1.2.1.21` is a sibling of `1.3.6.1.2.1.2`, not a descendant.
- `"1.3.6.1.2.1.20".startsWith("1.3.6.1.2.1.2")` → same false positive.

Appending `'.'` to the root forces a segment boundary; matching the root exactly is the only case where no dot is needed.

### How to Apply

- Use this helper for any "is in subtree", "is descendant of", or "stop the walk" decision.
- Do not bypass it by writing `vb.oid.startsWith(rootOid)` inline — even if it looks "obviously fine" for this root, the next caller passes a different root.
- If you need a different shape (e.g. parent-of / exact-prefix-by-N-segments), build a sibling helper that still splits on `'.'`; do not patch the call sites.
- Normalize leading dots first (see Constraint 2). The helper above must receive comparable strings.

---

## Constraint 2: Normalize Leading Dots on Every `net-snmp` Boundary

`net-snmp` returns varbind OIDs in dotted-leading form (`".1.3.6.1.2.1.1.1.0"`), while every other source in this project — user input, MIB tree nodes, configuration, IPC payloads — uses the dotless form (`"1.3.6.1.2.1.1.1"`). Mixing the two in any comparison (`===`, `startsWith`, set/map keys) silently fails.

### Required Pattern

```typescript
function stripLeadingDot(oid: string): string {
  return oid.startsWith('.') ? oid.slice(1) : oid
}
```

The canonical implementation is `stripLeadingDot` in `src/main/snmp/client.ts`. `oidInSubtree` already strips both inputs; `formatVarbindValue` strips on the outbound side so renderer-facing varbinds are always dotless.

### Why

- This bug class has hit the codebase twice already — once in `resolveOidToName` (`src/main/mib/parser.ts`) and once in the WALK / BULK_WALK subtree check and `lastOid` recursion (`src/main/snmp/client.ts`). Both produced "looks like it works on root nodes, breaks on real data" symptoms.
- `net-snmp` itself usually tolerates either form on the request side, but tolerance is not a contract — staying consistent removes a class of "works on Tuesday" bugs.

### How to Apply

- **Receive**: The first thing you do with `vb.oid` from a `net-snmp` callback is treat it as potentially dotted. Either pass it through a helper that strips, or compare with helpers that strip internally.
- **Compare**: Never compare `vb.oid` directly against a stored / configured OID. Route through `oidInSubtree`, or strip both sides before `===` / `startsWith`.
- **Re-send**: When passing an OID back into `net-snmp` (e.g. the `lastOid` fed into the next `session.getNext` / `session.getBulk` during a walk), strip the leading dot first. See `snmpWalk` and `snmpBulkWalk` in `client.ts` for the canonical pattern.
- **Emit**: Anything leaving `src/main/snmp/` toward the renderer (via `formatVarbindValue`) must already be dotless. New emit paths must match.

---

## Constraint 3: Walk Loops Must Check Subtree Boundary Before Pushing

Any operation that drives `GETNEXT` or `GETBULK` in a loop until it walks past a root (`snmpWalk`, `snmpBulkWalk`, future analogs) must order its per-varbind work as **error check → subtree check → push**, never push-then-check.

### Required Pattern

```typescript
for (const vb of varbinds) {
  if (snmp.isVarbindError(vb)) {
    session.close()
    resolve({ success: true, varbinds: results, /* ... */ })
    return
  }

  if (!oidInSubtree(vb.oid, rootOid)) {
    // Boundary varbind belongs to the next subtree — discard, end walk.
    session.close()
    resolve({ success: true, varbinds: results, /* ... */ })
    return
  }

  results.push(formatVarbindValue(vb))
  // For BULK_WALK: only advance lastOid when the varbind is in-subtree.
}
```

See `snmpWalk` and `snmpBulkWalk` in `src/main/snmp/client.ts` for the live implementation.

### Why

SNMP walks work by repeatedly asking "what comes after the last OID?" until the agent returns something that lives outside the requested root. That boundary response is protocol-valid but semantically belongs to the **next** subtree. If you push first and check after:

- A walk against an empty table returns the first instance of the next sibling table as if it were a row of the empty one. Users see "phantom rows that belong to a different OID".
- The `lastOid` you carry into the next `getBulk` / `getNext` is out-of-subtree, so the next response is also out-of-subtree, and the loop can either over-fetch silently or terminate one round later than it should.

### How to Apply

- Whenever you write a new walk-shaped loop (driving `getNext` / `getBulk` until exit), copy the ordering above. Do not reorder for "readability".
- The `varbinds.length === 0` / `flat.length === 0` early-exit branch is also required: an empty response means the agent has nothing more, end the walk cleanly.
- For BULK_WALK specifically: update `lastOid` **only inside the push branch** (after the subtree check passed), so an out-of-subtree boundary varbind never becomes the next request seed.
- The walk's success/error contract follows `error-handling.md` — out-of-subtree termination resolves with `success: true` and whatever was collected so far. Do not treat it as an error.

---

## Cross-References

- `src/main/snmp/client.ts` — canonical implementations of `oidInSubtree`, `stripLeadingDot`, `formatVarbindValue`, `snmpWalk`, `snmpBulkWalk`, `snmpGetBulk`, `flattenBulkVarbinds`.
- `src/main/mib/parser.ts` — `resolveOidToName` is the other historical site for the leading-dot normalization rule. Any new OID-keyed lookup in the MIB layer must strip first.
- [error-handling.md](./error-handling.md) — Walk results follow the `SnmpResult` envelope; out-of-subtree termination is not an error.
- [quality-guidelines.md](./quality-guidelines.md) — General code standards for the main process.
