# Add Debug Mode Logging

## Goal

Add a controlled debug mode that helps diagnose SNMP, MIB loading, IPC, and tool-window failures by printing useful internal context when enabled, while keeping normal app output quiet and avoiding sensitive credential leakage.

## What I Already Know

- The project currently has no structured logging framework.
- Backend logging guidelines forbid committed `console.log` and describe IPC result objects as the normal user-facing error path.
- Renderer and main process communicate through the preload `window.api` bridge.
- SNMP errors are wrapped in `SnmpResult`; MIB parse errors and warnings are returned in `MibParseResult`.
- The current app has connection settings in `Toolbar.tsx`, global renderer state in `appStore.ts`, and main-process IPC handlers in `handlers.ts`.

## Requirements

- Add a debug mode flag that is off by default.
- Expose a user-accessible Debug Mode toggle in the connection/settings UI.
- Synchronize the debug flag from renderer to main process through preload/IPC.
- Provide a small central logging helper instead of scattering raw `console.log`.
- When debug mode is enabled, log useful context for:
  - SNMP operation start, request parameters summary, success, failure, abort, response time, and session creation validation errors.
  - MIB load/cache/parse failures and returned parse warnings/errors.
  - IPC handler failures and tool-window open/update failures where applicable.
- Keep normal user-facing error behavior unchanged.
- Debug mode is an explicit local diagnostic mode. It should print community strings, SNMPv3 usernames/passwords, and SET values because these are needed to troubleshoot real device requests.
- Avoid logging full MIB file contents or large SNMP result payloads; log counts, operation names, OIDs, timing, and summarized errors.
- Debug mode should include ordinary request lifecycle logs, not just errors; for example every SNMP request should print when it starts and when it finishes.

## Acceptance Criteria

- [ ] Debug mode is off by default.
- [ ] User can toggle debug mode from the app UI.
- [ ] Toggling debug mode updates main-process logging behavior without restart.
- [ ] Main-process debug logging uses a central helper and never uses committed `console.log`.
- [ ] SNMP errors include operation/context details in debug logs while preserving existing `SnmpResult` behavior.
- [ ] SNMP request lifecycle logs include operation, target summary, OIDs, timing, success/failure, and varbind count when debug mode is enabled.
- [ ] MIB parse/load failures include useful debug logs without logging file contents.
- [ ] SNMP config fields and SET values are visible in debug logs when debug mode is enabled.
- [ ] Typecheck, lint, tests, and build pass.

## Definition Of Done

- Unit tests cover debug redaction and enabled/disabled behavior.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes.
- Trellis quality check is run after implementation.
- Work is committed, Trellis task is archived, journal is recorded, and changes are pushed.

## Technical Approach

1. Add shared debug setting types if needed.
2. Add a main-process debug logger module with:
   - `setDebugMode(enabled: boolean)`
   - `isDebugModeEnabled()`
   - `debugLog(scope, message, context?)`
   - `debugError(scope, message, error, context?)`
   - `prepareForDebugLog(value)` for summarizing large/binary values without hiding SNMP request fields
3. Add IPC handlers and preload API for reading/updating debug mode.
4. Add `debugMode` to renderer app state and a Switch in connection settings.
5. Add targeted debug logs to SNMP client and MIB/IPC boundaries.
6. Add unit tests for logging helper redaction and gate behavior.

## Decision (ADR-lite)

**Context**: The project needs better diagnostic output, but current specs forbid casual `console.log` and the app handles user-facing errors through IPC result objects.

**Decision**: Add a controlled debug logger that is explicitly enabled by the user and shared with the main process through IPC. Use `console.debug` / `console.error` only behind this helper, not directly in feature code.

**Consequences**:

- Debugging improves without changing normal UI behavior.
- Debug output can contain SNMP credentials and SET values; users should only enable it in trusted local debugging sessions.
- Future logging can be redirected to files or `electron-log` by changing one module.
- Some renderer-only failures still rely on visible user messages unless additional renderer logging is added later.

## Out Of Scope

- Persistent log files.
- Full logging framework such as `electron-log`.
- Remote telemetry.
- Capturing full packet bytes or full MIB file contents.
- Persisting debug mode across app restarts unless naturally supported by existing app settings.

## Technical Notes

- Applicable specs:
  - `.trellis/spec/backend/logging-guidelines.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/backend/quality-guidelines.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
