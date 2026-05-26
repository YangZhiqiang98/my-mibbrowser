# Improve README

## Goal

Refresh the README so it reads like a clear project homepage for MIB Browser instead of a long feature dump. Reserve screenshot sections for future images without requiring image assets in this task.

## Requirements

* Reorganize README into a clearer, more scannable structure.
* Keep the README in Chinese.
* Add screenshot placeholders for future images.
* Preserve accurate technical information about SNMP/MIB features, debug logs, build commands, limitations, and GPL-3.0 license.
* Do not commit current untracked `doc/` assets in this task.

## Acceptance Criteria

* [x] README starts with a concise product summary and feature highlights.
* [x] README includes reserved screenshot placeholders with stable paths.
* [x] Quick start, development checks, packaging, usage notes, limitations, troubleshooting, and license sections remain present.
* [x] Existing user-facing behavior documented in recent work remains accurate.
* [x] No unrelated untracked `doc/` files are committed.

## Definition of Done

* README is updated and reviewed for flow.
* Markdown remains readable without screenshots present.
* `git diff --check` passes.

## Technical Approach

Rewrite `README.md` as a concise product/developer README. Use explicit image placeholder comments rather than broken Markdown image links so the README stays clean until screenshots are actually added.

## Out of Scope

* Adding or committing screenshot image files.
* Changing app code.
* Updating package metadata.

## Technical Notes

* Existing README already contains feature facts to preserve.
* `doc/png/device-setting.png` exists locally but is currently untracked and should not be included unless explicitly requested.
