# Rewrite README For Current Project

## Goal

Rewrite `README.md` so it accurately describes the current MIB Browser project, including recent MIB dependency parsing, SNMP table viewer/editor, expanded SNMPv3 options, debug mode, and improved diagnostics.

## What I Already Know

- Current README is concise but outdated.
- The app is an Electron + React + TypeScript desktop MIB Browser.
- Current features include:
  - MIB file/directory loading and cache.
  - Dependency-aware MIB parsing with missing dependency diagnostics.
  - MIB tree browsing and OID search.
  - SNMP GET / GETNEXT / GETBULK / WALK / BULK_WALK / SET.
  - Dedicated GET/SET tool window.
  - Dedicated SNMP Table Viewer with filtering/sorting/column visibility/copy/CSV and editable cells.
  - SNMPv1/v2c/v3 with expanded SNMPv3 auth/privacy and UDP IPv4/IPv6 transport.
  - Debug Mode logging.
  - Dismissible MIB diagnostics notification and details modal.
- Package scripts are `dev`, `build`, `preview`, `typecheck`, `lint`, and `test`.
- Packaging uses `electron-builder` with Windows NSIS, macOS DMG, and Linux AppImage targets.

## Requirements

- Rewrite README in Chinese, with clear technical English terms where useful.
- Describe what the app is and what it is not.
- Include a realistic feature list matching the codebase.
- Include quick start, scripts, build/package instructions, and troubleshooting.
- Include a project structure section.
- Include notes on Debug Mode and diagnostic output.
- Include limitations/out-of-scope so expectations are clear.
- Keep README practical rather than marketing-heavy.

## Acceptance Criteria

- [ ] `README.md` is rewritten and no longer omits major current capabilities.
- [ ] Commands match `package.json`.
- [ ] Build/package targets match `electron-builder.json5`.
- [ ] Feature descriptions align with current source modules and recent commits.
- [ ] No broken local file links are introduced.
- [ ] Typecheck/lint/test/build are run where appropriate.

## Definition Of Done

- `README.md` updated.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes.
- Task is committed, archived, journaled, and pushed.

## Technical Approach

1. Inspect current README, package scripts, source modules, and recent commits.
2. Rewrite README with sections:
   - Overview
   - Current capabilities
   - Screens/workflows
   - Quick start
   - Scripts
   - Build/package
   - Project structure
   - Debugging/diagnostics
   - Limitations
   - License
3. Run validation commands and commit.

## Out Of Scope

- Generating screenshots.
- Changing application code.
- Publishing release artifacts.
- Writing external docs site.
