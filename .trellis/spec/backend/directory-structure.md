# Directory Structure

> How backend (Electron main process) code is organized in this project.

---

## Overview

This is an Electron desktop application. The "backend" is the **main process** running in Node.js, responsible for system access (file I/O, native dialogs), SNMP network operations, and MIB parsing. Communication with the renderer (frontend) happens through Electron IPC.

---

## Directory Layout

```
src/
├── main/                        # Electron main process
│   ├── index.ts                 # App lifecycle, window creation, IPC registration
│   ├── ipc/
│   │   └── handlers.ts          # All ipcMain.handle() handlers, grouped by domain
│   ├── mib/
│   │   ├── parser.ts            # MIB file parser (parseFiles, parseDirectory, buildMibTree)
│   │   └── types.ts             # MIB domain types (MibNode, MibParseResult, etc.)
│   └── snmp/
│       ├── client.ts            # SNMP operations using net-snmp library
│       └── types.ts             # SNMP domain types (SnmpConfig, SnmpResult, etc.)
├── preload/
│   └── index.ts                 # contextBridge API — typed IPC wrappers for renderer
└── renderer/                    # Frontend (see frontend/directory-structure.md)
```

---

## Module Organization

- **`src/main/`** — Main process only. Never import renderer code.
- **`src/main/ipc/`** — IPC handlers. Each handler function maps 1:1 to an IPC channel. Group by domain (mib, snmp, profile, export).
- **`src/main/mib/`** — MIB domain logic. Parser + types. No Electron imports.
- **`src/main/snmp/`** — SNMP domain logic. Client + types. No Electron imports.
- **`src/preload/`** — Typed bridge. One `api` object with nested namespaces matching IPC channel patterns (`mib:*`, `snmp:*`, `profile:*`, `export:*`).

New domains follow the same pattern: create a folder under `src/main/` with `types.ts` + implementation, then add handlers in `ipc/handlers.ts` and expose in `preload/index.ts`.

---

## Naming Conventions

- **IPC channels**: `domain:action` kebab-case (e.g., `snmp:get-bulk`, `mib:open-files`)
- **Handler functions**: `handleDomainAction` camelCase (e.g., `handleSnmpGetBulk`)
- **Type files**: `types.ts` per domain
- **Domain folders**: lowercase kebab-case matching the domain name

---

## Examples

- IPC handler pattern: `src/main/ipc/handlers.ts:19-42` — registerIpcHandlers()
- Domain types: `src/main/snmp/types.ts` — SnmpConfig, SnmpResult, SnmpVarbind
- Preload bridge: `src/preload/index.ts:8-50` — typed api object with namespaces
