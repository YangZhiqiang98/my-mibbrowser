# electron-builder platform packaging notes

## Sources

* https://www.electron.build/docs/features/multi-platform-build/
* https://www.electron.build/docs/mac
* https://www.electron.build/docs/targets

## Findings

* The project already uses electron-builder, which packages Electron desktop apps for Windows, macOS, and Linux.
* macOS targets are configured under the top-level `mac` key. `dmg` is a supported macOS target.
* electron-builder supports CLI target selection such as `--win --x64` and `--mac --x64 --arm64`.
* macOS packaging, code signing, and notarization are most reliable on macOS. This task should expose a macOS packaging command, but should document that it is intended to run on macOS.
* The Windows packaging run reached electron-builder after mirror downloads succeeded, then failed extracting `winCodeSign-2.6.0.7z` because the current Windows account lacked symlink privilege for files inside that archive.
* `win.signAndEditExecutable: false` skips electron-builder's rcedit/signing path and avoids the `winCodeSign` extraction requirement for local unsigned packaging.

## Project mapping

* Existing `electron-builder.json5` already defines:
  * Windows: NSIS, x64.
  * macOS: DMG, x64 and arm64.
  * Linux: AppImage, x64.
* The fixed scripts can delegate to the existing builder config instead of duplicating target definitions.
* Use `https://npmmirror.com/mirrors/electron/` for Electron downloads and `https://npmmirror.com/mirrors/electron-builder-binaries/` for electron-builder helper binaries.
