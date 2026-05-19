# Error Handling

> How errors are caught, handled, and communicated in the main process.

---

## Overview

The main process uses two error handling strategies:
1. **IPC handlers** return typed result objects with `success`/`error` fields
2. **Internal functions** throw errors that IPC handlers catch and wrap

---

## IPC Error Pattern

IPC handlers return typed result objects. Never throw across IPC boundaries.

```typescript
// SNMP operations return SnmpResult with success/error
interface SnmpResult {
  success: boolean
  varbinds: SnmpVarbind[]
  error?: string
  responseTime: number
  timestamp: number
}

// MIB parsing returns MibParseResult with errors/warnings arrays
interface MibParseResult {
  modules: MibModule[]
  errors: ParseError[]
  warnings: ParseWarning[]
}
```

---

## Internal Error Handling

- SNMP client functions catch `net-snmp` errors and wrap them in `SnmpResult` objects.
- MIB parser catches parse errors and collects them in `errors[]` — parsing continues for remaining files.
- File I/O operations (profiles) wrap `JSON.parse` in try/catch with sensible defaults.

---

## Error Communication to Renderer

- IPC handlers **never throw**. They return result objects.
- The preload bridge passes these result objects to the renderer as-is.
- The renderer reads `result.success` / `result.error` to display errors via Antd message/notification.

---

## Anti-patterns

- Do not throw errors from IPC handlers — the renderer cannot catch them reliably.
- Do not swallow errors silently. Always include an error message in the result.
- Do not use `any` for error types — use `unknown` and narrow safely.
