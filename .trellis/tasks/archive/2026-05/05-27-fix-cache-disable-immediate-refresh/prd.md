# Fix Cache Disable Immediate Refresh

## Goal

Disabling a MIB cache directory in the Cache Directories modal must take effect immediately in the running application, without requiring an app restart.

## What I Already Know

* The Cache Directories modal calls `window.api.mib.setCacheDirEnabled(...)`.
* The main process writes `cache-dir-config.json`, calls `loadMibCache()`, and the renderer then refreshes the tree through `mib:get-tree`.
* Restart works because startup cache hydration reads only enabled cache directories.
* Runtime disable is expected to rebuild the current tree from the remaining enabled cache directories.
* Repro scenario from the user: open the Cache modal, disable the only configured cache directory, close the modal, and the MIB tree beside it still remains visible.
* Existing `.codex/config.toml` changes are unrelated and must not be included.

## Requirements

* Disabling a cache directory must immediately remove modules restored from that disabled cache directory from the current MIB tree.
* Enabling a cache directory must immediately load its cache files into the current MIB tree.
* The fix must preserve manually loaded MIB modules in the current session.
* Cache tracking must distinguish the cache storage directory from the original MIB source directory inside each cache file.
* No per-MIB selection is introduced.

## Acceptance Criteria

* [ ] Toggling a cache directory off in the modal immediately updates the tree and loaded module count.
* [ ] Disabling the only configured cache directory clears the adjacent MIB tree before or after closing the modal.
* [ ] Toggling it back on immediately reloads cache files from that directory.
* [ ] Disabling one cache directory does not remove modules from another still-enabled cache directory.
* [ ] Manual file/directory loads are not removed by cache-source toggles unless they are cache-restored modules from that cache source.
* [ ] Lint, typecheck, and tests pass.

## Technical Approach

Inspect the cache loading state in `src/main/ipc/handlers.ts`. If the current implementation tracks restored modules only by cache-file `sourceDir`, introduce a cache-source scoped key so runtime reload can remove exactly the modules that came from disabled cache storage directories. Add a focused unit test around the pure cache module tracking behavior.

## Out of Scope

* Redesigning the cache directory modal.
* Per-MIB/module cache toggles.
* Cache file migration between directories.
* Changing destructive deletion behavior.

## Technical Notes

* Relevant spec: `.trellis/spec/backend/app-settings.md` → "Cache Directory Sources IPC Contract".
* Relevant code: `src/main/ipc/handlers.ts`, `src/main/ipc/cacheDirectoryConfig.ts`.
