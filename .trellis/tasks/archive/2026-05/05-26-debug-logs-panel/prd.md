# Add Application Debug Logs Panel

## Goal

Add an in-app Debug Logs panel so users can inspect Debug Mode diagnostics inside the desktop UI instead of relying on the main-process terminal or DevTools.

## Requirements

* Make the in-app Debug Logs panel the primary debug output surface.
* Keep main-process debug console output only as a development fallback.
* When Debug Mode is enabled, forward main-process debug log entries to the main renderer process.
* Show forwarded entries in a main-window Debug Logs panel.
* The panel must support opening/closing, clearing entries, copying entries, and auto-scrolling to newest entries.
* Turning Debug Mode off stops new debug entries from being emitted, while already displayed entries remain visible until cleared.
* Sensitive SNMP fields may remain visible in the panel; this is acceptable for this application.
* Bound log retention in renderer memory to avoid unbounded growth during long sessions.

## Acceptance Criteria

* [ ] Debug Mode off: no new debug entries appear in the panel.
* [ ] Debug Mode on: SNMP/MIB/IPC debug entries appear in the panel without changing SNMP behavior.
* [ ] Main-process console debug/error output is not required in normal packaged app usage.
* [ ] Development fallback can still print debug/error output to the main-process console.
* [ ] Users can open/close the panel, clear entries, copy entries, and keep auto-scroll enabled.
* [ ] Type-check, lint, and tests pass.

## Definition of Done

* Tests added or updated for changed logging/store behavior where practical.
* Lint and TypeScript checks pass.
* README updated if user-visible debug behavior changes.
* No unrelated working-tree changes are reverted or committed.

## Technical Approach

Use the existing `src/main/debugLogger.ts` as the single diagnostic entry point. Add a small debug-log subscriber mechanism there, wire the main window to subscribe and forward entries over a typed IPC event, expose the event through preload, then render a bottom Debug Logs panel in the main React app using Zustand state for shared panel data/actions. Console output from the main process is treated as a development fallback, not the normal desktop-app output path.

## Decision (ADR-lite)

**Context**: Main-process logs are currently not visible in F12 because they run outside the renderer process.

**Decision**: Build an application panel instead of forwarding logs only to DevTools. The panel receives structured log entries over IPC and becomes the primary output. Main-process console output is retained only as a development fallback.

**Consequences**: The UI gains a user-facing diagnostic surface. The IPC contract now carries debug entries from main to renderer, so types must stay synchronized across main, preload, and renderer.

## Out of Scope

* Writing logs to disk.
* Filtering/searching logs beyond clear/copy/open/close in this MVP.
* Redacting SNMP credentials or SET values.
* Capturing logs emitted before the renderer subscription is active.

## Technical Notes

* Existing log entry point: `src/main/debugLogger.ts`.
* Existing debug IPC handlers: `src/main/ipc/handlers.ts`.
* Existing bridge: `src/preload/index.ts`.
* Existing renderer app shell: `src/renderer/src/App.tsx`.
* Existing global store: `src/renderer/src/stores/appStore.ts`.
* Relevant specs read:
  * `.trellis/spec/backend/logging-guidelines.md`
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/quality-guidelines.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`
  * `.trellis/spec/guides/code-reuse-thinking-guide.md`
