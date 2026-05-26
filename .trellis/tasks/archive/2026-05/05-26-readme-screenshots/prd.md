# Polish README with Screenshots

## Goal

Make the README more visually useful and less plain by embedding the screenshots under `doc/png/` with relative paths and tightening the content around product value, common workflows, and the visible UI.

## Requirements

* Reference screenshots from `doc/png/` using relative paths.
* Use the available screenshots:
  * `doc/png/main.png`
  * `doc/png/device-setting.png`
  * `doc/png/table-viewer.png`
* Improve the README opening so it feels more like a product/project page.
* Keep the README in Chinese.
* Preserve accurate setup, packaging, troubleshooting, limitations, and GPL-3.0 license information.
* Do not change application code.

## Acceptance Criteria

* [x] README directly renders the three screenshot images with relative paths.
* [x] README has stronger opening copy and clearer visual sections.
* [x] README still documents key MIB/SNMP/Table Viewer/Debug Logs behavior.
* [x] README still includes quick start, build/package, project structure, FAQ, limitations, and license.
* [x] `git diff --check` passes.

## Definition of Done

* README changes are committed separately from Trellis task archival.
* Existing screenshot asset commit is preserved.
* No application code changes are made.

## Technical Approach

Rewrite the top half of README around screenshots and concrete workflow sections. Keep command/reference sections concise and stable. Use Markdown image links with repo-relative paths.

## Out of Scope

* Creating new screenshots.
* Editing screenshots.
* Changing app UI or runtime behavior.

## Technical Notes

* `doc/png/main.png`, `doc/png/device-setting.png`, and `doc/png/table-viewer.png` were added in `docs: add screenshot assets`.
