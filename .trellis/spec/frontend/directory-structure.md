# Directory Structure

> How frontend (Electron renderer) code is organized in this project.

---

## Overview

The renderer is a React 19 SPA using Ant Design 6, bundled by Vite via electron-vite. It runs inside an Electron BrowserWindow and communicates with the main process through the `window.api` bridge exposed by the preload script.

---

## Directory Layout

```
src/renderer/
├── index.html                   # HTML entry point
├── src/
│   ├── main.tsx                 # React DOM render entry
│   ├── App.tsx                  # Root component — providers + layout
│   ├── components/
│   │   ├── Toolbar.tsx          # Top toolbar (MIB loading, profile selection)
│   │   ├── MibTreePanel.tsx     # Left panel — MIB tree (react-arborist)
│   │   ├── QueryPanel.tsx       # Right top — SNMP query form
│   │   ├── ResultsPanel.tsx     # Right bottom — query results table
│   │   └── StatusBar.tsx        # Bottom status bar
│   ├── stores/
│   │   └── appStore.ts          # Zustand global store
│   ├── types/
│   │   └── index.ts             # Renderer-specific types (ResultRow, ProfileItem, etc.)
│   ├── utils/
│   │   └── mibTreeUtils.ts      # Tree data transformation utilities
│   └── styles.css               # Global styles
```

---

## Module Organization

- **`components/`** — React components, one file per component, PascalCase naming.
- **`stores/`** — Zustand stores. One store file per domain (currently single `appStore.ts`).
- **`types/`** — Shared renderer types. Domain types (SnmpConfig, etc.) are imported from `src/main/*/types.ts` via the preload bridge.
- **`utils/`** — Pure utility functions. No React hooks, no side effects.

New features: add a component file, add store actions if needed, add types to `types/index.ts`.

---

## Naming Conventions

- **Components**: PascalCase files matching component name (`MibTreePanel.tsx`)
- **Stores**: camelCase with `Store` suffix (`appStore.ts`)
- **Utilities**: camelCase (`mibTreeUtils.ts`)
- **Types**: PascalCase interfaces/types in `index.ts`
- **CSS**: Global `styles.css` with BEM-like class names (`app-container`, `main-content`)

---

## Path Aliases

`@` maps to `src/renderer/src/` (configured in `electron.vite.config.mjs`):

```typescript
import { useAppStore } from '@/stores/appStore'
```

---

## Examples

- Root layout: `src/renderer/src/App.tsx` — ConfigProvider + AntApp + flex layout
- Store pattern: `src/renderer/src/stores/appStore.ts` — Zustand create with typed actions
- Utility: `src/renderer/src/utils/mibTreeUtils.ts` — Pure tree data transformation
