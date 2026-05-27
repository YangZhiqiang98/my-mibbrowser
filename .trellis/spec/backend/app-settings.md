# App Settings IPC Contract

> Small user preferences persisted by the Electron main process.

---

## 1. Scope / Trigger

Use this contract when adding or changing app-level preferences that are not full connection profiles. Settings are stored under `app.getPath('userData')` and exposed through the preload bridge.

Current setting: the last SNMP connection configuration edited in the toolbar.

---

## 2. Signatures

IPC channels:

```typescript
settings:get-last-snmp-config -> Partial<SnmpConfig> | null
settings:set-last-snmp-config(config: SnmpConfig) -> Partial<SnmpConfig> | null
```

Preload API:

```typescript
window.api.settings.getLastSnmpConfig(): Promise<Partial<SnmpConfig> | null>
window.api.settings.setLastSnmpConfig(config: SnmpConfig): Promise<Partial<SnmpConfig> | null>
```

Stored file:

```typescript
interface AppSettings {
  lastSnmpConfig?: Partial<SnmpConfig>
  /** Legacy Host-only setting from the previous settings contract. */
  lastHost?: string
}
```

---

## 3. Contracts

- Store app settings in `app-settings.json` under `app.getPath('userData')`.
- `lastSnmpConfig` stores the last toolbar `SnmpConfig`, including host, port, SNMP version, transport, community, SNMPv3 credentials, timeout, retries, and bulk request defaults.
- The full connection config is intentionally persisted automatically. Connection profiles still exist for named, multi-device presets.
- Renderer writes must debounce config edits so each keystroke does not immediately write the settings file.
- Startup hydration must not overwrite config fields the user edited before the async settings read finishes.
- Preserve compatibility with legacy `lastHost`: if `lastSnmpConfig` is missing, read non-empty `lastHost` as `{ host }`; after saving `lastSnmpConfig`, remove `lastHost`.

---

## 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Settings file missing | `settings:get-last-snmp-config` returns `null` |
| Settings file corrupt | Ignore it and return `null` |
| Legacy `lastHost` is present and non-empty | Return `{ host: lastHost.trim() }` |
| Config host is whitespace | Remove `lastSnmpConfig` and legacy `lastHost`, then return `null` |
| Config host is non-empty | Trim `host`, persist the config, remove legacy `lastHost`, and return the persisted config |
| Settings write fails | Return `null`; do not throw across IPC |
| Renderer settings read fails | Keep the default config and continue |
| Renderer settings write fails | Ignore the persistence failure; SNMP config state remains usable |

---

## 5. Good/Base/Bad Cases

- Good: Persist `lastSnmpConfig` with the complete last-used `SnmpConfig`.
- Base: On startup, hydrate `snmpConfig` from `window.api.settings.getLastSnmpConfig()` through `normalizeSnmpConfig`.
- Base: If only legacy `lastHost` exists, hydrate only that host and let renderer defaults fill the rest.
- Bad: Keep writing only `lastHost` after the full config settings contract exists.
- Bad: Write the settings file directly from renderer code.

---

## 6. Tests Required

- Typecheck must cover the main/preload/renderer IPC shape.
- Lint must pass with no direct Electron imports in renderer.
- When handler tests are added, cover missing/corrupt settings file, legacy `lastHost` fallback, whitespace host clearing, and write failure returning `null`.

---

## 7. Wrong vs Correct

#### Wrong

```typescript
localStorage.setItem('snmpConfig', JSON.stringify(config))
```

#### Correct

```typescript
void window.api.settings.setLastSnmpConfig(config)
```

#### Wrong

```typescript
writeFileSync('settings.json', JSON.stringify(settings))
```

#### Correct

```typescript
writeFileSync(join(app.getPath('userData'), 'app-settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
```

---

## Scenario: Cache Directory Sources IPC Contract

### 1. Scope / Trigger

- Trigger: MIB cache source management from the renderer.
- Applies when changing cache directory persistence, startup cache hydration, or renderer cache-directory settings UI.
- The cache-directory settings file is separate from `app-settings.json` for backward compatibility with the original cache implementation.

### 2. Signatures

IPC channels:

```typescript
mib:list-cache-dirs -> CacheDirectorySource[]
mib:add-cache-dir -> CacheDirectoryOperationResult | null
mib:set-cache-dir-enabled(id: string, enabled: boolean) -> CacheDirectoryOperationResult
mib:remove-cache-dir(id: string, options?: RemoveCacheDirectoryOptions) -> CacheDirectoryOperationResult
```

Preload API:

```typescript
window.api.mib.listCacheDirs(): Promise<CacheDirectorySource[]>
window.api.mib.addCacheDir(): Promise<CacheDirectoryOperationResult | null>
window.api.mib.setCacheDirEnabled(id: string, enabled: boolean): Promise<CacheDirectoryOperationResult>
window.api.mib.removeCacheDir(id: string, options?: RemoveCacheDirectoryOptions): Promise<CacheDirectoryOperationResult>
```

Stored file:

```typescript
interface CacheDirConfig {
  /** Legacy single-directory shape; still readable. */
  cacheDir?: string
  /** Current multi-directory shape. */
  cacheDirs?: Array<{ path: string; enabled: boolean }>
}
```

Shared response types live in `src/shared/cacheDirectoryTypes.ts`.

### 3. Contracts

- Store cache directory configuration in `cache-dir-config.json` under `app.getPath('userData')`.
- Preserve compatibility with legacy `{ cacheDir: string }` by normalizing it to one enabled cache source.
- Missing config falls back to one enabled default source at `app.getPath('userData')`.
- `cacheDirs` entries are deduplicated by normalized path.
- Newly added directories are enabled and moved to the end of the list.
- The last enabled directory is the primary cache write target for newly parsed MIB cache files.
- Startup and cache refresh load `mib-cache-*.json` from all enabled directories.
- Disabling/removing a cache source must remove modules restored from cache sources and rebuild from the remaining enabled cache directories.
- Removing with `deleteFromDisk: true` deletes only `mib-cache-*.json` files in that directory; it must not recursively delete the directory or unrelated user files.
- Per-MIB/module selection inside cache files is not part of this contract.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Folder picker cancelled | `mib:add-cache-dir` returns `null` |
| Config file missing | Return default userData source as enabled |
| Config file corrupt | Ignore it and use default userData source |
| Legacy `cacheDir` exists | Return it as one enabled cache source |
| Duplicate directory added | Keep one entry and move the added directory to primary position |
| Directory disabled | Rebuild cache-loaded modules without that directory |
| Directory removed | Remove it from config and rebuild cache-loaded modules |
| `deleteFromDisk` is false or absent | Remove from config only; do not delete files |
| `deleteFromDisk` is true | Delete only `mib-cache-*.json` files after renderer confirmation |
| Target is default userData | Return an error instead of deleting cache files through this action |
| Settings write fails | Return a result with `error`; do not throw across IPC |

### 5. Good/Base/Bad Cases

- Good: Add a cache directory, it becomes enabled and primary, existing cache files load immediately, and the renderer refreshes `mib:get-tree`.
- Good: Disable a cache directory and the tree refresh removes modules restored only from that cache source.
- Base: User removes a cache directory from the list but leaves files on disk.
- Base: User chooses disk deletion; only `mib-cache-*.json` files are removed.
- Bad: Recursively deleting the selected folder, because a cache directory can be a user-managed folder containing unrelated files.
- Bad: Showing per-MIB selectors in this modal; directory-level enable/disable is the supported granularity.

### 6. Tests Required

- Unit tests for legacy `{ cacheDir }` normalization.
- Unit tests for `cacheDirs` dedupe and primary-source selection.
- Typecheck must cover the main/preload/renderer IPC shape.
- Lint must pass with no direct Electron imports in renderer.
- When handler tests are added, cover add/enable/disable/remove and cache-file deletion error cases.

### 7. Wrong vs Correct

#### Wrong

```typescript
rmSync(cacheDir, { recursive: true, force: true })
```

#### Correct

```typescript
for (const file of readdirSync(cacheDir).filter((name) => name.startsWith('mib-cache-'))) {
  unlinkSync(join(cacheDir, file))
}
```

#### Wrong

```typescript
const cacheDir = config.cacheDir
loadOnlyThisDirectory(cacheDir)
```

#### Correct

```typescript
for (const source of cacheDirs.filter((source) => source.enabled)) {
  loadCacheDirectory(source.path)
}
```
