# Logging Guidelines

> Log levels, format, and usage in the main process.

---

## Overview

This project currently has no structured logging framework. The app is a desktop tool with a single user, so logging needs are minimal.

---

## Current State

- **Default runtime**: Debug logging is off. User-facing errors are communicated via IPC result objects (see error-handling.md).
- **Explicit Debug Mode**: The renderer can enable main-process debug logging through the `debug:set-enabled` IPC channel.
- **No log files**: The app does not write log files to disk.

---

## Guidelines

- Never leave `console.log` statements in committed code.
- Do not call `console.debug` / `console.error` directly from feature code for diagnostics. Route diagnostic output through `src/main/debugLogger.ts`.
- For user-facing errors, return structured error info via IPC — the renderer displays it.
- If structured logging is added later, prefer `electron-log` for main process logging.

---

## Debug Mode Contract

### 1. Scope / Trigger

Use Debug Mode for local troubleshooting of SNMP requests, MIB loading, IPC flow, and tool-window routing. It is explicitly user-enabled and off by default.

### 2. Signatures

```typescript
setDebugMode(enabled: boolean): void
isDebugModeEnabled(): boolean
debugLog(scope: string, message: string, context?: unknown): void
debugError(scope: string, message: string, error: unknown, context?: unknown): void
prepareForDebugLog(value: unknown): unknown
subscribeDebugLogs(callback: (entry: DebugLogEntry) => void): () => void
setMainConsoleDebugOutput(enabled: boolean): void
isMainConsoleDebugOutputEnabled(): boolean
```

IPC channels:

```typescript
debug:get-enabled -> boolean
debug:set-enabled(enabled: boolean) -> boolean
debug:entry -> DebugLogEntry
```

Debug log entry payload:

```typescript
type DebugLogLevel = 'debug' | 'error'

interface DebugLogEntry {
  id: number
  timestamp: number
  level: DebugLogLevel
  scope: string
  message: string
  payload?: unknown
}
```

### 3. Contracts

- `debugLog` and `debugError` emit structured `DebugLogEntry` objects to `subscribeDebugLogs` subscribers only when Debug Mode is enabled.
- The app's normal desktop debug surface is the renderer Debug Logs panel.
- Main-process console output is a development fallback. It is controlled by `setMainConsoleDebugOutput`, and should default on only for development runs such as Electron Vite dev mode.
- `src/main/debugLogForwarder.ts` is responsible for forwarding main-window debug entries over `debug:entry`; feature code must not call `webContents.send('debug:entry', ...)` directly.
- The preload bridge exposes `window.api.debug.onEntry(callback)` for renderer subscribers. The callback receives the shared `DebugLogEntry` shape from `src/shared/debugLogTypes.ts`.
- Debug logs include normal lifecycle events, not only failures. SNMP operations should log start and finish summaries.
- Debug logs may include SNMP community strings, SNMPv3 usernames/passwords, and SET values. This is intentional for local device debugging.
- Large arrays are truncated and Buffers are summarized by type/length to avoid excessive output.
- Full MIB file contents and full SNMP response payload dumps should not be logged unless a future task explicitly adds packet/file capture.
- Renderer-side log retention must stay bounded; the current app panel keeps the newest 500 entries.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Debug mode disabled | No diagnostic entries and no `debug:entry` events |
| Debug mode enabled | Emit matching structured entries for the Debug Logs panel |
| Main console output disabled | Do not call `console.debug` / `console.error` from the debug logger |
| Main console output enabled | Print scoped debug/error messages as a development fallback |
| Debug IPC update fails in renderer | Revert the UI toggle and show a user-facing error |
| Large arrays in debug context | Keep first bounded items and append an overflow marker |
| Buffer values in debug context | Print `{ type: 'Buffer', length }` |
| Debug subscriber throws | Swallow the subscriber failure; diagnostics must not affect app behavior |
| Main window closes while forwarding | Ignore the send failure and unsubscribe with the window lifecycle |
| Renderer receives more entries than the retention limit | Drop the oldest entries and keep the newest entries |

### 5. Good/Base/Bad Cases

- Good: `debugLog('snmp', 'GET start', { config, request: { oids } })`.
- Base: `debugLog('mib', 'open directory finish', { moduleCount, errorCount })`.
- Good: `registerDebugLogForwarder(mainWindow)` subscribes once and forwards entries to the renderer.
- Base: Renderer subscribes with `window.api.debug.onEntry(...)` and cleans up the listener on unmount.
- Bad: `console.log(config)` in a component or IPC handler.
- Bad: A feature module sends `debug:entry` directly instead of going through `debugLogger.ts`.

### 6. Tests Required

- Unit tests must prove logging is silent when disabled.
- Unit tests must prove main-process console output is gated separately from panel entry emission.
- Unit tests must prove subscribers receive structured entries only when Debug Mode is enabled.
- Unit tests must prove SNMP request fields such as `community`, passwords, and SET `value` remain visible in explicit Debug Mode.
- Unit tests must cover large/binary value summarization when added or changed.
- Renderer store tests must prove debug log retention remains bounded when the panel storage behavior changes.

### 7. Wrong vs Correct

#### Wrong

```typescript
console.log('SNMP config', config)
```

#### Correct

```typescript
debugLog('snmp', 'GET start', { config, request: { oids } })
```

#### Wrong

```typescript
mainWindow.webContents.send('debug:entry', payload)
```

#### Correct

```typescript
const unsubscribe = subscribeDebugLogs((entry) => {
  mainWindow.webContents.send('debug:entry', entry)
})
```

---

## IPC-based Error Reporting

Instead of logging to files, errors flow to the renderer:

```
SNMP client error → IPC handler wraps in SnmpResult → renderer displays via Antd message
```

This is the primary error reporting mechanism — show errors to the user in real time.
