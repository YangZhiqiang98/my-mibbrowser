# Replace tree search box with Ctrl+F floating find bar (name/OID, prev/next, faster)

## Goal

Make searching the left MIB tree fast and unobtrusive. Remove the always-visible
search input; trigger a compact **floating find bar** with **Ctrl+F**, search by
**name or OID**, navigate matches with **next / previous**, and highlight/scroll to
**one match at a time** so a broad query no longer expands and re-renders the whole
tree.

## Background / Why current search is slow

`MibTreePanel` already searches name+OID and cycles matches, but on each search it:
1. `performSearch` expands the ancestors of **every** match (`setExpandedKeys(...all
   ancestorIds)`) → a common substring expands a huge portion of the tree, so antd
   renders thousands of DOM rows.
2. `dataNodeBuilder` marks **every** match with `isMatch` → the DataNode cache is
   invalidated along every matched path → large re-render.

Navigating one match at a time (expand + highlight only the current match) removes
both costs. The O(n) index search itself is not the bottleneck.

## Requirements

- R1: Remove the always-visible `.mib-tree-search` input from the tree panel.
- R2: **Ctrl+F** (and ⌘F) opens a floating find bar docked at the top-right of the
  tree panel and focuses its input; it does not block tree interaction (non-modal).
- R3: **Esc** closes the find bar and clears the highlight; the close (✕) button does
  the same.
- R4: Search matches by **node name OR OID** substring (case-insensitive), reusing the
  existing `treeIndex.search`.
- R5: Type-ahead: matches recompute as the user types (debounced). The bar shows the
  running position/count, e.g. `3 / 57`. Empty query / no matches shows a clear
  "no matches" state and no highlight.
- R6: **Enter = next**, **Shift+Enter = previous**; ↑/↓ buttons do the same. Cycling
  wraps around. On reaching a match, expand only that match's ancestor path, scroll it
  into view, and highlight it as the current match.
- R7: Performance — a broad query (hundreds of matches) must NOT expand or highlight
  all matches. Only the current match's path is expanded and only the current match is
  highlighted.
- R8: Preserve existing selection behavior — landing on a match selects it (updates the
  node-detail panel and query OID), exactly as the old search did.

## Acceptance Criteria

- [ ] AC1 (manual): No search box is visible by default; Ctrl+F reveals the floating bar with the
  input focused; Esc / ✕ hides it and removes any highlight.
- [ ] AC2 (manual): Typing `client` finds name matches; typing an OID fragment (e.g. `8886.1.82`)
  finds OID matches; the count `cur / total` is correct.
- [ ] AC3 (manual): Enter advances to the next match and Shift+Enter to the previous, wrapping;
  each step expands only the current match's path and scrolls it into view.
- [x] AC4 (perf): For a query matching many nodes, `expandedKeys` grows only by the
  current match's ancestors between steps — not by all matches' ancestors. Covered by
  `findNavigation.test.ts` (`mergeExpandedKeys` stable-ref invariant + `stepIndex`).
- [x] AC5: `mibTreeIndex.search` still returns name+OID matches (existing tests green);
  the DataNode builder highlights only the current match (single-element `highlightSet`).
- [x] AC6: `npm run typecheck`, `npm run lint`, `npm run test` (178), and `npm run build`
  all green.

> AC1–AC3 are interaction-level and need a quick `npm run dev` check on real MIBs; the
> underlying logic (nav math, expansion, highlight, search) is unit-verified.

## Refinements (follow-up in same task)

- R9: Navigate matches with the **Arrow Up / Down** keys too (not only Enter/Shift+Enter);
  a broad query must not rebuild the whole tree per step — the tree data is built once
  per `mibTree` and the current match is shown via antd selection + scroll (stable
  `filteredTreeData` across navigation). *(fixes the "only first / arrows do nothing /
  janky" report)*
- R10: Larger, **draggable** find bar. Default position is **centered in the app**
  (`position: fixed`, viewport-centered); the 🔍 grip drags it anywhere (clamped to the
  viewport); position resets to center on close.
- R11: **Case sensitivity toggle** ("Aa"): search is case-insensitive by default; the
  toggle switches to exact-case matching. `mibTreeIndex.search(query, caseSensitive)`
  carries the flag (unit-tested).

- [x] AC7 (R9): ↑/↓ arrow keys navigate; `filteredTreeData` no longer depends on the
  current match (no per-step whole-tree rebuild). typecheck/lint/tests green.
- [ ] AC8 (R10, manual): find bar opens centered in the app; the grip drags it (clamped
  to the viewport); reopening resets to center.
- [x] AC9 (R11): `search(query, true)` matches exact case only; default stays
  case-insensitive (`mibTreeIndex.test.ts`).

## Out of Scope

- Changing the search algorithm/index data structure (already O(n), fast enough).
- Fuzzy/regex search, search history, or searching node descriptions.
- Virtualized rendering of the tree (separate perf effort if ever needed).
