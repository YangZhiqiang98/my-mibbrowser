# Stream Walk Results in Results Panel

## Goal

Fix the remaining WALK / BULK_WALK streaming gap where progress events may already be emitted, but the main Results Panel still appears to render only after the operation completes for some walk entry points.

## Requirements

* WALK and BULK_WALK started from the main Query Panel must continue to stream rows into Results Panel.
* WALK and BULK_WALK started from the MIB tree right-click menu must also stream rows into Results Panel as progress batches arrive.
* Streaming entry points must initialize an empty result session before invoking the SNMP request, append resolved progress varbinds into that session, and finalize response time / timestamp when the invoke resolves.
* Abort must preserve the rows collected so far instead of replacing them with a one-shot rebuilt session.
* Non-streaming operations (GET, GETNEXT, GETBULK, SET) must keep the existing overwrite behavior through `buildResultSession`.
* Progress listeners must be cleaned up after each streaming operation so future operations do not duplicate appends.

## Acceptance Criteria

* [ ] MIB tree right-click WALK shows rows in Results Panel while the operation is still running.
* [ ] MIB tree right-click BULK_WALK shows rows in Results Panel while the operation is still running.
* [ ] Query Panel WALK / BULK_WALK still stream rows.
* [ ] Stop / cancel keeps partial rows visible and reports the aborted row count.
* [ ] GET / GETNEXT / GETBULK / SET behavior is unchanged.
* [ ] Typecheck and lint pass.

## Definition of Done

* Implementation follows the frontend SNMP operation result contracts.
* Lint and typecheck pass, or any failure is recorded with cause.
* No unrelated working tree changes are reverted.

## Technical Approach

The backend and preload layers already expose `snmp:walk-progress`, and `QueryPanel` already consumes it. The remaining bug is that `MibTreePanel.executeSnmpOperation` starts WALK / BULK_WALK through the same IPC endpoints but waits for the final promise and then writes a whole session with `buildResultSession`.

Implement the same streaming session lifecycle for MIB-tree WALK / BULK_WALK:

1. Detect `operation === 'WALK' || operation === 'BULK_WALK'`.
2. Before invoking the request, call `initResultSession(operation, oid)` and create one `initResolveContext(mibTree)` context.
3. Register `window.api.snmp.onWalkProgress` and append each batch through `appendResultVarbinds(raw.map(resolveVarbind))`.
4. On final success, finalize the existing session with `responseTime` and `timestamp` rather than rebuilding from the final result.
5. On abort, preserve the current streamed session and set the aborted status message.
6. Remove the listener in `finally`.

## Decision (ADR-lite)

**Context**: The app has multiple main-window WALK / BULK_WALK triggers. QueryPanel already streams; MibTreePanel direct actions still use one-shot final writes.

**Decision**: Extend the MibTreePanel direct-operation path to use the existing streaming store actions and resolver utilities. Do not change backend IPC contracts.

**Consequences**: This keeps the fix narrow and consistent with existing QueryPanel behavior. A future cleanup could extract a shared hook for SNMP operation execution, but this bug fix should not refactor all operation flows unless required.

## Out of Scope

* Streaming Table Viewer loading.
* Changing SNMP client, IPC, preload, or ResultsPanel rendering semantics.
* Adding multi-session history or concurrent SNMP operations.

## Technical Notes

* `src/main/ipc/handlers.ts` already sends `snmp:walk-progress` for both `snmp:walk` and `snmp:bulk-walk`.
* `src/renderer/src/components/QueryPanel.tsx` already calls `initResultSession`, `onWalkProgress`, `appendResultVarbinds`, and finalizes the current session.
* `src/renderer/src/components/MibTreePanel.tsx` currently calls final `buildResultSession` for every direct operation, including WALK / BULK_WALK.
* Relevant specs: `.trellis/spec/frontend/mib-tree-snmp-ops.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/backend/snmp-guidelines.md`.
