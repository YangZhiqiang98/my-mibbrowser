# Improve MIB Warning Display

## Goal

Improve the MIB load warning/error UX so long dependency or parse messages do not occupy most of the screen and can be dismissed, while preserving access to the full diagnostic details when needed.

## What I Already Know

- The user provided a screenshot where `message.warning` renders a very long dependency warning across the app.
- Current warning code lives in `src/renderer/src/components/MibTreePanel.tsx`.
- `showParseFeedback` currently joins every parse error, dependency warning, and warning into Ant Design message toasts.
- Ant Design `message` is not a good surface for large multiline diagnostics.
- The app already uses Ant Design and has a status bar for concise summaries.

## Requirements

- Do not show full MIB dependency warning text in a large top toast.
- MIB load warning/error notifications must be dismissible.
- Show a short summary when warnings/errors exist, such as counts and a short first item.
- Provide an obvious way to view full details.
- Full details should be scrollable and should not block the whole app permanently.
- Keep successful load feedback concise.
- Preserve existing parse/dependency warning data; do not drop diagnostics.

## Acceptance Criteria

- [ ] Loading a MIB with many dependency warnings no longer creates a giant top message occupying the screen.
- [ ] Warning/error surface has a close button.
- [ ] Warning/error summary is short and bounded.
- [ ] Full warning/error details can be opened and read in a scrollable view.
- [ ] Existing success message and status updates continue to work.
- [ ] Typecheck, lint, tests, and build pass.

## Definition Of Done

- UI code is updated in `MibTreePanel.tsx`.
- Any needed CSS is scoped and responsive.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes.
- Trellis task is committed, archived, journaled, and pushed.

## Technical Approach

1. Replace long `message.error/warning` calls in `showParseFeedback` with a bounded Ant Design notification.
2. Add component state in `MibTreePanel` to hold the latest MIB diagnostics.
3. Add a Modal for full diagnostic details with separate sections for parse errors, dependency warnings, and warnings.
4. Render each diagnostic as a list item in a scrollable body.
5. Use a short notification description and a “View details” button.

## Decision (ADR-lite)

**Context**: Toast-style messages are useful for short success/error feedback but fail for large MIB diagnostic payloads.

**Decision**: Use short dismissible notifications for summaries and a modal for full diagnostic detail.

**Consequences**:

- The normal workspace stays usable after load.
- Users can still inspect full compiler/dependency details.
- Future diagnostics can reuse the same state/modal pattern.

## Out Of Scope

- Full compiler diagnostics panel.
- Persisting warning history.
- Filtering/searching diagnostics.
- Changing parser behavior.

## Technical Notes

- Relevant files:
  - `src/renderer/src/components/MibTreePanel.tsx`
  - `src/renderer/src/styles.css`
- Relevant specs:
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
