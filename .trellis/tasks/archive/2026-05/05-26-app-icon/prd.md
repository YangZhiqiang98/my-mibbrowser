# Design Application Icon

## Goal

Replace the default Electron application icon with a project-owned icon for MIB Browser, and place the icon assets where Electron runtime and electron-builder packaging can use them.

## Requirements

* Create an original icon that fits a desktop SNMP/MIB browser: technical, clear at small sizes, and visually tied to network devices / MIB tree inspection.
* Store the editable source icon in the existing electron-builder build resources location.
* Provide packaged-app icon assets for Windows, macOS, and Linux, plus a PNG suitable for runtime `BrowserWindow` icon usage.
* Wire the main application window to use the icon during development/runtime where the platform supports it.
* Keep changes scoped to icon assets, app window icon configuration, and docs/task metadata.

## Acceptance Criteria

* [x] `build/icon.svg` exists as the editable source.
* [x] `build/icon.png` exists at high resolution for Linux/runtime use.
* [x] `build/icon.ico` exists for Windows electron-builder packaging.
* [x] `build/icon.icns` exists for macOS electron-builder packaging.
* [x] The main `BrowserWindow` references the packaged icon asset.
* [x] `npm run typecheck`, `npm run lint`, and `npm run build` pass.

## Definition of Done

* Assets are committed in the repository.
* Existing unrelated working-tree changes are not reverted or committed.
* README is updated if icon asset location becomes part of project structure documentation.

## Technical Approach

Use `build/` because `electron-builder.json5` already sets `directories.buildResources` to `"build"`, and electron-builder defaults platform icons under that folder. Keep SVG as the editable source, generate PNG/ICO/ICNS from the same design direction, and reference `../../build/icon.png` from the Electron main process so the development window is not left on the default icon.

## Decision (ADR-lite)

**Context**: The app currently falls back to the default Electron icon because no project-owned icon assets exist in the configured build resources directory.

**Decision**: Add a vector source plus generated PNG/ICO/ICNS assets under `build/`, using a restrained network-node and MIB-tree motif.

**Consequences**: Windows, macOS, Linux packaging and the runtime window get project icon assets now. Future brand work can refine the icon without changing the resource layout.

## Out of Scope

* A full brand identity system.
* Changing UI toolbar icons or in-app branding.

## Technical Notes

* `electron-builder.json5` already declares `directories.buildResources: "build"`.
* electron-builder schema defaults Windows icon to `build/icon.ico`.
* `src/main/index.ts` owns the main `BrowserWindow` options.
* Pillow is available locally and can generate PNG/ICO assets.
