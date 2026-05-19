# State Management

> How state is managed in this project.

---

## Overview

**Zustand 5** is the only state management library. Single global store at `src/renderer/src/stores/appStore.ts`.

---

## State Categories

| Category | Tool | Example |
|----------|------|---------|
| Global app state | Zustand store | `snmpConfig`, `mibTree`, `results`, `connectionStatus` |
| Local UI state | `useState` | Form inputs, modal visibility, dropdown selection |
| IPC/async state | Zustand + `window.api` | Data fetched from main process |

---

## Store Structure

The store follows this pattern:

```typescript
interface AppState {
  // Data fields
  mibTree: MibTreeNodeData[]
  snmpConfig: SnmpConfig

  // Actions — one setter per field, named `set<Field>`
  setMibTree: (tree: MibTreeNodeData[]) => void
  setSnmpConfig: (config: Partial<SnmpConfig>) => void
}
```

- **Data fields**: The actual state values.
- **Simple setters**: `set<Field>(value)` for direct replacement.
- **Partial setters**: `set<Field>(Partial<T>)` using spread merge for config objects.
- **Collection actions**: `add<Item>`, `clear<Items>` for arrays.

---

## When to Use Global State

Use the Zustand store when:
- Multiple components need the same data (MIB tree, SNMP config, results)
- Data persists across component lifecycle (connection profiles)
- Actions need to be called from unrelated components

Use `useState` when:
- State is local to one component (form input before submit)
- State does not affect other components (a dropdown's open/close state)

---

## Immutable Updates

Always create new objects/arrays — never mutate:

```typescript
// CORRECT: Immutable array append
addResult: (row) => set((state) => ({ results: [...state.results, row] }))

// CORRECT: Immutable object merge
setSnmpConfig: (config) => set((state) => ({ snmpConfig: { ...state.snmpConfig, ...config } }))

// WRONG: Mutation
addResult: (row) => { state.results.push(row) }
```

---

## Common Mistakes

- Do not duplicate IPC data in both store and component state.
- Do not store derived data — compute it in selectors or `useMemo`.
- Do not use the store for transient UI state (hover, focus).
