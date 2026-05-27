# Manage Cache Directories

## Goal

Make MIB cache directories visible and manageable in the UI, so users can confirm where cached files are stored, load cached MIBs from configured cache sources, and remove cache sources without digging into app data files.

## What I Already Know

* The app currently supports selecting a single custom cache directory from the MIB tree panel.
* The current single cache directory is stored in `cache-dir-config.json` under Electron `app.getPath('userData')`.
* If no valid custom directory exists, the backend falls back to `app.getPath('userData')`.
* The preload API already exposes `window.api.mib.getCacheDir()`.
* The UI currently has a `Cache` button in the MIB tree header, but it only opens the folder picker. It does not show or manage configured cache directories.
* Current cache loading reads all `mib-cache-*.json` files from the single configured directory and merges the modules.

## Requirements

* Provide a stable UI entry point where users can see configured cache directories.
* Use a compact cache directories modal opened from the existing MIB tree `Cache` control.
* Support multiple cache directories as cache sources.
* Load cached MIBs from all enabled cache directories.
* Let users add/select cache directories.
* Newly added cache directories should be enabled by default and loaded immediately.
* Let users enable or disable cache directories at the directory level.
* Let users remove a cache directory from the configured source list.
* When removing a cache directory, let users choose either:
  * Remove it only from the app's cache directory list.
  * Remove it from the list and also delete its `mib-cache-*.json` cache files from disk.
* Make non-destructive removal the default path.
* Require explicit confirmation before deleting cache files from disk.
* Do not support per-MIB/module selection inside cache directories.
* Preserve existing single-directory users by migrating or reading the existing `cache-dir-config.json` value.

## Acceptance Criteria

* [ ] A user can open cache directory management from the MIB tree UI.
* [ ] The UI shows configured cache directories and their enabled/disabled state.
* [ ] Clicking the existing cache control does not force users to re-select a directory just to see cache settings.
* [ ] Users can add a cache directory and it appears in the list immediately.
* [ ] Newly added cache directories are enabled and loaded immediately.
* [ ] Users can enable or disable a cache directory.
* [ ] Startup or manual cache loading loads cache files from all enabled directories.
* [ ] Removing a directory offers both list-only removal and cache-file deletion.
* [ ] The cache-file delete option has explicit destructive confirmation.
* [ ] Per-MIB/module selection is not present.
* [ ] Long paths remain readable without breaking the modal layout.
* [ ] Existing lint/typecheck pass.

## Definition of Done

* Tests added or updated where appropriate.
* Lint and typecheck pass.
* UI checked against existing Ant Design patterns in the project.
* Docs or spec updated only if the change establishes a new convention.

## Technical Approach

Extend the existing renderer-to-main cache API from single-directory settings to cache-source management:

* Add a cache-source config model with backward compatibility for the existing single `cacheDir`.
* Add main-process handlers and preload types for listing, adding, enabling/disabling, and removing cache directories.
* Update cache loading to merge `mib-cache-*.json` files from all enabled directories.
* Change the existing `Cache` button so it opens a management modal instead of directly opening the directory picker.
* In the modal, show directory paths, enabled state, and actions.
* For deletion, use a two-step flow: first choose list-only removal vs cache-file deletion, then confirm cache-file deletion explicitly.
* Keep cache loading behavior directory-level only; no per-MIB/module selector.

## Decision (ADR-lite)

**Context**: The existing `Cache` button immediately opens a folder picker, so users cannot inspect or manage cache directories. The desired behavior has grown from displaying one directory into managing multiple cache directories.

**Decision**: Implement a compact Cache Directories modal opened from the existing `Cache` button. The modal manages cache directories at directory granularity: add, enable/disable, remove from list, and optionally delete `mib-cache-*.json` files from disk during removal. Newly added directories are enabled and loaded immediately. The app will not support selecting individual MIB modules from cache.

**Consequences**: This is a broader change than a simple visibility fix because it touches settings persistence, cache-loading behavior, preload types, and UI. Directory-level management keeps the feature understandable and avoids a noisy per-MIB selector.

## Out of Scope

* Per-MIB/module selection inside cache files.
* Migrating cache files between directories.
* Opening cache directories in the OS file explorer.
* Redesigning all application settings.

## Implementation Plan

1. Read frontend/backend Trellis specs before editing.
2. Add or adapt a cache-source config shape while preserving the existing single-directory config.
3. Extend main-process cache handlers for list/add/update/remove operations.
4. Update `loadMibCache` so it loads all enabled cache directories.
5. Extend preload and renderer types for the new cache-source API.
6. Build the Cache Directories modal in `MibTreePanel`.
7. Wire add, enable/disable, list-only remove, and confirmed disk-delete remove actions.
8. Add focused tests around config migration and multi-directory loading if practical.
9. Run lint and typecheck.

## Technical Notes

* Existing cache code: `src/main/ipc/handlers.ts`
* Existing preload API: `src/preload/index.ts`
* Existing UI entry point: `src/renderer/src/components/MibTreePanel.tsx`
* Existing modal patterns: `src/renderer/src/components/Toolbar.tsx`, `src/renderer/src/components/MibTreePanel.tsx`
* Frontend specs should be checked before implementation: `.trellis/spec/frontend/index.md`
* Backend specs should be checked before implementation because this now changes cache persistence/loading: `.trellis/spec/backend/index.md`
