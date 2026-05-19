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
