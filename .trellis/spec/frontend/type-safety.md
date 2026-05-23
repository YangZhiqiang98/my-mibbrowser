# Type Safety

> TypeScript conventions and type organization in the renderer.

---

## Overview

TypeScript 6 in strict mode. Types are co-located with domain modules and shared via `types/index.ts`.

---

## Type Organization

| Location | Content |
|----------|---------|
| `src/main/*/types.ts` | Domain types shared across processes (SnmpConfig, SnmpResult, MibNode) |
| `src/renderer/src/types/index.ts` | Renderer-specific types (ResultSession, ProfileItem, MibTreeNodeData) |
| Component files | Props interfaces defined inline above the component |

---

## Cross-process Types

Types defined in `src/main/*/types.ts` are imported by both main process and preload:

```typescript
// preload/index.ts imports main process types for the API bridge
import type { SnmpConfig, SnmpResult } from '../main/snmp/types'
```

The renderer accesses these types through the `ApiType` export from preload or via renderer-side re-exports.

---

## Type Conventions

- Use `interface` for object shapes (props, state, config objects).
- Use `type` for unions, intersections, and utility types.
- Prefer string literal unions over `enum`:

```typescript
type SnmpOperation = 'GET' | 'GETNEXT' | 'GETBULK' | 'SET' | 'WALK' | 'BULK_WALK'
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
```

- Export all types from domain `types.ts` files.
- Use `Partial<T>` for setter parameters that update a subset of fields.

---

## Validation

No runtime validation library currently. IPC data from the main process is trusted (same app). User input is validated at the form level with Ant Design form validation.

If external data sources are added later, consider Zod for schema validation.

---

## Forbidden Patterns

- `any` — use `unknown` and narrow with type guards.
- Non-null assertion (`!`) — use optional chaining and null checks instead.
- Type assertions (`as`) — avoid unless absolutely necessary for third-party library interop.
