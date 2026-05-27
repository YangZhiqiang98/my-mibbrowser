# Add Fixed Packaging Scripts

## Goal

Provide repeatable package commands for the Electron app so release builds do not rely on ad hoc command sequences.

## Requirements

* Add a fixed Windows packaging entry that performs quality checks, builds the Electron/Vite output, and generates the configured Windows installer.
* Add a fixed macOS packaging entry that performs the same checks/build and invokes the configured macOS DMG packaging target.
* Add platform-specific script files so packaging can be run from a stable command and the command internals are visible.
* Clean previous `out/` and `dist/` artifacts before packaging so stale build output does not get confused with the current run.
* Use domestic mirrors for Electron and electron-builder helper binary downloads by default.
* Support `PACKAGE_PROXY` as an explicit opt-in proxy setting; do not default to a local proxy.
* Disable certificate auto-discovery in fixed scripts so local unsigned packaging does not depend on developer machine certificates.
* Disable Windows executable signing/resource editing to avoid legacy `winCodeSign` archive symlink extraction failures on normal Windows user accounts.
* Document the commands and clarify that macOS packaging is supported by the project config but should be run on macOS for reliable distributable artifacts.
* Do not add iOS packaging support; this is an Electron desktop app.

## Acceptance Criteria

* [x] `npm run package:win` exists and calls a fixed Windows packaging script.
* [x] `npm run package:mac` exists and calls a fixed macOS packaging script.
* [x] Scripts clean previous build artifacts and fail fast on command errors.
* [x] Scripts configure domestic download mirrors by default.
* [x] Scripts only enable proxy variables when `PACKAGE_PROXY` is explicitly set.
* [x] Scripts disable code signing certificate auto-discovery.
* [x] Windows packaging avoids the `winCodeSign-2.6.0.7z` extraction path.
* [x] README documents Windows and macOS package commands and output directory.
* [x] `npm run typecheck`, `npm test`, and `npm run lint` pass after changes.

## Definition of Done

* Package scripts and docs are updated.
* Quality checks pass.
* No unrelated files are modified.

## Technical Approach

Use npm scripts as the public entry points and keep the actual command sequence in `scripts/package-win.ps1` and `scripts/package-mac.sh`. Both scripts configure domestic mirror environment variables, optionally configure proxy variables when `PACKAGE_PROXY` is set, disable certificate auto-discovery, safely remove `out/` and `dist/`, run typecheck, lint, tests, build, then the local `electron-builder` CLI with the correct platform flags and `--publish never`. Windows config sets `signAndEditExecutable: false` so local unsigned packaging does not require the legacy `winCodeSign` archive.

## Decision (ADR-lite)

**Context**: The project already uses electron-vite and electron-builder, with platform targets configured in `electron-builder.json5`.

**Decision**: Add thin fixed scripts around the existing config instead of moving packaging rules into custom code.

**Consequences**: The approach keeps packaging behavior aligned with electron-builder and makes future changes local to config or scripts. macOS packages still need a macOS build environment for reliable signing/notarization.

## Out of Scope

* iOS builds.
* Code signing certificates, Apple notarization setup, or release publishing.
* CI release automation.

## Technical Notes

* Existing files inspected: `package.json`, `electron-builder.json5`, `README.md`.
* Research notes: `research/electron-builder-platform-packaging.md`.
