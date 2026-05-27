# Package Project as Program

## Goal

Build the existing Electron desktop application into a runnable packaged program for the current Windows environment.

## Requirements

* Use the repository's existing Electron/Vite and electron-builder configuration.
* Produce a Windows x64 NSIS installer from `electron-builder.json5`.
* Do not change application behavior or source code unless packaging fails and a minimal packaging fix is required.
* Report the generated installer path and any verification commands run.

## Acceptance Criteria

* [ ] `npm run build` completes successfully.
* [ ] `npx electron-builder --win --x64` completes successfully.
* [ ] The packaged installer exists under `dist/`.

## Definition of Done

* Build output is generated.
* Packaging output is generated.
* Any failure is reported with the actionable error and next step.

## Technical Approach

The project already defines Electron build assets in `electron-builder.json5`; on Windows this targets an x64 NSIS installer. Use the checked-in npm dependencies and existing scripts rather than adding a new packaging path.

## Decision (ADR-lite)

**Context**: The user asked to package the project as a program, and the repository is an Electron desktop app with existing builder configuration.

**Decision**: Build with `npm run build`, then package the Windows x64 installer with `npx electron-builder --win --x64`.

**Consequences**: The output follows the existing product metadata, icons, and installer settings. Cross-platform packages are out of scope for this run.

## Out of Scope

* macOS DMG or Linux AppImage packaging.
* Code signing.
* Installer branding changes.
* Application source changes unless needed to unblock packaging.

## Technical Notes

* `package.json` contains `build`, `typecheck`, `lint`, and test scripts, but no package script.
* `electron-builder.json5` configures Windows `nsis` target for `x64`.
* README documents `npm run build` and `npx electron-builder` as the intended packaging flow.
