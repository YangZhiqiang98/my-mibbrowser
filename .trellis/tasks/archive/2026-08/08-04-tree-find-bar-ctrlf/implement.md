# Implement — Ctrl+F Floating Find Bar

Execution order. Validation after each step; stop on any red gate.

## Step 1 — Pure navigation helper + tests

- [ ] Add `src/renderer/src/utils/findNavigation.ts`:
  - `stepIndex(current: number, total: number, dir: 1 | -1): number` — wrap-around;
    `total <= 0` → `0`.
  - `mergeExpandedKeys(prev: readonly string[], ancestors: readonly string[]): string[]`
    — union without duplicates; return the SAME `prev` array reference when `ancestors`
    adds nothing (perf invariant).
- [ ] Add `src/renderer/src/utils/findNavigation.test.ts` covering wrap both directions,
  `total` 0/1/n, and `mergeExpandedKeys` (adds only new, stable ref when subset).

Validation: `npx vitest run src/renderer/src/utils/findNavigation.test.ts` green.

## Step 2 — MibTreePanel state & handlers

- [ ] Add `isFindOpen` state + `findInputRef`. Remove reliance on the always-visible box.
- [ ] `useEffect` window `keydown`: Ctrl/⌘+F → preventDefault, open bar, focus+select
  input (via `requestAnimationFrame`). Cleanup on unmount.
- [ ] Rewrite `performSearch` to only set `searchMatchIds` + `currentMatchIndex = 0`
  (drop the mass `setExpandedKeys(...all ancestorIds)` and the inline first-match select
  — the `currentMatchIndex` effect now owns expand/scroll/select).
- [ ] Debounce `searchText` → `performSearch` while `isFindOpen` (180ms); clear on empty.
- [ ] Update the `currentMatchIndex` effect to select the current node (setSelectedNode +
  setQueryOid) in addition to expand (via `mergeExpandedKeys`) + scroll.
- [ ] Repurpose `handleSearchKeyDown` for the find input: Enter→next, Shift+Enter→prev
  (via `stepIndex`), Esc→close+clear.

Validation: `npm run typecheck`.

## Step 3 — Highlight only current match

- [ ] Module-level `const EMPTY_MATCH_SET: ReadonlySet<string> = new Set()`.
- [ ] `currentMatchId = searchMatchIds[currentMatchIndex] ?? null`; `highlightSet =
  useMemo(() => currentMatchId ? new Set([currentMatchId]) : EMPTY_MATCH_SET,
  [currentMatchId])`.
- [ ] Pass `searchMatchIds: highlightSet` to `dataNodeBuilder.build(...)` (replaces the
  all-matches `searchMatchSet`). Remove the now-unused `searchMatchSet` memo.

Validation: `npm run typecheck` + existing `mibTreeDataNodes.test.ts` green.

## Step 4 — Render: remove box, add floating bar

- [ ] Delete the `.mib-tree-search` JSX block.
- [ ] Wrap `.mib-tree-content` in `.mib-tree-content-outer`; render the find bar
  (`.mib-tree-find-bar`) as an absolutely-positioned sibling when `isFindOpen`:
  input (ref/value/onChange/onKeyDown), `cur / total` or "no matches", ↑ ↓ buttons
  (disabled when `total === 0`), ✕ (close+clear).
- [ ] Drop the now-unused `SearchOutlined` import if no longer referenced.

Validation: `npm run typecheck` + `npm run lint`.

## Step 5 — CSS

- [ ] In `styles.css`: replace `.mib-tree-search { padding: 0 12px; }` with
  `.mib-tree-content-outer` (relative flex container) and `.mib-tree-find-bar`
  (absolute top-right, bordered, shadowed, compact input ~180px, muted count).

Validation: `npm run lint`.

## Step 6 — Full gate + manual

- [ ] `npm run typecheck` && `npm run lint` && `npm run test` all green.
- [ ] Manual (dev): Ctrl+F opens/focuses; type name & OID fragment → correct `cur/total`;
  Enter/Shift+Enter cycle + wrap, only current path expands; Esc/✕ close + clear; broad
  query (e.g. `1.3.6`) stays responsive (tree not mass-expanded).

## Rollback points

- Steps 1–3 are behavior-neutral until Step 4 swaps the UI; if the bar misbehaves, revert
  Step 4/5 and the old box can be temporarily restored from git.
