# Fix walk/bulk termination guard killing non-lexicographic-index tables

## Goal

SNMP `WALK` / `BULK_WALK` must return **all** rows of a table even when the agent
returns instances in an order that is not strictly OID-lexicographic. Today they
stop after the **first** row on such agents.

## Background / Root Cause (confirmed on real device)

- Device `172.16.67.180` (iTN221-4GE), table `1.3.6.1.4.1.8886.1.82.1.1.1.3`, 81 rows,
  **OCTET STRING string-index** (length-prefix + ASCII).
- The device returns rows in name/insertion order, so the first sub-identifier
  (the string length) goes e.g. `9` (`loopback1`) → `7` (`client1`): numerically
  **decreasing**.
- `snmpWalk` / `snmpBulkWalk` guard (a) — the monotonic-increasing guard
  `compareOids(next, lastPushedOid) <= 0 → stop` — treats that as a "non-increasing
  loop" and terminates with `success: true` after row 1. The attached `warning`
  is then silently dropped by the renderer, so the user sees "1 result".
- Verified with a raw `getNext` / `getBulk` loop using a **seen-OID set** guard
  instead: both walk styles collect all **81** rows and terminate naturally when
  they leave the subtree. The device does not actually loop.

## Requirements

- R1: Replace the strict monotonic-increasing OID guard (guard a) in BOTH
  `snmpWalk` and `snmpBulkWalk` with a **revisited-OID loop guard**: stop only when
  the agent returns an OID that was **already collected in this walk** (a genuine
  cycle), not merely one that is numerically smaller than its predecessor.
- R2: Preserve loop/DoS protection: a same-OID repeat or an A→B→A cycle must still
  terminate `success: true` with a `warning`; an unbounded stream of ever-new
  in-subtree OIDs must still stop at `WALK_MAX_ROWS`.
- R3: Preserve all other guards and invariants unchanged: abort-first ordering,
  subtree boundary (Constraint 3), `finish()`/`settled` single-resolve
  (Constraint 4), `onProgress` streaming of already-collected rows, v1 NoSuchName
  natural end (guard c).
- R4: Surface `SnmpResult.warning` in the renderer (QueryPanel + MibTreePanel,
  streaming and non-streaming success branches) so a future guarded stop is
  visible to the user instead of silently looking like a normal small result.
- R5: Remove code that only served the old guard (`isStrictlyIncreasing`, and
  `compareOids` if it becomes unreferenced) and update the backend spec
  (Constraint 8) to document the loop guard.

## Acceptance Criteria

- [x] AC1: A mock agent that returns string-index rows with **decreasing** length
  prefixes (non-lexicographic) but each row once → `snmpWalk` returns **all** rows
  (not 1), `success: true`, `warning` undefined.
- [x] AC2: Same non-lexicographic sequence via `snmpBulkWalk` → returns all rows.
- [x] AC3: An agent that returns the **same OID twice** (real loop) →
  `snmpWalk` / `snmpBulkWalk` stop `success: true` with a loop `warning`, keeping
  rows collected before the repeat.
- [x] AC4: Existing well-behaved (increasing) walk still returns all rows
  (no regression) — covered by the real-agent E2E test.
- [x] AC5: When `result.warning` is set, the renderer shows it (message +/or status
  line) rather than dropping it.
- [x] AC6: `npm run typecheck`, `npm run lint`, `npm run test` all green.
- [x] AC7: Spec `backend/snmp-guidelines.md` Constraint 8 updated to describe the
  loop guard; no stale reference to the monotonic guard remains.

## Out of Scope

- Changing GETBULK single-request semantics (returns up to maxRepetitions — that is
  correct, not a walk).
- Re-sorting device output into lexicographic order.
