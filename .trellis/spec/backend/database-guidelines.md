# Data Persistence Guidelines

> How data is stored and persisted in this Electron application.

---

## Overview

This desktop app uses **JSON files** for persistence. There is no database. Data is stored in the Electron `userData` directory via `app.getPath('userData')`.

---

## Storage Locations

| Data | File | Path |
|------|------|------|
| Connection profiles | `connection-profiles.json` | `app.getPath('userData')` |
| MIB tree | In-memory only | Rebuilt from parsed MIB files each session |

---

## Read/Write Pattern

Read and write JSON files directly using `fs.readFileSync` / `fs.writeFileSync`. No ORM, no migration system.

```typescript
// Read: check exists, parse, catch errors
function loadProfiles(): Profile[] {
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) }
  catch { return [] }
}

// Write: full file replace (not append)
writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
```

---

## Conventions

- Always use `app.getPath('userData')` for file paths — never hardcode paths.
- Always check `existsSync` before reading. Return empty default on missing file.
- Always wrap `JSON.parse` in try/catch. Return empty default on corrupt data.
- Use `JSON.stringify(data, null, 2)` for human-readable output.
- No append operations — always write the full array/object.

---

## Anti-patterns

- Do not use `localStorage` from the main process — it is a renderer concept.
- Do not store large binary data in JSON files.
- Do not use relative paths for user data files.
