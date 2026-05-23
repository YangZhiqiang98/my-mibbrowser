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

## Constraint 4: Cancellable SNMP Operations Use Single-Mutex Session Tracking

Every SNMP operation (`snmpGet`, `snmpGetNext`, `snmpGetBulk`, `snmpSet`, `snmpWalk`, `snmpBulkWalk`) must register its session in the module-level `currentSession` ref and resolve its Promise exclusively through a local `finish(session, result)` helper. External cancellation goes through `cancelCurrentSnmpOperation()` → `session.close()`, which makes any pending net-snmp callback fire with `Error("Socket forcibly closed")` on the next tick. The `abortRequested` flag distinguishes "user cancelled" from a real socket error and lets the operation resolve as `{ success: true, aborted: true, varbinds: collectedSoFar }` instead of `success: false`.

### Required Pattern

```typescript
// module-level singletons — UI is single-operation-at-a-time (appStore.isQuerying)
let currentSession: SnmpSession | null = null
let abortRequested = false

export function cancelCurrentSnmpOperation(): boolean {
  if (!currentSession) return false
  abortRequested = true
  try { currentSession.close() } catch { /* ERR_SOCKET_DGRAM_NOT_RUNNING — fine */ }
  return true
}

export function snmpXxx(...): Promise<SnmpResult> {
  return new Promise((resolve) => {
    let settled = false

    // Sole exit point. Order matters: null the ref BEFORE close() so a racing
    // cancel cannot see a stale session.
    const finish = (session: SnmpSession | null, result: SnmpResult) => {
      if (settled) return
      settled = true
      if (currentSession === session) currentSession = null
      if (session) {
        try { session.close() } catch { /* may already be closed by abort */ }
      }
      resolve(result)
    }

    let session: SnmpSession
    try {
      session = createSession(config)
    } catch (e) {
      finish(null, { success: false, error: String(e), /* ... */ })
      return
    }

    currentSession = session
    abortRequested = false

    try {
      session.xxx(args, (error, varbinds) => {
        // Abort takes priority — close() fires this with "Socket forcibly
        // closed" which would otherwise look like a generic error.
        if (abortRequested) {
          finish(session, { success: true, aborted: true, varbinds: results, /* ... */ })
          return
        }
        if (error) { finish(session, { success: false, /* ... */ }); return }
        // ...success path...
        finish(session, { success: true, varbinds: results, /* ... */ })
      })
    } catch (e) {
      finish(session, { success: false, error: String(e), /* ... */ })
    }
  })
}
```

For walk-shaped loops (`snmpWalk`, `snmpBulkWalk`), the abort check goes BOTH in the callback entry AND immediately before any recursive `session.getNext` / `session.getBulk` re-issue:

```typescript
if (abortRequested) return  // cancel landed between for-loop and recursion
try { session.getNext([lastOid], callback) } catch (e) { finish(session, /* error */) }
```

### Why

- **`net-snmp` v3 has no per-request cancel API** — `session.close()` is the only mechanism, and it tears down the underlying UDP socket. Pending callbacks fire on the next tick with a plain `Error("Socket forcibly closed")`. Without the `abortRequested` flag the cancellation is indistinguishable from a transport error and the operation resolves as `success: false`, which the renderer treats as a connection failure.
- **`session.close()` is not idempotent.** A second call throws `ERR_SOCKET_DGRAM_NOT_RUNNING`. Without the try/catch in both `cancelCurrentSnmpOperation` and `finish`, a normal-completion finish racing with an abort throws and crashes the IPC handler. (`session.close()` happens twice in the abort path: once via `cancelCurrentSnmpOperation` to trigger the close-induced callback, once via `finish` because every exit path must close the session.)
- **`settled` is a per-Promise guard.** Without it, a callback that fires after another exit (e.g., the close-induced callback arriving after `session.close()` in `finish`) calls `resolve` twice. The second `resolve` is a silent no-op in Promise semantics, but the side effects of `finish` (`currentSession = null`, `session.close()`) are not — running them twice nulls a freshly-set `currentSession` for the next operation and triggers the double-close throw.
- **The `currentSession = null` order matters.** Setting it AFTER `session.close()` opens a window where a concurrent `cancelCurrentSnmpOperation()` would call `close()` on an already-closed session and observe ERR_SOCKET_DGRAM_NOT_RUNNING — caught, but adds noise. More importantly, the next operation could start, set `currentSession = newSession`, and then the still-running `finish` would null the new ref.
- **The walk-loop pre-recursion abort check is load-bearing.** Without `if (abortRequested) return` before `session.getNext(...)`, a cancel that lands between the for-loop's last iteration and the recursive call would re-issue a getNext on a freshly-closed socket. `net-snmp` queues the request and then immediately delivers a close error via the callback; the callback resolves as aborted, which is correct, but the spurious `getNext` call has been observed to leak file descriptors on some platforms.

### How to Apply

- **New SNMP operation**: copy the full template above. The `finish` helper is per-function (closes over the local `settled`); the `currentSession` and `abortRequested` refs are module-level singletons shared by all operations.
- **Never call `resolve(...)` directly.** Every exit path — success, error, abort, sync-throw — goes through `finish(session, result)`. Bypassing `finish` skips `settled` (double-resolve) and the `currentSession` cleanup (leak).
- **Never call `session.close()` outside `finish` or `cancelCurrentSnmpOperation`.** Those are the only two authorized closers; both have the try/catch.
- **The `currentSession` ref assumes UI single-mutex** (`appStore.isQuerying` boolean, see [frontend/state-management.md](../frontend/state-management.md)). If the renderer ever supports concurrent SNMP operations, this singleton must be replaced with a token-keyed map BEFORE the new entry points ship — otherwise a cancel intended for op A can hit op B's session.
- **IPC layer**: register `snmp:cancel` in `handlers.ts` and expose `cancel(): Promise<boolean>` on the preload `window.api.snmp` bridge. The IPC handler is a one-line passthrough — no validation, no error wrapping (the underlying cancel cannot throw outside the try/catch).
- **`SnmpResult.aborted` is optional and ADDITIVE** to `success: true`. Renderers handle the aborted path inside their `if (result.success)` branch via a nested `if (result.aborted)` check. See [frontend/mib-tree-snmp-ops.md](../frontend/mib-tree-snmp-ops.md) for the four trigger sites.

---

## Constraint 5: Bulk Defaults Come From `SnmpConfig`

`snmpGetBulk(config, oids, maxRepetitions?, nonRepeaters?)` and `snmpBulkWalk(config, rootOid, maxRepetitions?)` must treat omitted bulk parameters as a request to use the connection configuration defaults:

```typescript
const effectiveMaxRepetitions = maxRepetitions ?? config.bulkMaxRepetitions
const effectiveNonRepeaters = nonRepeaters ?? config.bulkNonRepeaters
```

### Why

Bulk sizing is part of how this app talks to a device, not a local display preference of one component. Keeping those defaults on `SnmpConfig` means toolbar settings, profile loading, direct MIB-tree actions, query-panel actions, and tool-window actions all follow the same device connection contract. It also preserves compatibility when a caller intentionally omits optional IPC arguments.

### How to Apply

- Do not reintroduce hard-coded `10` / `0` defaults inside renderer call sites.
- If a future operation needs an explicit per-request override, pass it as the optional argument; the backend still falls back to `SnmpConfig` only when the argument is omitted.
- Any persisted or loaded `SnmpConfig` must include or be normalized to include `bulkMaxRepetitions` and `bulkNonRepeaters`.

---

## Cross-References

- `src/main/snmp/client.ts` — canonical implementations of `oidInSubtree`, `stripLeadingDot`, `formatVarbindValue`, `snmpWalk`, `snmpBulkWalk`, `snmpGetBulk`, `flattenBulkVarbinds`, `cancelCurrentSnmpOperation`, and the `finish(session, result)` pattern in all six SNMP entry points.
- `src/main/mib/parser.ts` — `resolveOidToName` is the other historical site for the leading-dot normalization rule. Any new OID-keyed lookup in the MIB layer must strip first.
- `src/main/ipc/handlers.ts` — `handleSnmpCancel` is the IPC passthrough; the actual cancel logic lives in `cancelCurrentSnmpOperation` in `client.ts`.
- [error-handling.md](./error-handling.md) — Walk results follow the `SnmpResult` envelope; out-of-subtree termination is not an error. Abort follows the same envelope with the additional `aborted: true` flag.
- [quality-guidelines.md](./quality-guidelines.md) — General code standards for the main process; includes the "no resource leaks" rule that motivates the strict `currentSession` clearing in `finish`.
