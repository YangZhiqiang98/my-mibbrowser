# Simplify README

## Goal

Restore the README to a concise, clear project overview that is closer to the original straightforward format while keeping the current screenshots referenced from `doc/`.

## Requirements

- Keep README in Chinese.
- Keep the content practical and short, avoiding product-page/showcase wording.
- Reference screenshots from `doc/png/` with relative paths.
- Preserve accurate project basics: Electron, React, TypeScript, SNMP/MIB scope, common scripts, packaging, limitations, and GPL-3.0 license.
- Do not change application code or screenshot assets.

## Acceptance Criteria

- [x] README is materially shorter and easier to scan than the current version.
- [x] README includes the available screenshots by relative path.
- [x] README still documents quick start, common scripts, build/package output, project structure, limitations, and license.
- [x] Markdown whitespace check passes.

## Out of Scope

- Adding new screenshots.
- Changing app behavior.
- Changing Trellis specs.

## Technical Notes

- User prefers the earliest/simple README style: concise, clear, direct.
- Existing screenshot assets are `doc/png/main.png`, `doc/png/device-setting.png`, and `doc/png/table-viewer.png`.
