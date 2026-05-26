# App Packaging Resources

> Electron packaging resources and runtime asset conventions.

---

## 1. Scope / Trigger

Use this contract when adding or changing assets that Electron or electron-builder must consume outside the renderer bundle, such as app icons, installer resources, tray assets, or packaged runtime files.

Current packaged app icon assets live under the electron-builder build resources directory:

```text
build/icon.svg
build/icon.png
build/icon.ico
build/icon.icns
```

---

## 2. Signatures

electron-builder configuration:

```json5
{
  "directories": {
    "buildResources": "build"
  },
  "extraResources": [
    {
      "from": "build/icon.png",
      "to": "icon.png"
    }
  ],
  "win": {
    "icon": "build/icon.ico"
  },
  "mac": {
    "icon": "build/icon.icns"
  },
  "linux": {
    "icon": "build/icon.png"
  }
}
```

Main-process runtime lookup:

```typescript
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')
```

---

## 3. Contracts

- Keep `build/icon.svg` as the editable source for the application icon.
- Keep generated platform assets beside it:
  - `build/icon.png` for Linux packaging and runtime `BrowserWindow` usage.
  - `build/icon.ico` for Windows packaging.
  - `build/icon.icns` for macOS packaging.
- `directories.buildResources` points at `build`, but build resources are not automatically available at runtime.
- Runtime assets used by main-process code must be copied through `extraResources`.
- Main-process code must handle missing runtime asset files without crashing; return `undefined` and let Electron fall back gracefully.

---

## 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Development run | Resolve `../../build/icon.png` from `out/main/index.js` location |
| Packaged run | Resolve `process.resourcesPath/icon.png` |
| Icon file missing | Omit `BrowserWindow.icon`; app still opens |
| Windows packaging | Use `build/icon.ico` |
| macOS packaging | Use `build/icon.icns` |
| Linux packaging | Use `build/icon.png` |

---

## 5. Good/Base/Bad Cases

- Good: Add a runtime icon to `extraResources` and read it from `process.resourcesPath` when packaged.
- Base: Keep platform icons in `build/` because electron-builder already treats it as `buildResources`.
- Bad: Reference `build/icon.png` directly from a packaged app; `buildResources` are not copied into app resources by default.
- Bad: Use only SVG for Windows packaging; electron-builder expects ICO for the Windows executable icon.

---

## 6. Tests Required

- `npm run typecheck` must cover main-process path code.
- `npm run lint` must pass without direct renderer imports.
- `npm run build` must pass after changing packaging resources.
- For app icon changes, run an electron-builder directory packaging check such as:

```bash
npx electron-builder --win --dir
```

Then verify `dist/win-unpacked/resources/icon.png` exists when runtime code depends on it.

---

## 7. Wrong vs Correct

#### Wrong

```typescript
new BrowserWindow({
  icon: 'build/icon.png'
})
```

#### Correct

```typescript
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

new BrowserWindow({
  ...(existsSync(iconPath) ? { icon: iconPath } : {})
})
```
