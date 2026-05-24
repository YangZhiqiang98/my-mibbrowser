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
```

IPC channels:

```typescript
debug:get-enabled -> boolean
debug:set-enabled(enabled: boolean) -> boolean
```

### 3. Contracts

- `debugLog` and `debugError` print only when `isDebugModeEnabled()` is true.
- Debug logs include normal lifecycle events, not only failures. SNMP operations should log start and finish summaries.
- Debug logs may include SNMP community strings, SNMPv3 usernames/passwords, and SET values. This is intentional for local device debugging.
- Large arrays are truncated and Buffers are summarized by type/length to avoid excessive output.
- Full MIB file contents and full SNMP response payload dumps should not be logged unless a future task explicitly adds packet/file capture.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Debug mode disabled | No diagnostic console output |
| Debug mode enabled | Print scoped debug messages with context |
| Debug IPC update fails in renderer | Revert the UI toggle and show a user-facing error |
| Large arrays in debug context | Keep first bounded items and append an overflow marker |
| Buffer values in debug context | Print `{ type: 'Buffer', length }` |

### 5. Good/Base/Bad Cases

- Good: `debugLog('snmp', 'GET start', { config, request: { oids } })`.
- Base: `debugLog('mib', 'open directory finish', { moduleCount, errorCount })`.
- Bad: `console.log(config)` in a component or IPC handler.

### 6. Tests Required

- Unit tests must prove logging is silent when disabled.
- Unit tests must prove logging prints when enabled.
- Unit tests must prove SNMP request fields such as `community`, passwords, and SET `value` remain visible in explicit Debug Mode.
- Unit tests must cover large/binary value summarization when added or changed.

### 7. Wrong vs Correct

#### Wrong

```typescript
console.log('SNMP config', config)
```

#### Correct

```typescript
debugLog('snmp', 'GET start', { config, request: { oids } })
```

---

## IPC-based Error Reporting

Instead of logging to files, errors flow to the renderer:

```
SNMP client error → IPC handler wraps in SnmpResult → renderer displays via Antd message
```

This is the primary error reporting mechanism — show errors to the user in real time.
