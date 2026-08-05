# Design — Ctrl+F Floating Find Bar for the MIB Tree

## Scope

Renderer-only. All changes in `MibTreePanel.tsx` + `styles.css`, plus a tiny pure
helper (extracted for testability). No IPC / main-process / type changes.

## Current shape (recap)

- State: `searchText`, `searchMatchIds: string[]`, `currentMatchIndex`, `expandedKeys`.
- `treeIndex.search(q)` → `{ matchIds, ancestorIds }` (name+OID, case-insensitive).
- `performSearch` sets matchIds AND `setExpandedKeys(...ancestorIds of ALL matches)` +
  selects first match.
- `useEffect([currentMatchIndex])` expands the current match's ancestors + scrolls.
- `filteredTreeData = dataNodeBuilder.build(mibTree, { searchMatchIds: <all matches> })`
  → highlights ALL matches (yellow), invalidating every matched path.
- Always-visible `.mib-tree-search` Input renders the box.

## Target shape

### 1. State / interaction

- Add `isFindOpen: boolean` (default false) and `findInputRef`.
- Keep `searchText`, `searchMatchIds`, `currentMatchIndex`.
- **Open**: a `window` `keydown` listener for `(e.ctrlKey || e.metaKey) && e.key === 'f'`
  → `preventDefault()`, `setIsFindOpen(true)`, focus + select the input on next frame.
  This is the app's primary find, so it is global (not gated on tree focus). Do not
  hijack when the key repeats inside the find input itself (still fine to re-focus).
- **Close**: Esc (input `onKeyDown`) or ✕ → `setIsFindOpen(false)`, clear `searchText`,
  `searchMatchIds`, `currentMatchIndex` (removes highlight).

### 2. Type-ahead search (debounced)

- A `useEffect` debounces `searchText` (~180ms) while `isFindOpen`. On fire, call
  `performSearch(searchText)`:
  - `const { matchIds } = treeIndex.search(q)`; `setSearchMatchIds(matchIds)`;
    `setCurrentMatchIndex(0)`.
  - Do NOT expand all ancestors here. Expansion/scroll/select of the FIRST match is
    handled by the existing `useEffect([currentMatchIndex, searchMatchIds])`.
- Empty/whitespace query → clear matches.

### 3. Navigation — one match at a time (the perf fix)

- `useEffect([currentMatchIndex, searchMatchIds])` (existing, kept):
  - `matchId = searchMatchIds[currentMatchIndex]`.
  - `setExpandedKeys(prev => mergeAncestors(prev, treeIndex.getAncestorIds(matchId)))`
    — only THIS match's path.
  - select the node (updates node-detail + `queryOid`), then scroll it into view.
- Enter / Shift+Enter (input `onKeyDown`) and ↑/↓ buttons mutate `currentMatchIndex`
  with wrap: `next = (i + 1) % n`, `prev = (i - 1 + n) % n`.
- Extract the pure step math into `src/renderer/src/utils/findNavigation.ts`:
  - `stepIndex(current: number, total: number, dir: 1 | -1): number` (wrap-around; total
    0 → 0).
  - `mergeExpandedKeys(prev: string[], ancestors: string[]): string[]` (dedup union;
    returns `prev` unchanged reference when nothing new, so the perf invariant — only
    the current match's ancestors are added — is unit-testable). AC4 tests this.

### 4. Highlight only the current match

- Compute `currentMatchId = searchMatchIds[currentMatchIndex] ?? null`.
- `const highlightSet = useMemo(() => currentMatchId ? new Set([currentMatchId]) : EMPTY,
  [currentMatchId])` (module-level frozen `EMPTY` set for stable identity).
- Pass `searchMatchIds: highlightSet` to `dataNodeBuilder.build(...)`. The builder is
  unchanged: only the current (and previously-current) node's path re-derives, so
  re-render stays O(path), not O(all matches).
- Keep the existing yellow `MATCH_TITLE_STYLE` for the single current match.

### 5. Render / layout

- Delete the `.mib-tree-search` block.
- Wrap the tree scroll area:
  ```
  <div className="mib-tree-content-outer">           // position: relative; flex:1; min-height:0
    {isFindOpen && <FindBar .../>}                    // position: absolute; top/right
    <div className="mib-tree-content"> …Tree… </div>  // unchanged scroll container
  </div>
  ```
- `FindBar` (inline JSX or small local component): 🔍 icon, `Input` (ref, value,
  onChange, onKeyDown for Enter/Shift+Enter/Esc), `cur / total` (or "no matches"), ↑ ↓
  buttons (disabled when total 0), ✕ button. antd `Input` + `Button`, `size="small"`.

### 6. CSS (`styles.css`)

- Replace `.mib-tree-search` rule with `.mib-tree-content-outer { position: relative;
  flex: 1; min-height: 0; display: flex; flex-direction: column; }` and add
  `.mib-tree-find-bar { position: absolute; top: 6px; right: 12px; z-index: 10; display:
  flex; align-items: center; gap: 6px; padding: 4px 6px; background: var(--surface, #fff);
  border: 1px solid #d9d9d9; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.15); }`
  plus a compact input width (~180px) and a muted count span. (Match existing panel
  colors; dark-mode not currently themed in this file, so keep neutral.)

## Edge cases

- No MIB loaded (`filteredTreeData` empty): Ctrl+F still opens the bar; search yields 0
  matches and shows "no matches".
- Cache refresh removing nodes mid-search: existing stale-match cleanup effect stays.
- Rapid typing: debounce coalesces; the O(n) search is cheap.
- Ctrl+F while a modal (Cache / diagnostics) is open: acceptable to open the bar, but the
  listener checks `document.querySelector('.ant-modal-root .ant-modal')` is absent to
  avoid stealing the key from a dialog — optional guard, keep simple.

## Testing

- `findNavigation.test.ts`: `stepIndex` wrap-around (0-based, wrap both directions, total
  0/1), `mergeExpandedKeys` (adds only new ancestors, stable reference when subset).
- Existing `mibTreeIndex.test.ts` / `mibTreeDataNodes.test.ts` stay green (name+OID search
  and builder highlight semantics unchanged; highlight now receives a 1-element set).
- Manual/visual: Ctrl+F open, type name & OID, Enter/Shift+Enter cycle, Esc close, broad
  query stays snappy (tree not mass-expanded).

## Rollback

Self-contained renderer change; revert the commit. No data/format/API impact.
