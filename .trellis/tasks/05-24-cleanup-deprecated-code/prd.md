# Cleanup Deprecated Code

## Goal

Review the project code for clearly deprecated, unreachable, or obsolete implementation left behind after newer designs were added, and make only safe corrections that can be proven from static references or tests.

## Requirements

* Identify production code that is no longer reachable from Electron/Vite runtime entrypoints.
* Remove or simplify only issues that are clearly proven; leave uncertain product/design choices untouched.
* Preserve the current unified GET / SET tool window behavior.
* Keep shared helpers that are still used by active code.
* Run typecheck, lint, and tests after changes.

## Acceptance Criteria

* [ ] No removed file is referenced by the production import graph.
* [ ] Active GET / SET tool window still has its shared row utilities, row component, and tests.
* [ ] Legacy-only store fields/actions are removed if no active code reads them.
* [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Definition of Done

* Obvious deprecated code is removed.
* No behavior change is introduced outside the proven cleanup scope.
* Quality checks are green.

## Out of Scope

* Redesigning the UI.
* Refactoring active SNMP, MIB parsing, or IPC behavior without a proven issue.
* Removing comments merely because they mention older PRs, unless the related code is also obsolete.

## Technical Notes

* Runtime roots inspected: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`.
* Static import graph found legacy production orphans under `src/renderer/src/components/GetMultiNodeDialog/` and modal-only files in `src/renderer/src/components/SetMultiNodeDialog/index.tsx` plus `src/renderer/src/components/useDraggableModal.tsx`.
* `src/renderer/src/components/SetMultiNodeDialog/SetToolWindowContent.tsx` is active via `ToolWindowApp` and must be preserved.
