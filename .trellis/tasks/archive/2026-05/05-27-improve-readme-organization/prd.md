# Improve README Organization From Reference Projects

## Goal

Rework `README.md` into a clearer, product-oriented document by learning from mature open-source project READMEs while preserving the user's current simplification direction and existing README edits.

## What I already know

* User modified `README.md` before this task; their current edit removes some detailed tail sections.
* User wants the README to be informed by good project examples, not just locally patched.
* Current project is a desktop Electron + React + TypeScript SNMP/MIB browser.
* Existing README already has useful screenshots, feature table, setup commands, usage steps, SNMPv3 support, packaging notes, project structure, and license.

## Research References

* [`research/readme-reference-patterns.md`](research/readme-reference-patterns.md) — Extracted README organization patterns from GitHub Docs, VS Code, DBeaver, Netdata, Postman App Support, and Electron docs.

## Requirements

* Preserve the user's current README edits unless there is a clear reason to reorganize them.
* Reorganize the README for first-time readers:
  * what the app is;
  * what problems it solves;
  * what it can do;
  * how to run it;
  * how to use the main workflows;
  * where implementation/development notes belong.
* Keep the document in Chinese and keep it concise.
* Keep screenshot paths and package commands accurate.
* Avoid adding unsupported marketing claims or aspirational features.
* Do not modify application source code.

## Acceptance Criteria

* [x] README structure is improved based on reference-project patterns.
* [x] User's current simplification direction is respected.
* [x] Existing screenshots still resolve.
* [x] Commands match `package.json`.
* [x] Research notes are persisted under the task directory.
* [x] `npm run typecheck`, `npm run lint`, and `npm test` pass or are explicitly reported if skipped.

## Definition of Done

* README is updated.
* Task research and PRD are committed.
* Task is archived and session journal recorded.
* Changes are pushed to `origin/main`.

## Technical Approach

Use the current README as the base, then restructure it around a reference-inspired flow:

1. Short product intro and audience/problem.
2. Screenshots.
3. Capability summary grouped by workflow.
4. Quick start and scripts.
5. Main workflows.
6. Protocol/runtime notes.
7. Architecture/development notes kept compact.
8. License.

## Out of Scope

* New screenshots.
* Source-code changes.
* New public website or docs site.
* Long FAQ copied back verbatim from the earlier README.

## Technical Notes

* Main file: `README.md`.
* Package scripts come from `package.json`.
* Screenshots: `doc/png/main.png`, `doc/png/device-setting.png`, `doc/png/table-viewer.png`.
