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

## Pattern: Cross-Component Drag-Bridge via the Store

Some 3rd-party widgets do not expose the native `DataTransfer` payload in their drag callbacks — most notably AntD `Tree`, where `onDragStart(info)` gives a wrapped `info.node` but no way to attach data that the receiving `onDrop` handler can read. When a draggable item from one component (the MIB tree) needs to land in a drop zone in another (the SET / GET dialogs), the only reliable channel is a **transient field on the Zustand store**.

The contract used in this project lives at `appStore.pendingDragNode`:

```typescript
// appStore.ts — declaration
pendingDragNode: MibTreeNodeData | null
setPendingDragNode: (node: MibTreeNodeData | null) => void

// MibTreePanel.tsx — write side
const handleTreeDragStart: TreeProps['onDragStart'] = useCallback((info) => {
  const node = findNodeById(mibTree, info.node.key as string)
  if (node) setPendingDragNode(node)
}, [mibTree, setPendingDragNode])

const handleTreeDragEnd: TreeProps['onDragEnd'] = useCallback(() => {
  setPendingDragNode(null)
}, [setPendingDragNode])

// SetMultiNodeDialog / GetMultiNodeDialog — read side
const pendingDragNode = useAppStore((s) => s.pendingDragNode)
const setPendingDragNode = useAppStore((s) => s.setPendingDragNode)

const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault()
  const node = pendingDragNode
  setPendingDragNode(null)
  if (node) handleAppend(node)
}, [pendingDragNode, setPendingDragNode, handleAppend])
```

### Required Properties

1. **Cleared on `dragend` AND on `drop`.** The producer clears on `onDragEnd` (covers "user dropped outside any zone"); each consumer clears on its own `onDrop` (covers "successful drop"). A stale `pendingDragNode` left in the store causes ghost-append on the next click that happens to trigger another drop event.
2. **Single writer, multiple readers.** Only `MibTreePanel.handleTreeDragStart / handleTreeDragEnd` should write `pendingDragNode`. Multiple drop zones reading is fine and expected (Set + Get dialogs today, possibly future dialogs).
3. **Transient by design.** This is *not* application state. Never persist it, never derive from it, never check it outside of a `onDrop` / `onDragOver` handler.

### Why a store field instead of `useState` + prop drilling?

The drop zones live in dialogs that aren't direct children of `MibTreePanel`. Lifting the drag state to a common ancestor would require either threading a prop through `App.tsx` or introducing a context just for this. The store is already the cross-component channel — `pendingDragNode` is one more transient slot.

### Why not `event.dataTransfer.setData(...)` in `handleTreeDragStart`?

AntD `Tree` wraps the native drag event in rc-tree's own `info` object; `info.event.dataTransfer` is technically reachable but rc-tree clears or replaces the payload during its internal handling. We tried this in `05-23-set-multi-node-dialog` — the data round-tripped empty in `onDrop`. The store bridge sidesteps the wrapper entirely.

### How to apply when adding new drop zones

- Read `pendingDragNode` in your zone component; check non-null in `onDrop` before any append; clear on success.
- Do **not** add a new `pendingFooNode` field for every new drop scenario. If the payload shape genuinely differs (not just `MibTreeNodeData`), introduce a single tagged field (e.g., `pendingDragPayload: { kind: 'mibNode' | 'resultRow', data: ... } | null`) rather than parallel slots.

---

## Common Mistakes

- Do not duplicate IPC data in both store and component state.
- Do not store derived data — compute it in selectors or `useMemo`.
- Do not use the store for transient UI state (hover, focus) — **with one documented exception**: the cross-component drag-bridge above. That exception exists because 3rd-party drag widgets don't expose the native payload; pure UI state with no such constraint must not creep into the store.
