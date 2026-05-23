# Research: net-snmp cancellation / close API (v3.26.3)

- **Query**: How does `net-snmp` cancel an in-flight WALK / BULKWALK so we can implement an "abort" button in the Electron app?
- **Scope**: internal (`node_modules/net-snmp/index.js`) + external (GitHub README/issues)
- **Date**: 2026-05-23

---

## TL;DR

`net-snmp` has **exactly one** cancellation primitive: `session.close()`. There is no
per-request `cancel()` API. Calling `close()` closes the underlying UDP socket; on
the next event-loop tick the socket emits `'close'`, which fires
`Session.prototype.onClose` → `cancelRequests(new Error("Socket forcibly closed"))`.
That iterates every pending request in `this.reqs` and invokes each request's
`responseCb` with that error. So any pending `getNext` / `getBulk` callback **is
guaranteed to fire exactly once after `close()`**, with a vanilla `Error` whose
`.message === "Socket forcibly closed"`. To abort a walk loop we therefore just
call `session.close()` from outside the loop and recognise that error message in
the recursive callback as "user-aborted, stop and resolve cleanly".

---

## `session.close()` behavior

### Source

`node_modules/net-snmp/index.js` — verified in v3.26.3 (`package.json` line 3):

```js
// Lines 2102-2105
Session.prototype.close = function () {
    this.dgram.close ();
    return this;
};

// Lines 2107-2114
Session.prototype.cancelRequests = function (error) {
    var id;
    for (id in this.reqs) {
        var req = this.reqs[id];
        this.unregisterRequest (req.getId ());
        req.responseCb (error);
    }
};

// Lines 2404-2407
Session.prototype.onClose = function () {
    this.cancelRequests (new Error ("Socket forcibly closed"));
    this.emit ("close");
};
```

### What actually happens, step-by-step

1. `session.close()` calls `this.dgram.close()` and returns immediately.
   `dgram.Socket.close()` is **asynchronous** — the socket is scheduled to close
   and emits `'close'` on a later tick.
2. When the socket emits `'close'`, the listener registered at construction
   (`index.js:2093`) invokes `Session.prototype.onClose`.
3. `onClose` calls `cancelRequests(new Error("Socket forcibly closed"))`, which
   iterates `this.reqs` (the in-flight request map keyed by request id) and for
   each entry:
   - removes it via `unregisterRequest(id)` — this also clears the per-request
     retry/timeout timer (`clearTimeout(req.timer)`, lines 2877-2890),
     decrements `reqCount`, and `unref()`s the socket when the count hits 0.
   - calls `req.responseCb(error)` exactly once.
4. The session then `emit("close")` — observable via
   `session.on("close", cb)`.

### Error shape passed to the pending callback

- **Class**: plain `new Error(...)` (NOT one of the library's custom subclasses
  like `RequestTimedOutError`, `RequestFailedError`, `ResponseInvalidError`).
- **`error.message`**: the exact string `"Socket forcibly closed"`.
- **`error instanceof Error`**: `true`.
- **`error.code` / `error.status`**: not set.

The README documents this contract under
[`session.on("close", callback)`](https://github.com/markabrahams/node-net-snmp#sessiononclose-callback) (README lines 701-720).

### Socket lifecycle

- The UDP socket is **really closed** at the OS level. Late datagrams that
  arrive after the kernel closes the socket are dropped by the kernel and
  never reach `onMsg`. There is no "silent discard inside the library" — the
  cancellation happens at the socket layer.
- Pending `setTimeout` retry/timeout timers are cleared inside
  `unregisterRequest`, so they cannot fire a duplicate `responseCb`.
- Each request id is removed from `this.reqs` before its callback is invoked,
  so if a stray response did somehow arrive between `close()` being called
  and the socket actually closing, `onMsg`'s lookup at line 2421
  (`var req = this.unregisterRequest(message.getReqId());`) would return
  `null` (lines 2422-2423: `if ( ! req ) return;`) and the message would be
  silently dropped. No double callback.

### Timing caveat (important for our walk loop)

Because `dgram.close()` is asynchronous, between the lines:

```js
session.close();             // returns immediately
session.getNext([...], cb);  // would still try to send!
```

the socket is still technically open. If you call `getNext` after `close()`
but before the `'close'` event fires, you get unpredictable behaviour
(`dgram.send` on a closing socket throws synchronously inside the try/catch at
`index.js:2513-2536`, which makes the new request's `responseCb` fire
immediately with that thrown error). So our abort logic must **only call
`close()`; never enqueue another request after the abort signal**.

---

## Per-request cancellation

**Not supported as a public API.**

- The README has zero mentions of `cancelRequest`, `abort`, or any
  per-request cancellation primitive (`grep` over README returns only the
  `close`/`cancelled` wording quoted above).
- The source has `Session.prototype.cancelRequests` (plural, lines 2107-2114).
  Because `Session` is exported (`exports.Session = Session`, line 6843), this
  method *is* technically reachable from user code. But:
  - It is undocumented.
  - It cancels **every** in-flight request on the session — not just one.
  - It does not close the socket. If callers rely on it for "abort just this
    walk", they need to ensure no other request shares the session.
- There is no `request.cancel()`-style return value. `session.get`/`getNext`/
  `getBulk` return `this` (the session) for chaining (lines 2162, e.g.), not a
  request handle. The request id is generated internally
  (`_generateId`, lines 2116-2121) and never surfaced to the caller.

### Result: confirmation

The only documented mechanism is `session.close()`. If finer control is needed,
the only undocumented option is calling
`session.cancelRequests(new Error("aborted by user"))` — but you still need to
manage socket lifetime separately, so it gains us nothing over `close()`.

---

## Resource hygiene

### Can the same session be reused after `close()`?

**No.** Once `dgram.close()` runs, the underlying UDP socket is destroyed and
the `Session` instance is no longer usable. Calling another `get`/`getNext`/
`getBulk` on a closed session will trigger a synchronous throw inside
`Session.prototype.send` (caught at line 2531: `req.responseCb(error)`) because
`dgram.send` cannot be called on a closed socket. The library does not expose
any "reopen" / "reconnect" API.

**Pattern**: always treat a `Session` as one-shot from the cancellation
boundary. For the next operation, create a fresh session via
`snmp.createSession()` / `snmp.createV3Session()`. This matches what our
existing code in `src/main/snmp/client.ts` already does — every top-level
operation (`snmpGet`, `snmpWalk`, etc.) creates a brand new session.

### Memory-leak gotchas

The library is careful about leak-on-close:

- `unregisterRequest` (lines 2877-2890) calls `clearTimeout(req.timer)` and
  `delete this.reqs[id]` before invoking the callback, so a successful close
  leaves `this.reqs` empty and no orphan timers.
- `dgram.unref()` is called on the socket initially (line 2089) and again when
  `reqCount` returns to 0 (line 2885), so the socket does not block process
  exit.
- The socket is bound only if `sourceAddress`/`sourcePort` were supplied
  (lines 2096-2097). Otherwise it's an ephemeral port the kernel reaps on
  close.

The one foot-gun is what our own code does in `client.ts`: if a callback path
inside our walk loop forgets to call `session.close()` on an error branch
(e.g., we throw out of a sync portion of the callback), the UDP socket stays
open. The library will not garbage-collect it — the `'close'`/`'error'`
listeners hold a strong reference back to the session. **Every code path in
the walk loop must terminate in a `session.close()`.**

---

## Recommended pattern for our walk loop

### Constraints from the source review

1. We need a way to signal "abort" from outside the Promise (an IPC handler).
2. After abort, the next `session.getNext` callback will fire with
   `Error("Socket forcibly closed")` — we must distinguish that from a real
   network error and resolve as "aborted", not "failed".
3. We must NOT call `session.getNext` / `session.getBulk` after triggering
   the abort, because the socket is mid-closing.
4. We must NOT double-resolve the outer Promise.

### Skeleton (illustrative — do not commit to source tree)

```ts
type AbortController = { abort: () => void; aborted: () => boolean }

export function snmpWalk(
  config: SnmpConfig,
  rootOid: string,
  signal?: AbortController     // <-- new optional parameter
): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)
    const results: SnmpVarbind[] = []
    let settled = false                                   // double-resolve guard

    const finish = (payload: Partial<SnmpResult>) => {
      if (settled) return
      settled = true
      try { session.close() } catch { /* already closed */ }
      resolve({
        success: true,
        varbinds: results,
        responseTime: Date.now() - startTime,
        timestamp: Date.now(),
        ...payload,
      })
    }

    // External abort: just close the socket. The pending callback will fire
    // with "Socket forcibly closed" and the branch below will resolve as
    // aborted. The signal must be idempotent.
    const onAbort = () => {
      if (settled) return
      try { session.close() } catch { /* race: close already running */ }
      // Do NOT resolve here — let the pending callback's error branch resolve.
      // That guarantees we observe the "Socket forcibly closed" once and only
      // once, and avoids racing with a response that's already in onMsg's
      // microtask queue.
    }
    signal?.onAbort?.(onAbort)   // however the signal is wired

    const callback = (error: unknown, varbinds: unknown[]) => {
      if (settled) return        // late callback after we already resolved

      if (error) {
        const msg = (error as Error)?.message ?? String(error)
        const aborted = msg === 'Socket forcibly closed' || signal?.aborted()
        return finish({
          success: !aborted ? false : true,
          aborted,                                  // surface to UI
          error: aborted ? undefined : String(error),
        })
      }

      // ... existing endOfMib / out-of-subtree / push logic ...

      if (signal?.aborted()) {
        return finish({ aborted: true })            // belt-and-braces
      }

      if (varbinds.length > 0) {
        const lastOid = stripLeadingDot(
          (varbinds[varbinds.length - 1] as { oid: string }).oid
        )
        session.getNext([lastOid], callback)
      } else {
        finish({})
      }
    }

    session.getNext([rootOid], callback)
  })
}
```

### Key design decisions justified by the source

- **Trigger abort by `session.close()` only, never by resolving the Promise
  first.** Resolving first would leave the pending UDP request's callback
  pending; when net-snmp eventually fires it (either with a real response or
  with `"Socket forcibly closed"`), the callback would re-enter the recursive
  walk and either issue another `getNext` on a dead socket or push more
  results into the already-resolved array. The `settled` guard plus
  "let the library deliver the closure error" gives us a single, predictable
  resolution point.
- **Trust that the callback will fire.** The source proves
  `cancelRequests` walks every entry of `this.reqs` and invokes each
  `responseCb` synchronously. So there is no "hang" risk after `close()` —
  the callback is guaranteed within one tick (the tick on which `'close'`
  fires).
- **Recognise the closure error by string match.** It is a plain `Error` with
  an exact message. There is no nicer marker class. If we wanted to avoid
  string-match brittleness, we could set a flag before calling `close()`
  (`this.aborted = true`) and check that flag in the error branch — see
  `signal?.aborted()` above as the belt-and-braces version.
- **`try { session.close() } catch`**. Calling `close()` twice on a
  `dgram.Socket` throws `ERR_SOCKET_DGRAM_NOT_RUNNING`. Guard against double
  close (e.g., user clicks abort right as walk naturally finishes).
- **`bulkWalk` gets the same skeleton.** Same error string, same callback
  contract (`Session.prototype.getBulk` uses the same `send` →
  `registerRequest` → `cancelRequests` pipeline).

---

## Version specifics

- Our pinned version is `^3.26.3` (`package.json` declares `"net-snmp":
  "^3.26.3"`; the installed copy is `3.26.3` per
  `node_modules/net-snmp/package.json`).
- The `close()`/`cancelRequests`/`onClose` plumbing has been in place since
  **v1.1.13 (Aug 2014)** per the README changelog (line 3098), and was
  unchanged across the v2 → v3 boundary in Dec 2020. The v3 release
  (README line 3368, "Version 3.0.0 - 30/12/2020") added SNMPv3 — it did
  not touch close semantics.
- Every changelog entry through v3.19.x makes no mention of `cancel` or
  `abort`. No behaviour change to track between v2 and v3 for this concern.
- Conclusion: the findings above apply identically to any v2.x and all
  v3.x releases.

---

## References

### Local source (authoritative)

- `node_modules/net-snmp/index.js:2102-2105` — `Session.prototype.close`
- `node_modules/net-snmp/index.js:2107-2114` — `Session.prototype.cancelRequests`
- `node_modules/net-snmp/index.js:2404-2407` — `Session.prototype.onClose`
- `node_modules/net-snmp/index.js:2421-2423` — late-response guard in `onMsg`
- `node_modules/net-snmp/index.js:2491-2511` — `registerRequest` + retry timer
- `node_modules/net-snmp/index.js:2513-2536` — `send` (synchronous throw on
  closed socket)
- `node_modules/net-snmp/index.js:2877-2890` — `unregisterRequest`
- `node_modules/net-snmp/index.js:2087-2098` — UDP socket construction +
  `'close'`/`'error'` listener wiring
- `node_modules/net-snmp/package.json:3` — version `3.26.3`

### Project source touched by the change

- `src/main/snmp/client.ts:364-436` — `snmpWalk` recursive callback
- `src/main/snmp/client.ts:441-503` — `snmpBulkWalk` recursive callback

### README sections

- `node_modules/net-snmp/README.md:701-720` — documented contract for
  `session.on("close", ...)` including the `"Socket forcibly closed"` error
  message text.
- `node_modules/net-snmp/README.md:742-753` — `session.close()` docs.
- `node_modules/net-snmp/README.md:3098-3115` — changelog entry where this
  behaviour was introduced (v1.1.13, 2014).

### Upstream

- GitHub: https://github.com/markabrahams/node-net-snmp (canonical README)
- Issue/PR search for `cancel` / `abort` returns only two unrelated results
  (#148 about an early-abort bug in `subtree`, #242 about a `subtree`
  callback return-value fix). No open or closed discussion of a per-request
  cancellation API.

---

## Caveats / Not found

- The library does not expose any user-visible hook to detect "the abort
  callback fired due to my close vs. a network-induced socket close." Both
  produce the same `Error("Socket forcibly closed")`. The recommended way to
  disambiguate is to set our own `aborted` flag immediately before calling
  `close()` and check it in the error branch.
- We did not run a live test against an SNMP agent to confirm timing under
  load. The source-based analysis is unambiguous (single synchronous loop
  inside `onClose`), so a behavioural test is "nice to have" but not
  required to design the abort contract.
- We did not investigate AgentX subagent close semantics, since this task
  is about command-side WALK/BULKWALK abort. Subagent close has its own
  TCP-based path and different error shape.
