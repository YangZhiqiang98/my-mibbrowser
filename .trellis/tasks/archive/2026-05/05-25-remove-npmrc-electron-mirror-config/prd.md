# Remove npmrc Electron Mirror Config

## Goal

Remove Electron-specific mirror configuration from `.npmrc` because it only affects Electron binary download behavior and causes npm unknown-config warnings during normal commands.

## Requirements

- Keep the npm registry mirror configuration.
- Remove `.npmrc` entries that npm reports as unknown project config:
  - `electron_mirror`
  - `electron_custom_dir`
- Update README install guidance so it no longer says `.npmrc` configures Electron binary downloads.
- Do not change application code.

## Acceptance Criteria

- [ ] `.npmrc` only contains relevant npm registry configuration.
- [ ] README install guidance matches the new `.npmrc` content.
- [ ] Running an npm script no longer prints the Electron mirror unknown-config warnings.

## Definition Of Done

- Files are updated.
- A lightweight npm command verifies the warning is gone.
- Task is committed, archived, journaled, and pushed.

## Technical Notes

- `rg "electron_mirror|electron_custom_dir|Electron 二进制|electron 镜像|镜像" -n .` found README install guidance as the only documentation reference that needs adjustment.
- This is a configuration/documentation cleanup only.

## Out Of Scope

- Adding a replacement Electron download mirror workflow.
- Changing package dependencies or build configuration.
