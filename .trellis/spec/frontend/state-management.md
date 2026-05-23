# State Management

> How state is managed in this project.

---

## Overview

**Zustand 5** is the only state management library. Single global store at `src/renderer/src/stores/appStore.ts`.

---

## State Categories

| Category | Tool | Example |
|----------|------|---------|
| Global app state | Zustand store | `snmpConfig`, `mibTree`, `currentResult`, `connectionStatus` |
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

### SNMP Config Normalization

`snmpConfig` is the single source of truth for device connection settings, including request defaults such as `bulkMaxRepetitions` and `bulkNonRepeaters`. Any path that hydrates a config from persisted profiles or partial updates must pass through `normalizeSnmpConfig(config)` before storing it.

```typescript
setSnmpConfig: (config) =>
  set((state) => ({ snmpConfig: normalizeSnmpConfig({ ...state.snmpConfig, ...config }) }))
```

Why: older saved profiles may not contain newly-added fields. Without normalization, UI controls and SNMP calls can read `undefined` defaults even though the type says `SnmpConfig` is complete.

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
addLoadedModule: (name) =>
  set((state) => ({
    loadedModules: state.loadedModules.includes(name)
      ? state.loadedModules
      : [...state.loadedModules, name]
  }))

// CORRECT: Immutable object merge
setSnmpConfig: (config) => set((state) => ({ snmpConfig: { ...state.snmpConfig, ...config } }))

// WRONG: Mutation
addLoadedModule: (name) => { state.loadedModules.push(name) }
```

---

## Pattern: Cross-Window Drag-Bridge via Main-Process IPC

GET / SET now run in independent Electron tool windows, so Zustand cannot be the drag bridge: each `BrowserWindow` has its own renderer process and its own JavaScript heap. Cross-window drag append must publish the dragged node through preload IPC and store it transiently in the main process.

### 1. Scope / Trigger

- Trigger: any draggable MIB tree node must be droppable into a GET / SET tool window hosted by another `BrowserWindow`.
- Producer: `src/renderer/src/components/MibTreePanel.tsx`.
- Bridge: `src/main/toolWindows.ts`.
- Consumer: the unified GET / SET tool window content (`SetToolWindowContent`).

### 2. Signatures

```typescript
window.api.snmpTool.setDragNode(node: ToolWindowMibNode | null): Promise<void>
window.api.snmpTool.consumeDragNode(): Promise<ToolWindowMibNode | null>
```

### 3. Contracts

- `setDragNode(node)` stores the current dragged `MibTreeNodeData`-compatible payload in the main process.
- `setDragNode(null)` clears the pending drag payload.
- `consumeDragNode()` returns the pending node once and clears it immediately.
- The payload type is defined in `src/shared/toolWindowTypes.ts` as `ToolWindowMibNode`; do not hand-roll a second node shape in renderer code.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Drag starts on a valid tree node | Publish that node via `setDragNode(node)` |
| Drop lands in a tool window | Call `consumeDragNode()` and append only if a node is returned |
| Returned node has no OID | Show a warning and do not append |
| Drag ends outside any tool window | Clear the pending payload |
| `dragend` races ahead of cross-window `drop` | Delay clear briefly so the target window can consume first |

### 5. Good/Base/Bad Cases

- Good: user drags from the main MIB tree into an already-open GET tool window; the node is appended exactly once and the pending payload is cleared.
- Base: user starts a drag and drops outside any tool window; the delayed `dragend` cleanup clears the pending payload.
- Bad: consumer reads Zustand `pendingDragNode` from a tool window; it will always be isolated from the main renderer and cannot see the source node.

### 6. Tests Required

- Typecheck must cover `src/shared/toolWindowTypes.ts`, preload API declarations, and both renderer consumers.
- Manual/E2E smoke should verify cross-window drag append for GET and SET because native cross-window drag behavior is Electron/OS-dependent.

### 7. Wrong vs Correct

#### Wrong

```typescript
const pendingDragNode = useAppStore((s) => s.pendingDragNode)
if (pendingDragNode) append(pendingDragNode)
```

#### Correct

```typescript
const node = await window.api.snmpTool.consumeDragNode()
if (node?.oid) append(node)
```

---

## Common Mistakes

- Do not duplicate IPC data in both store and component state.
- Do not store derived data — compute it in selectors or `useMemo`.
- Do not use the store for transient UI state such as hover, focus, or drag payloads.
- Do not use Zustand as a cross-window bridge. Independent Electron `BrowserWindow` renderers need preload/main-process IPC.
