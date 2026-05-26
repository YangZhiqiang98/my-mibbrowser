# Add Trap and Inform Console

## Goal

Add a Trap / Inform console so MIB Browser can receive device-initiated SNMP notifications, not only actively query devices. The console should help users verify trap receiver configuration, inspect incoming event payloads, and decode OIDs through the currently loaded MIB tree.

## What I already know

* The user considers Trap / Inform console high value and wants to start this task.
* `README.md` currently lists Trap / Inform console as not implemented.
* The installed `net-snmp` package exposes `createReceiver(options, callback)`.
* `net-snmp` receiver accepts Trap, TrapV2, and InformRequest PDUs; InformRequest is automatically answered with a GetResponse ACK before callback delivery.
* Existing app architecture already has Electron main-process IPC, preload bridge, Zustand store, Ant Design panels, MIB OID name resolution, and debug log forwarding.

## Requirements

* Add a main-process singleton Trap / Inform receiver using the installed `net-snmp` library.
* Support start / stop from the renderer.
* Allow configuring local UDP listen port, transport family (`udp4` / `udp6`), community, and optional use of current SNMPv3 user/security settings.
* Default listen port should be a non-privileged port (`9162`) to avoid requiring admin/root privileges; users may change it to `162`.
* Display incoming Trap / Inform events live in a dedicated console panel.
* Show timestamp, source address/port, SNMP version when available, PDU type, community/user when available, enterprise/trap OID fields when available, and varbind count.
* Resolve each varbind OID to MIB name using the current loaded MIB tree in the main process before sending events to the renderer.
* Support filter, auto-scroll, copy, clear, and row detail expansion.
* Surface receiver start/stop/errors through status text and short toasts.
* Keep the receiver running until the user stops it or the app exits.

## Acceptance Criteria

* [x] User can open a Trap / Inform console from the main UI.
* [x] User can start listening on default port `9162`.
* [x] User can stop the listener and restart it.
* [x] Incoming v1/v2c Trap events appear live with source and varbinds.
* [x] Incoming Inform events appear live and are ACKed by the receiver library.
* [x] Varbind OIDs are displayed with resolved MIB names when loaded MIB metadata matches.
* [x] Receiver bind errors, such as port already in use or permission denied on port `162`, are shown clearly.
* [x] Console can filter, copy, clear, and auto-scroll received events.
* [x] Typecheck, lint, tests, and build pass.

## Definition of Done

* Tests added/updated for receiver event formatting and renderer store behavior where practical.
* `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
* README is updated to move Trap / Inform console out of the unimplemented list.
* Relevant `.trellis/spec/` contract is updated if a new IPC/event-flow convention is established.

## Technical Approach

* Add shared trap types under `src/shared/`.
* Add a main-process receiver service under `src/main/snmp/` that wraps `net-snmp.createReceiver`.
* Expose trap IPC in `src/main/ipc/handlers.ts` and `src/preload/index.ts`.
* Add trap event state/actions to `appStore`.
* Add a `TrapConsolePanel` renderer component using Ant Design controls and the existing dense operational panel style.
* Add a bridge in `App.tsx` to subscribe to `trap:event` and `trap:status` events.
* Keep all receiver state in main process; renderer state is a bounded display buffer.

## Decision (ADR-lite)

**Context**: SNMP notification receiving requires a UDP listener, authorization setup, cross-process event delivery, and clear user feedback for OS/network failures. The full feature can grow into persistence, dashboards, rules, and multi-profile receivers.

**Decision**: Implement a conservative receiver console MVP using the existing `net-snmp` package and a single main-process receiver instance. Default to port `9162` to work without elevated privileges. Use existing MIB tree state for name resolution. Defer persistence, alert rules, and multi-receiver management.

**Consequences**: The MVP is useful for real trap receiver validation and payload inspection while keeping scope controlled. Users who need port `162` may still select it, but OS permissions remain outside the app's control and must surface as a clear bind error.

## Out of Scope

* Sending Trap or Inform messages from this app.
* Running multiple receiver instances at once.
* Persistent trap history database.
* Alert rules, notifications, acknowledgements, or ticket integrations.
* Trap dashboard charts or trend analysis.
* Full SNMPv3 multi-user receiver management UI.
* TCP/TLS/DTLS notification transport.

## Technical Notes

* `node_modules/net-snmp/example/snmp-receiver.js` shows `createReceiver(options, callback)` and `receiver.getAuthorizer().addCommunity(...)`.
* `node_modules/net-snmp/index.js` shows InformRequest is converted to GetResponse and sent before callback delivery.
* Existing main-process MIB name resolution: `resolveOidToName(vb.oid, mibNodes)` in `src/main/ipc/handlers.ts`.
* Existing debug panel is a useful UI pattern for live append/copy/clear/auto-scroll.
* Relevant specs:
  * `.trellis/spec/backend/snmp-guidelines.md`
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/state-management.md`
  * `.trellis/spec/frontend/mib-tree-snmp-ops.md`

## Verification

* `npm run typecheck` passed.
* `npm run lint` passed.
* `npm test` passed: 10 test files, 67 tests.
* `npm run build` passed.
