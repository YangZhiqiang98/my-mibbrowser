# Logging Guidelines

> Log levels, format, and usage in the main process.

---

## Overview

This project currently has no structured logging framework. The app is a desktop tool with a single user, so logging needs are minimal.

---

## Current State

- **Development**: `console.error` for debugging only. Remove before shipping.
- **Production**: Errors communicated to the user via IPC result objects (see error-handling.md).
- **No log files**: The app does not write log files to disk.

---

## Guidelines

- Never leave `console.log` statements in committed code.
- For user-facing errors, return structured error info via IPC — the renderer displays it.
- If structured logging is added later, prefer `electron-log` for main process logging.

---

## IPC-based Error Reporting

Instead of logging to files, errors flow to the renderer:

```
SNMP client error → IPC handler wraps in SnmpResult → renderer displays via Antd message
```

This is the primary error reporting mechanism — show errors to the user in real time.
