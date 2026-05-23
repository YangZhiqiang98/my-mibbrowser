# Optimize Device Connection Settings UI

## Goal

Reduce clutter in the top toolbar by showing only the target IP/host inline, move SNMP connection parameters into a settings dialog, and make all device requests use the configured connection parameters. Add an explicit abort action so in-flight SNMP requests can be stopped from the UI.

## What I Already Know

* The current toolbar shows host, port, version, community/v3 config, timeout, retries, profile actions, and test connection inline.
* `src/renderer/src/stores/appStore.ts` stores a single global `snmpConfig`; most SNMP calls already read from this store or from a tool-window context seeded from it.
* `src/main/snmp/types.ts` defines `SnmpConfig` without GETBULK defaults; `QueryPanel` currently keeps `maxRepetitions` as local component state.
* `src/main/snmp/client.ts`, `src/main/ipc/handlers.ts`, and `src/preload/index.ts` already expose a `snmp:cancel` / `window.api.snmp.cancel()` path and `SnmpResult.aborted`.
* Main query and multi-node GET/SET dialogs already contain partial aborted-result handling, but there is no obvious user-facing abort control in the request UI.

## Requirements

* Top toolbar should display the device target compactly as the IP/host only.
* A tool/settings button next to the IP/host opens a connection settings dialog.
* The settings dialog includes SNMP connection parameters:
  * Host/IP
  * Port
  * SNMP version
  * Community for v1/v2c
  * SNMPv3 security level, username, auth protocol/password, privacy protocol/password
  * Timeout
  * Retries
  * Bulk max repetitions
  * Bulk non-repeaters if supported by existing request flow
* Saved profile loading/saving should continue to work with the connection config.
* Device requests must use the current global connection settings after the dialog is changed.
* GETBULK and BULK_WALK default repeat count should come from the global connection setting unless a more specific per-operation override is intentionally kept.
* Add an abort action for SNMP requests:
  * Expose a visible Stop/Abort button while a request is in flight.
  * The button calls the existing `window.api.snmp.cancel()` API.
  * Abort should update request/status text as cancelled/aborted, not as a failed device error.
  * Partial WALK/BULK_WALK results, when already collected, should remain visible.
* Tool-window GET/SET requests should use the same connection settings snapshot passed from the main window.

## Acceptance Criteria

* [ ] Toolbar no longer shows port/version/community/timeout/retries as separate inline controls.
* [ ] Toolbar shows the current host/IP and a settings button beside it.
* [ ] Settings dialog can edit all core SNMP connection fields and bulk defaults.
* [ ] Running GET/GETBULK/WALK/BULK_WALK/SET uses the updated settings.
* [ ] GETBULK/BULK_WALK use the configured bulk max repetitions by default.
* [ ] In-flight SNMP requests show an abort control and calling it stops the backend operation.
* [ ] Aborted requests do not show normal failure toasts; status reflects that the operation was aborted.
* [ ] Existing profile save/load still preserves connection fields.
* [ ] Lint/type-check pass.

## Definition of Done

* Tests added or updated where practical for changed non-UI logic.
* Lint and type-check pass.
* UI remains compact and consistent with existing Ant Design layout.
* Docs/spec updates considered if this establishes a reusable connection-settings pattern.

## Technical Approach

Use the existing global `snmpConfig` as the single source of truth. Extend it with bulk defaults, update profile mapping to preserve those fields, replace the inline toolbar controls with a compact host display plus a connection settings modal, and update request panels to read bulk defaults from `snmpConfig`.

For abort, reuse the existing `window.api.snmp.cancel()` bridge and `cancelCurrentSnmpOperation()` backend behavior. Add request-scope UI controls that are only enabled while a request is in flight, and keep current aborted-result handling semantics.

## Decision (ADR-lite)

**Context**: Connection controls currently occupy too much toolbar space, and bulk parameters are split from the rest of the device connection state.

**Decision**: Keep one global connection configuration in the renderer store and edit it through a modal. Do not introduce a separate device/session model in this task.

**Consequences**: The implementation stays small and matches existing request plumbing. Tool windows keep using a snapshot of the config they were opened with; live synchronization between main and already-open tool windows is out of scope unless the current tool-window context update path already makes it cheap.

## Out of Scope

* Multiple simultaneous device profiles/sessions.
* Persistent app settings beyond the existing profile save/load mechanism.
* Redesigning result tables or MIB tree interactions.
* Replacing the existing net-snmp cancellation approach.

## Technical Notes

* Relevant files inspected:
  * `src/renderer/src/components/Toolbar.tsx`
  * `src/renderer/src/components/QueryPanel.tsx`
  * `src/renderer/src/stores/appStore.ts`
  * `src/main/snmp/types.ts`
  * `src/main/snmp/client.ts`
  * `src/main/ipc/handlers.ts`
  * `src/preload/index.ts`
  * `src/renderer/src/components/GetMultiNodeDialog/index.tsx`
  * `src/renderer/src/components/SetMultiNodeDialog/index.tsx`
  * `src/renderer/src/components/SetMultiNodeDialog/SetToolWindowContent.tsx`
* Relevant specs discovered:
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/mib-tree-snmp-ops.md`
  * `.trellis/spec/backend/snmp-guidelines.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`
  * `.trellis/spec/guides/code-reuse-thinking-guide.md`
