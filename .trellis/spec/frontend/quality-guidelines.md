# Quality Guidelines

> Code quality standards for frontend development.

---

## Code Standards

- **TypeScript strict mode** with explicit types on all exports.
- **No `any`** — use `unknown` and narrow safely.
- **Immutable state updates** via spread operator in Zustand store.
- **Component size**: One concern per component. Extract sub-components when a file grows past ~200 lines.
- **No inline styles** — use Ant Design props or CSS classes.

---

## Forbidden Patterns

- `any` type — use `unknown`.
- Direct `electron` imports in renderer — use `window.api` bridge only.
- `console.log` in committed code.
- `dangerouslySetInnerHTML` — never needed for this app.
- Storing sensitive data (SNMP credentials) in renderer localStorage.

---

## Required Patterns

- Ant Design `<ConfigProvider>` at root with locale and theme.
- Zustand selectors for store access: `useAppStore((s) => s.field)`.
- Typed props interfaces for all components that accept props.
- Error handling on all IPC calls: `.catch(() => {})` or display error to user.

---

## Testing

Tests use Vitest with `jsdom` plus React Testing Library. The canonical entry point is:

```bash
npm test
```

Current scope:
- Unit tests for pure renderer utilities, especially OID normalization / validation helpers.
- Hook tests with React Testing Library's `renderHook` and `act` for local row-state hooks.
- Component tests with React Testing Library for interactive panels when behavior can be tested without Electron IPC.
- E2E tests with Playwright/Spectron for critical flows (load MIB, run SNMP query) when added.

### Required Test Assertions

- OID helpers must cover leading-dot normalization, empty instance defaults, and segment-boundary prefix behavior.
- Row-state hooks must assert immutable updates: changed arrays get a new reference, untouched row objects remain stable where possible.
- IPC-facing components should mock `window.api` at the boundary; do not import Electron directly in tests.

### Test Priority

1. `mibTreeUtils.ts` — pure functions, easy to test
2. `appStore.ts` — Zustand store actions
3. Component integration tests

---

## Code Review Checklist

- [ ] Component uses Zustand selector pattern, not full store destructuring
- [ ] IPC calls go through `window.api.*`, not direct electron imports
- [ ] Props interfaces are typed and documented
- [ ] No `console.log` or `any` in code
- [ ] Error states handled (loading, error display to user)
- [ ] No hardcoded strings that should be configurable

---

## Build Verification

Run before committing:

```bash
npm run typecheck:web     # TypeScript check for renderer
npm test                  # Vitest unit / hook tests
npm run lint              # ESLint
npm run build             # Full build verification
```
