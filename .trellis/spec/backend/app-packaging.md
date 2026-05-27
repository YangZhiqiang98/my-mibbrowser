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
- Packaging script changes must run `npm run package:win` on Windows when possible. The fixed script uses domestic mirrors and validates the full NSIS installer path.
- For app icon changes, run an electron-builder directory packaging check such as:

```bash
npx electron-builder --win --dir
```

Then verify `dist/win-unpacked/resources/icon.png` exists when runtime code depends on it.

---

## 7. Windows Local Packaging Without Signing

### 7.1 Scope / Trigger

Use this contract when changing Windows electron-builder packaging, release scripts, or local installer generation.

### 7.2 Signatures

```json5
{
  "win": {
    "icon": "build/icon.ico",
    "signAndEditExecutable": false
  }
}
```

Packaging command:

```bash
npm run package:win
```

### 7.3 Contracts

- Local unsigned Windows packaging disables code signing certificate auto-discovery:
  - `CSC_IDENTITY_AUTO_DISCOVERY=false`
- The fixed packaging script sets domestic mirrors before running electron-builder:
  - `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
  - `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`
- `PACKAGE_PROXY` is opt-in only. Do not default to a local proxy port in committed scripts.
- `win.signAndEditExecutable` remains `false` unless the machine has a signing/tooling setup that can handle electron-builder's Windows code-sign tooling.

### 7.4 Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| No local signing certificate | Package unsigned installer without trying certificate auto-discovery |
| Domestic network download | Use the npmmirror Electron and electron-builder binary mirrors |
| Explicit `PACKAGE_PROXY` provided | Export HTTP(S) proxy variables for the package process only |
| `PACKAGE_PROXY` missing | Clear package-process proxy variables so no implicit local proxy is used |
| `winCodeSign-2.6.0.7z` symlink extraction fails | Keep `signAndEditExecutable: false` for local unsigned packaging |

### 7.5 Good/Base/Bad Cases

- Good: `npm run package:win` generates `dist/MIB Browser Setup <version>.exe` on a normal Windows user account.
- Base: `dist/win-unpacked/resources/icon.png` exists because runtime icon assets are copied through `extraResources`.
- Bad: Rely on a default local proxy such as `127.0.0.1:7897`; proxy use must be explicit.
- Bad: Re-enable Windows sign/edit without testing on a normal, non-elevated Windows account.

### 7.6 Wrong vs Correct

#### Wrong

```json5
{
  "win": {
    "icon": "build/icon.ico"
  }
}
```

This can route local unsigned builds through electron-builder's Windows signing/editing toolchain and fail while extracting `winCodeSign-2.6.0.7z` if the account cannot create symlinks.

#### Correct

```json5
{
  "win": {
    "icon": "build/icon.ico",
    "signAndEditExecutable": false
  }
}
```

This keeps local Windows installer generation independent of signing-tool symlink extraction permissions.

---

## 8. Wrong vs Correct

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
