# Quality Guidelines

> Code review standards, testing, and quality requirements for the main process.

---

## Code Standards

- **TypeScript strict mode**: All main process code is TypeScript with explicit types.
- **No `any`**: Use `unknown` for external/untrusted data and narrow safely.
- **Immutable patterns**: Use spread operator for state updates (see `handleSaveProfile` in `src/main/ipc/handlers.ts:175-197`).
- **Function length**: Keep handler functions focused. Extract complex logic into domain modules.
- **File organization**: One domain per folder under `src/main/`, types in `types.ts`.

---

## Forbidden Patterns

- `any` type — use `unknown` and narrow.
- Throwing from IPC handlers — return error result objects instead.
- `console.log` in committed code.
- Hardcoded file paths — use `app.getPath()`.

---

## Testing

- **Unit tests**: Domain logic (MIB parser, SNMP client) should be testable independently — no Electron imports.
- **Integration tests**: IPC handlers can be tested with mocked `ipcMain`.
- **No tests currently exist** — add them as the codebase matures.

### Test Priority

1. MIB parser (pure logic, no I/O)
2. SNMP client (can mock `net-snmp`)
3. IPC handlers (can mock Electron APIs)

---

## Code Review Checklist

- [ ] IPC channels follow `domain:action` naming
- [ ] Handler functions return typed result objects, never throw
- [ ] New domains have `types.ts` with exported interfaces
- [ ] File I/O uses `app.getPath('userData')` and handles missing/corrupt files
- [ ] No `console.log` left in code
- [ ] No hardcoded paths or secrets

---

## Build Verification

Run before committing:

```bash
npm run typecheck:node    # TypeScript check for main + preload
npm run build             # Full electron-vite build
```
