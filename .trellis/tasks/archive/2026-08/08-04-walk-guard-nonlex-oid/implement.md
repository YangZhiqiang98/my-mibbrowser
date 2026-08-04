# Implement — Walk/Bulk Loop Guard

Execution order. Each step lists its validation. Stop and reassess on any red gate.

## Step 1 — Backend guard swap (`src/main/snmp/client.ts`)

- [ ] `snmpWalk`: replace `let lastPushedOid: string | null = null` with
      `const seenOids = new Set<string>()`.
- [ ] `snmpWalk`: replace the monotonic guard block with the revisited-OID check
      (same position: after row-cap, before push). On trip:
      `finish(session, { success: true, varbinds: results, warning: \`Walk stopped: agent looped on OID ${key}.\`, responseTime, timestamp })`.
      Add `seenOids.add(key)` then `results.push(...)`.
- [ ] `snmpBulkWalk`: same swap inside the batch `for` loop, using the existing
      `warning = ...; hitEndOfMib = true; break` pattern (do NOT `finish()` mid-loop —
      preserve `onProgress` streaming of pre-guard rows).
- [ ] Change import to `import { isNoSuchNameEnd } from './oid'` (drop `compareOids`).

Validation: `npx vitest run src/main/snmp/client.realagent.test.ts` still green.

## Step 2 — Prune orphaned OID helpers (`src/main/snmp/oid.ts`, `oid.test.ts`)

- [ ] Remove `compareOids`, `isStrictlyIncreasing`, private `toSegments`.
- [ ] Keep `isNoSuchNameEnd`, `SNMP_NO_SUCH_NAME_STATUS`.
- [ ] `oid.test.ts`: delete the `compareOids` + `isStrictlyIncreasing` describe blocks
      and their now-unused imports.

Validation: `npm run typecheck` (no unreferenced-symbol / unused-import errors).

## Step 3 — New guard unit tests (`src/main/snmp/client.walkguard.test.ts`)

- [ ] `vi.mock('net-snmp')` with a fake session driven by a scripted response list
      (reuse the AuthProtocols/PrivProtocols/ObjectType/etc. stub shape).
- [ ] AC1: non-lex `getNext` sequence (root → `.9.<loopback1>` → `.7.<client1>` →
      `.7.<client2>` → out-of-subtree). Assert `snmpWalk` returns all 3, `warning`
      undefined.
- [ ] AC2: same sequence delivered via `getBulk` batches → `snmpBulkWalk` returns all 3.
- [ ] AC3: looping `getNext` (A → B → A again) → `snmpWalk` stops `success: true`,
      `warning` matches `/looped/`, `varbinds.length === 2`. Mirror for `snmpBulkWalk`.

Validation: `npx vitest run src/main/snmp/client.walkguard.test.ts` green.

## Step 4 — Surface warning in renderer

- [ ] `QueryPanel.tsx`: in the streaming and non-streaming `result.success` branches
      (not the `aborted` branch), if `result.warning` → `message.warning(result.warning)`
      and append ` — ${result.warning}` to the status message.
- [ ] `MibTreePanel.tsx`: same in its two matching success branches.

Validation: `npm run typecheck` + `npm run lint`.

## Step 5 — Spec update (`.trellis/spec/backend/snmp-guidelines.md`)

- [ ] Constraint 8: rename guard (a) to "Revisited-OID loop"; update the check to
      `seenOids.has(stripLeadingDot(vb.oid))`; update Signatures (remove `compareOids`),
      Why (non-lex agents are legitimate; loop = repeated OID), Tests Required, and the
      Wrong/Correct block. Update the `oid.ts` file note (drop `compareOids` /
      `isStrictlyIncreasing`).

Validation: re-grep `compareOids|isStrictlyIncreasing` → only archived tasks / journal
remain (no live src or spec references).

## Step 6 — Full gate

- [ ] `npm run typecheck` && `npm run lint` && `npm run test` all green.
- [ ] Re-run raw diagnostic against `172.16.67.180` node `1.3.6.1.4.1.8886.1.82.1.1.1.3`
      through the real `snmpWalk` (temporary throwaway check) → 81 rows. Remove the
      throwaway; keep the committed hermetic tests.

## Rollback points

- After Step 1 the real-agent test proves no regression; if red, revert Step 1 only.
- The renderer change (Step 4) is independent; it can be reverted without touching the
  backend fix.
