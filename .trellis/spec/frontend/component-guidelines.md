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

## Constraint: Non-Modal AntD Dialogs Must Pierce Both Root and Wrap Layers

Some workflow dialogs (`GetMultiNodeDialog`, `SetMultiNodeDialog`) intentionally stay open while the user continues interacting with the MIB tree behind them. For these dialogs, `mask={false}` is not enough. AntD v6 still renders full-screen root / wrap elements that can intercept pointer events even when no visible mask is present.

### Required Pattern

```tsx
<Modal
  mask={false}
  maskClosable={false}
  rootClassName="my-dialog-root"
  wrapClassName="my-dialog-wrap"
  modalRender={draggableModal.modalRender}
/>
```

```css
.my-dialog-root,
.my-dialog-wrap {
  pointer-events: none;
}

.my-dialog-root .ant-modal,
.my-dialog-wrap .ant-modal {
  pointer-events: auto;
}
```

If the dialog should be movable, use `useDraggableModal(open)` and pass its `modalRender` to the Modal. Attach `titleProps` to the title element as a fallback, but the hook must also make the entire `.ant-modal-header` a drag region so users do not need to grab the exact title text. The hook applies movement through `modalRender`, so it does not fight AntD's own fixed positioning.

### Why

Applying `pointer-events: none` only to `wrapClassName` is incomplete in AntD v6: the portal root can still cover the page. The symptom is a dialog that looks non-modal (`mask={false}`) but still prevents clicking, right-clicking, or dragging nodes in the UI behind it.

### How to Apply

- Use this pattern only for intentionally non-modal workflow dialogs. Standard settings/profile modals should keep normal modal behavior.
- Keep the dialog panel interactive by restoring `pointer-events: auto` on `.ant-modal`.
- Make the whole header's drag affordance visible with a `cursor: move` class.
- Do not add a global `.ant-modal-root { pointer-events: none }`; that would break ordinary blocking modals such as Toolbar settings/profile dialogs.

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
