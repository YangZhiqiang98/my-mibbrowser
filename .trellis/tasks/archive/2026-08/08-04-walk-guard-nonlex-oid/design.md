# Design — Walk/Bulk Loop Guard (replace monotonic with revisited-OID)

## Boundary

Backend-only behavior change plus a small renderer UX addition. No IPC signature,
type, or preload surface changes. `SnmpResult.warning` already exists and already
crosses the preload boundary.

## Current (buggy) contract

`client.ts` `snmpWalk` / `snmpBulkWalk` keep a per-Promise `lastPushedOid` and, per
varbind, before pushing:

```
(a) monotonic:  compareOids(stripLeadingDot(vb.oid), lastPushedOid) <= 0  → finish(success, warning)
(b) row cap:    results.length >= WALK_MAX_ROWS                            → finish(success, warning)
(c) v1 end:     isNoSuchNameEnd(error) in the error branch                 → finish(success)
```

Guard (a) assumes "not strictly increasing ⇒ loop". False for real string-index
tables returned in name order (length prefix 9→7 looks decreasing). It stops the
walk after row 1.

## New contract

Replace guard (a) with a **revisited-OID loop guard**, keyed on the set of OIDs
already collected in THIS walk:

```
per Promise:  const seenOids = new Set<string>()

per varbind (order unchanged): abort → error/NoSuchName → subtree boundary → row cap →
  loop:  const key = stripLeadingDot(vb.oid)
         if (seenOids.has(key))  → finish(success, warning: `agent looped on OID ${key}`)
         seenOids.add(key)
         push
```

### Why this is correct AND still loop-safe

| Threat | Old guard (a) | New loop guard |
|---|---|---|
| Same OID forever (X→X→X) | caught (X<=X) | caught (X seen on 2nd) |
| Cycle A→B→A→B | caught | caught (A seen again) |
| Non-lex but terminating (9→7→…→leaves subtree) | **false-trips at row 1** | passes; natural subtree-boundary end |
| Unbounded new in-subtree OIDs | caught by (a) only if decreasing; else (b) | caught by (b) row cap |

The only case old (a) caught that the new guard does not is "monotonically
DECREASING but all-distinct OIDs forever". That cannot be unbounded within a finite
MIB subtree without either revisiting an OID (→ loop guard) or leaving the subtree
(→ boundary) or hitting the row cap. So loop protection is preserved.

### Memory

`seenOids` holds at most `WALK_MAX_ROWS` (20000) normalized OID strings — the same
bound as `results`. Negligible.

## Files & changes

1. `src/main/snmp/client.ts`
   - `snmpWalk`: `let lastPushedOid` → `const seenOids = new Set<string>()`; swap the
     guard block; drop `compareOids` from the import.
   - `snmpBulkWalk`: same swap inside the batch `for` loop (keep the `break`-with-
     `warning`-flag pattern so `onProgress` still streams the pre-guard rows). `lastOid`
     (continuation seed) is unrelated and stays.
   - Import becomes `import { isNoSuchNameEnd } from './oid'`.
2. `src/main/snmp/oid.ts`
   - Remove `compareOids`, `isStrictlyIncreasing`, and the now-orphaned private
     `toSegments`. Keep `isNoSuchNameEnd` + `SNMP_NO_SUCH_NAME_STATUS`.
3. `src/main/snmp/oid.test.ts`
   - Drop the `compareOids` and `isStrictlyIncreasing` describe blocks; keep
     `isNoSuchNameEnd`.
4. `src/renderer/src/components/QueryPanel.tsx` and `MibTreePanel.tsx`
   - In each `result.success` branch (streaming + non-streaming, not the abort
     branch), if `result.warning` is set, call `message.warning(result.warning)` and
     append it to the status message. Small, additive.
5. `src/main/snmp/client.walkguard.test.ts` (new)
   - Mock `net-snmp` session (deterministic, no device) with a scripted non-lex
     sequence and a looping sequence. Cover AC1–AC3 for both walk styles.
6. Keep `src/main/snmp/client.realagent.test.ts` (AC4 regression; already green).
7. `.trellis/spec/backend/snmp-guidelines.md` Constraint 8
   - Rewrite guard (a) row, Signatures (drop `compareOids`), Why, Tests Required,
     Wrong/Correct, and the oid.ts file note to describe the loop guard.

## Compatibility / rollback

Pure behavior widening (returns more rows; still stops on true loops). No persisted
format, no API shape change. Rollback = revert the commit.

## Test strategy

- Deterministic mock-session unit tests are the primary gate (AC1–AC3): a device is
  not required and CI stays hermetic.
- The real-agent E2E test (AC4) proves no regression on well-ordered agents.
- Manual confirmation already done against `172.16.67.180` (81 rows) via raw loops;
  after the code change re-run the real device once to confirm end-to-end.
