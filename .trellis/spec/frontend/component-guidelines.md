# Component Guidelines

> How components are built in this project.

---

## Overview

React 19 functional components with Ant Design 6 as the UI library. No CSS modules or CSS-in-JS — plain CSS in `styles.css`. Components are organized by layout region (Toolbar, Panels, StatusBar).

---

## Component Structure

```typescript
// 1. Imports
import { Button, Space } from 'antd'
import { useAppStore } from '../stores/appStore'

// 2. Props interface (if component accepts props)
interface QueryPanelProps {
  onSubmit: (oid: string) => void
}

// 3. Component function with explicit return type
export function QueryPanel({ onSubmit }: QueryPanelProps): React.ReactElement {
  // hooks
  const config = useAppStore((s) => s.snmpConfig)

  // handlers
  const handleSubmit = (): void => { /* ... */ }

  // render
  return <div>...</div>
}
```

---

## Props Conventions

- Define props with a named `interface` or `type` above the component.
- Type callback props explicitly: `onSelect: (id: string) => void`.
- Do not use `React.FC` — use plain function declarations with explicit return type.

---

## Styling Patterns

- **Ant Design 6** handles most UI styling via component props.
- Custom layout uses plain CSS in `src/renderer/src/styles.css`.
- CSS class names: kebab-case, BEM-like (`app-container`, `main-content`, `right-panel`).
- No CSS modules, no styled-components, no Tailwind.

---

## Antd Usage

- Wrap the app in `<ConfigProvider>` for locale and theme at the root level.
- Use `<App>` wrapper from antd for static APIs (message, notification).
- Use `antd/locale/zh_CN` for Chinese locale.

```typescript
<ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1890ff' } }}>
  <AntApp>
    {/* app content */}
  </AntApp>
</ConfigProvider>
```

---

## Common Mistakes

- Do not import types from `electron` in renderer code — use `window.api` and renderer-side types only.
- Do not use `useState` for data that multiple components need — use the Zustand store instead.
- Do not put business logic in components — extract to utils or store actions.

---

## Constraint: GET / SET Workflows Must Not Use AntD Modal Overlays

GET / SET workflows launched from the MIB tree must use the independent Electron tool window documented in `mib-tree-snmp-ops.md`, not an AntD `Modal` in the main renderer.

### Why

The old in-window GET / SET dialogs could not leave the main application window and required a same-renderer drag bridge. Production GET / SET now uses a separate `BrowserWindow`, with drag payloads carried through the main-process IPC bridge. Reintroducing non-modal AntD overlays would regress the drag-out requirement and add dead store state back to `appStore`.

### How to Apply

- Right-click GET / SET menu items call `window.api.snmpTool.open(...)`.
- Tool-window content lives in `src/renderer/src/components/SetMultiNodeDialog/SetToolWindowContent.tsx`.
- Standard settings/profile modals may still use normal AntD `Modal` behavior.
- Do not add `GetMultiNodeDialog`, `SetMultiNodeDialog` modal components, `useDraggableModal`, or `.get-multi-node-dialog-*` / `.set-multi-node-dialog-*` CSS for production GET / SET.

---

## Constraint: AntD Dropdown Menu Item Clicks Must Use Item-Level or Dropdown-Level Handlers

When wiring click handling for an Ant Design `<Dropdown menu={{ items }}>`, the click handler must be attached at **one of two places only**:

1. The menu item descriptor itself: `{ key, label, icon, onClick: () => fn() }`.
2. The dropdown-level handler: `<Dropdown menu={{ items, onClick: ({ key }) => fn(key) }}>`.

Do not rely on an `onClick` baked into a React node passed as `label` (e.g. `label: <span onClick={fn}>...</span>`). It will not fire.

### Why

In AntD v5/v6, the menu's click path runs item-level / dropdown-level handlers and then closes the popup. The popup unmount cancels event propagation to any inline handler inside the rendered `label` node before it can fire. The visible symptom is "the menu opens, the item highlights on hover, clicking it closes the menu, but nothing happens" — the action looks wired up and partially does work (the dropdown closes), so the failure is easy to miss in casual smoke tests.

This is **not** a generic React event-bubbling issue you can paper over with `stopPropagation` — by the time the `label` subtree would see the click, the popup is already being torn down.

### How to Apply

- Every actionable menu entry under a `<Dropdown menu={{ items }}>` must declare its action via `items[i].onClick` or the dropdown-level `menu.onClick`. Pick one style per menu and stay consistent — mixing both makes it ambiguous which fires first.
- If the `label` of a menu item embeds an additional, **independently-clickable** affordance (e.g. a "delete" icon inside an otherwise-selectable row), that inner control's `onClick` must call `e.stopPropagation()` so the item-level handler does not also fire. The inner handler still works because the inner control is part of the static menu DOM, not the dismissal sequence — but only when it stops the bubble.
- The same rule applies to `<Menu items={...}>` used outside `Dropdown` (e.g. inside a popover or a manually-positioned overlay) where the surrounding popup dismisses on item click.
- Anchors with current canonical usage:
  - `src/renderer/src/components/Toolbar.tsx` — `profileMenuItems` (profile apply via item-level `onClick`).
  - `src/renderer/src/components/MibTreePanel.tsx` — `contextMenuItems` (right-click SNMP operations and SET, all via item-level `onClick`).
