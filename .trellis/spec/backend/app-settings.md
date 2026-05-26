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
