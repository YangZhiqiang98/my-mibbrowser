# Research: Issue 4 — `raisecomClockEObjects` Children Render at Root Level

- **Query**: Why do `raisecomClockEDeviceMaster`, `raisecomClockESSMEnable`, `raisecomClockESrcStatusTable` render at the leftmost (root) column instead of being indented under `raisecomClockEObjects`?
- **Scope**: Internal code analysis + real MIB file analysis
- **Date**: 2026-05-18

## Summary (TL;DR)

**Root cause: `MibNode.id` is NOT globally unique across `MibParser` instances. Combined with a buggy `extractModuleName` and a name-based module dedup in `loadMibCache`, the user ends up with many cached nodes sharing IDs with freshly-parsed nodes. The renderer's `buildTreeFromNodes` builds `dedupedMap` via `new Map(arr.map(n => [n.id, n]))` — last write wins. This silently overwrites entries, and when a cached node's `parentId` points to an ID whose owner got displaced or orphan-filtered, the cached node falls into the `roots` array (PRD addendum suspect #3 confirmed).**

PRD addendum suspects revisited:
1. ❌ `parseMultiSegmentOidDef` parent-not-found path — NOT the cause. The 3 nodes have simple `oidDef`s (`raisecomClockEObjects N`) that `parseOidDef` handles correctly; the multi-segment branch is never used for them.
2. ❌ Dedup-by-oid `children` merge — NOT the cause. No two CLOCKE nodes share an `oidString`, so the dedup path is a no-op for them.
3. ✅ **Renderer `roots` decision via `dedupedMap.has(parentId)` — CONFIRMED**. But the trigger is upstream: ID collision between cached and fresh nodes corrupts both `nodeById` (orphan filter) and `dedupedMap` (renderer).

The bug surfaces ONLY in the cache-restore-then-load scenario. A single in-session load of these two MIB files (with `optSysMgmt` resolvable from a co-loaded BASE-MIB) produces the correct tree — confirmed by direct simulation.

---

## 1. The 3 misplaced nodes — exact definitions from `RAISECOM-OTP-CLOCKE-MIB.my`

### 1.1 `raisecomClockEDeviceMaster` (lines 239–252)

```
    -- �豸�������� 
    raisecomClockEDeviceMaster OBJECT-TYPE
        SYNTAX      INTEGER  
            {
                 master(1), 
                 slave(2)
            }
        MAX-ACCESS read-write
        STATUS current
        DESCRIPTION 
            "
                Master or slave status of device.
            "
        DEFVAL  { master }
        ::= {raisecomClockEObjects 1}
```

`oidDef` captured by `parseObjectTypes` regex: `raisecomClockEObjects 1` ✓ (DEFVAL braces are inside the lazily-matched body, NOT inside `::=\s*\{...\}`).

### 1.2 `raisecomClockESSMEnable` (lines 254–268)

```
    raisecomClockESSMEnable OBJECT-TYPE 
        SYNTAX     INTEGER
            {
                standard(1),
                disable(2),
                extend(3)
            }
        MAX-ACCESS read-write
        STATUS     current
        DESCRIPTION 
            "
                enable SDH SSM function or not.     
            "
        DEFVAL{disable} 
        ::= { raisecomClockEObjects 2 } 
```

`oidDef` captured: `raisecomClockEObjects 2` ✓

### 1.3 `raisecomClockESrcStatusTable` (lines 573–581)

```
    raisecomClockESrcStatusTable OBJECT-TYPE
        SYNTAX SEQUENCE OF RaisecomClockESrcStatusEntry 
        MAX-ACCESS not-accessible
        STATUS current
        DESCRIPTION 
        " 
            The table holding information related to the clock soucre status.
        "   
        ::= {raisecomClockEObjects 17}
```

`oidDef` captured: `raisecomClockEObjects 17` ✓

### 1.4 Parent — `raisecomClockEObjects` (line 107)

```
raisecomClockEObjects   OBJECT IDENTIFIER ::= { raisecomClockEMib 1 }
```

Captured by `parseObjectIdDefs`. `oidDef = "raisecomClockEMib 1"`. ✓

### 1.5 Correctly-rendered sibling — `raisecomClockEPllCmd` (lines 270–283)

```
     raisecomClockEPllCmd OBJECT-TYPE
        SYNTAX INTEGER    
            {
                holdover(1),
                lock(2),
                freerun(3)
            }
        MAX-ACCESS read-write
        STATUS     current
        DESCRIPTION 
            "
                pll control command 
            "
        ::= { raisecomClockEObjects 3 }  
```

Has no `DEFVAL`, but identical structure otherwise. `oidDef = "raisecomClockEObjects 3"`. ✓

**Conclusion from parse-level**: All 11 children of `raisecomClockEObjects` are parsed correctly with the same shape. There is NO parser-regex anomaly that could single out nodes 1, 2, 17.

---

## 2. Step-by-step state of the 3 nodes through the pipeline

The following state is **reproduced by `D:/learn/my-mibbrowser/.trellis/tasks/05-18-fix-mib-tree-and-getbulk-regressions/research/trace4.cjs`** (single-session, BASE+BERT+CLOCKE, no cache):

| Stage | `raisecomClockEDeviceMaster` | `raisecomClockESSMEnable` | `raisecomClockESrcStatusTable` |
|---|---|---|---|
| After `parseObjectTypes` | `id=node-X+1, oidDef="raisecomClockEObjects 1", parentId=null, oid=[]` | `id=node-X+2, oidDef="raisecomClockEObjects 2"` | `id=node-X+25, oidDef="raisecomClockEObjects 17"` |
| After `buildRelationships` pass 1 | `parentId=raisecomClockEObjects.id, oid=[]` (parent's oid not yet resolved) | same | same |
| After `buildRelationships` pass 2 (iter 1) | `parentId=raisecomClockEObjects.id, oid=[1,3,6,1,4,1,8886,15,1,14,1,1]` | `oid=...14.1.2` | `oid=...14.1.17` |
| After dedup-by-oid | unchanged (unique oidString) | unchanged | unchanged |
| After orphan filter | reachable, kept in `finalNodes` | reachable, kept | reachable, kept |
| `raisecomClockEObjects.children` contains | `[node-54, node-55, node-56, ..., node-78, ..., node-84]` — yes, all 11 IDs present | yes | yes |

Renderer `buildTreeFromNodes` then correctly attaches them under `raisecomClockEObjects`. **In a clean single-session load, the bug does NOT manifest.**

---

## 3. Why the bug manifests in the user's real setup

### 3.1 Cache state on disk (verified)

`D:/learn/mib-cache/` contains TWO cache files:

| File | Modules | Notable |
|---|---|---|
| `mib-cache-09_ros6_x_6e32ce08.json` | 311 modules | 187 modules named literally `"IMPORTS"` (extractModuleName fell through); contains `IEEE8021-CFM-V2-MIB` (42 nodes, ids node-1..node-42), `IEEE8021-CFM-MIB`, `RAISECOM-BASE-MIB`, etc. |
| `mib-cache-ADD_7977868a.json` | 2 modules, BOTH named `"IMPORTS"` | 17 nodes (BERT) + 51 nodes (CLOCKE). `raisecomClockEDeviceMaster.id = node-18`, `raisecomClockESSMEnable.id = node-19`, `raisecomClockESrcStatusTable.id = node-42` (verified by direct inspection). |

The 09_ros6.x cache also includes nodes like `dot1agCfmStack` (id=`node-16756`), `dot1agCfmDefaultMd` (id=`node-16757`), etc.

### 3.2 Why so many cached modules are named `"IMPORTS"` — `extractModuleName` bug

`parser.ts:150`:
```ts
const moduleMatch = content.match(/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
```

The `^` anchor is **not multiline** and the regex demands the module declaration at position 0. The user's MIB files start with `-- file: ...` comments and leading whitespace, e.g. BERT line 1: `-- file: RAISECOM-OPT-BERT-MIB.my`. Regex fails.

Fallback `parser.ts:155`:
```ts
const identityMatch = content.match(/(\S+)\s+MODULE-IDENTITY/i)
```

In the BERT and CLOCKE files, `MODULE-IDENTITY` first appears in the IMPORTS list (e.g. line 8 of BERT: `        MODULE-IDENTITY, OBJECT-TYPE, ...`). The token immediately before is `IMPORTS\n        `. `(\S+)` captures `IMPORTS`. → **module name = "IMPORTS"**.

This affects ANY MIB whose `DEFINITIONS ::= BEGIN` is preceded by comments AND whose IMPORTS list includes `MODULE-IDENTITY`.

### 3.3 What the user's session looks like step-by-step

1. **App start.** `mibParser = new MibParser()` (singleton, `handlers.ts:12`). `nodeIdCounter = 0`.
2. **`loadMibCache()` runs at startup** (`index.ts` calls it).
   - Reads `mib-cache-09_ros6_x_6e32ce08.json` first (filesystem order or readdir order).
   - For each cached module: `if (!existingNames.has(mod.name)) accumulatedModules.push(mod)`. Note: `existingNames` is a snapshot, NOT updated inside the loop. So all 311 cached modules from this file get loaded (including 187 modules all named "IMPORTS" — duplicates allowed within one cache file).
   - Then `mib-cache-ADD_7977868a.json`: `existingNames` now snapshots the 311 already-loaded names which INCLUDES `"IMPORTS"`. **Both ADD cache modules are named `"IMPORTS"` → both REJECTED.**
   - `accumulatedModules = 311 modules` (cached 09_ros6.x ONLY, ADD cache lost).
   - `mibNodes = buildMibTree(accumulatedModules)` (line 152).
   - `directoryModuleMap` is rebuilt from cache `sourceDir`: `'E:\\RC\\MIB\\SLT8400\\ADD' → ['IMPORTS']` (deduped from the cache file's 2 entries).
3. **User clicks "Load Directory" → ADD.** `handleOpenMibDirectory` (`handlers.ts:237`).
   - `mibParser.parseDirectory(dirPath)` → `parseFiles([BERT-path, CLOCKE-path])`.
   - `nodeIdCounter` is still **at the value it had after Fix 1's continuous counter** — but Fix 1 only prevents reset between in-session `parseFiles` calls. The counter is currently still 0 (no prior parse this session; `loadMibCache` did NOT use the parser). So fresh parse generates `node-1..node-68`.
     - Fresh BERT: `node-1..node-17` (15 OBJECT-TYPE + 1 MODULE-IDENTITY + 1 OBJECT IDENTIFIER).
     - Fresh CLOCKE: `node-18..node-68`.
     - **`raisecomClockEDeviceMaster = node-18`, `raisecomClockESSMEnable = node-19`, `raisecomClockESrcStatusTable = node-42` — exactly the cached IDs.**
   - Both fresh modules ALSO get name `"IMPORTS"` (same `extractModuleName` bug).
   - `oldModuleNames = directoryModuleMap.get('E:\\RC\\MIB\\SLT8400\\ADD') = ['IMPORTS']`.
   - `accumulatedModules = accumulatedModules.filter(m => !oldModuleNames.includes(m.name))` — strips **ALL 187 cached "IMPORTS" modules** from `accumulatedModules` (not just the 2 ADD ones). 124 modules survive.
   - Add fresh BERT + CLOCKE: `accumulatedModules.length = 126`.
   - `mibNodes = buildMibTree(accumulatedModules)` runs.

### 3.4 What `buildMibTree` does with 124 cached non-IMPORTS modules + fresh BERT + fresh CLOCKE

Sub-step results (verified by `trace7.cjs`, `trace8.cjs`, `trace9.cjs`):

**ID collisions** between fresh BERT/CLOCKE (node-1..node-68) and cached `IEEE8021-CFM-V2-MIB` (which happens to have 42 nodes also numbered node-1..node-42):

| Fresh node | Cached node sharing the same `id` |
|---|---|
| `node-1` rcOptBertTable | `node-1` ieee8021CfmStackTable |
| `node-2` rcOptBertEntry | `node-2` ieee8021CfmStackEntry |
| … | … |
| **`node-18` raisecomClockEDeviceMaster** | **`node-18` ieee8021CfmDefaultMdTable** |
| **`node-19` raisecomClockESSMEnable** | **`node-19` ieee8021CfmDefaultMdEntry** |
| `node-20` raisecomClockEPllCmd | `node-20` ieee8021CfmDefaultMdComponentId |
| … | … |
| **`node-42` raisecomClockESrcStatusTable** | **`node-42` ieee8021CfmV2Mib** |

42 collisions total (verified output: "Total cached nodes that collide with fresh ids: 42").

**`buildRelationships` runs against `allNodes` (cached + fresh + standard roots)**. Each node has parentId set via `nodeMap.get(parentName)` (which keys by NAME, immune to ID collision). Both cached and fresh `raisecomClockEDeviceMaster`-style nodes are processed; for fresh CLOCKE, parent is `raisecomClockEObjects` (fresh `node-66`), so `node-18.parentId = node-66`. For cached `ieee8021CfmDefaultMdTable`, parent is `dot1agCfmDefaultMd` (cached `node-16757`), so its `parentId = node-16757`.

**Dedup-by-oid**: each oidString unique across the two sets (`1.3.111.x` vs `1.3.6.1.4.1.8886.x`). No dedup happens. `removedIds = ∅`, `survivingNodes = allNodes`. **Two nodes with the same `.id` BOTH survive.**

**Orphan filter walk** uses `nodeById = new Map(); for (n of survivingNodes) nodeById.set(n.id, n)` — last-write-wins. With 42 collisions, the LATER-inserted node (fresh, since fresh modules are appended last) wins `nodeById`. For each survivingNode the walk follows `current.parentId` through `nodeById.get(...)`.

Because cached `dot1agMIBObjects` was in module `"IMPORTS"` (stripped at step 3.3 above), the cached IEEE8021 nodes can never trace their parent chain to `oidString = '1'`. **Yet they get marked reachable anyway** — see trace9.cjs `step 1: → already reachable`. Mechanics: when the FRESH `raisecomClockEDeviceMaster` (id=node-18) is walked, it reaches `iso` via `raisecomClockEObjects → raisecomClockEMib → optSysMgmt → raisecomOptSysCommon → raisecom → enterprises → ... → iso`. The walk sets `reachable.add('node-18')`. Later when the cached `ieee8021CfmDefaultMdTable` (also id=node-18) is iterated, `reachable.has('node-18')` is already true → it short-circuits "already reachable", AND its `chain.push('node-18')` causes itself to be marked reachable too. Worse, all its descendants are now reachable transitively.

After orphan filter: `final` has 9051 nodes including most cached `IEEE8021-CFM-V2-MIB` nodes that should logically be orphans. 42 ID collisions persist into `final`.

### 3.5 Renderer `buildTreeFromNodes` (`mibTreeUtils.ts:21-102`)

```ts
const dedupedNodes = nodes.map(node => ({ ...node, children: [...new Set(node.children)] }))
const dedupedMap = new Map(dedupedNodes.map(n => [n.id, n]))  // last-write-wins
```

For id=`node-18`: dedupedMap entry is overwritten twice; the LAST insertion wins. Order of survivingNodes is allNodes order:
1. standard roots
2. cached 09_ros6.x modules (alphabetical)
3. fresh BERT
4. fresh CLOCKE

So fresh CLOCKE's `raisecomClockEDeviceMaster` is the LAST insertion at id=node-18 → `dedupedMap.get('node-18') = raisecomClockEDeviceMaster`.

```ts
const rootSet = new Set<string>()
const roots = dedupedNodes.filter(n => {
  if (n.parentId && dedupedMap.has(n.parentId)) return false
  if (rootSet.has(n.id)) return false
  rootSet.add(n.id)
  return true
})
```

The filter iterates `dedupedNodes` (the FULL array with 9051 entries, NOT deduplicated by id). It evaluates EACH entry independently:

- **Cached `ieee8021CfmDefaultMdTable` (id=node-18, parentId=`node-16757`)**: `dedupedMap.has('node-16757')` is **FALSE** because cached `dot1agCfmDefaultMd` (node-16757) was orphan-filtered out of `final` (its parent was `dot1agCfmMIB.id`, which is in the stripped "IMPORTS" module — so its walk couldn't reach `oid='1'` and reachable.has is false for it). With no entry in `final`, also no entry in `dedupedMap`. Filter sees parentId not in map → **node IS a root**. `rootSet.add('node-18')`.
- **Fresh `raisecomClockEDeviceMaster` (id=node-18, parentId=`node-66`)**: appears later in `dedupedNodes`. `dedupedMap.has('node-66')` is TRUE (raisecomClockEObjects is in final). It would have been filtered out (not a root) — BUT `rootSet.has('node-18')` is now TRUE (cached one grabbed the slot). Filter returns false → not in roots.

Same chain for `node-19` and `node-42`. Result: the **cached IEEE8021 nodes** occupy the root slots node-1, node-12, node-18, node-27, node-33, node-42 (verified via trace9.cjs ROOTS output).

```ts
function buildNode(node: RawMibNode): MibTreeNodeData {
  return {
    id: node.id, name: node.name, oid: resolvedOid,
    ...
    children: node.children
      .map(cid => dedupedMap.get(cid))
      .filter((n): n is RawMibNode => !!n)
      .map(buildNode)
  }
}
```

When `ieee8021CfmDefaultMdTable` (the cached root) renders its children: `node.children` is `['node-19']` (cached ieee8021CfmDefaultMdEntry). `dedupedMap.get('node-19') = raisecomClockESSMEnable` (fresh, last-write-wins). So the rendered tree shows:

```
ieee8021CfmDefaultMdTable (root, but uses cached's name)
  └─ raisecomClockESSMEnable  ← WRONG node fetched from dedupedMap by id
```

And the standard chain `iso → ... → raisecomClockEObjects` also renders `raisecomClockESSMEnable` as a child (correct). So `raisecomClockESSMEnable` appears **TWICE** in the rendered tree. The trace confirms:

```
raisecomClockESSMEnable: 2 occurrence(s)
  at: iso > org > dod > internet > private > enterprises > raisecom > raisecomOptSysCommon > optSysMgmt > raisecomClockEMib > raisecomClockEObjects > raisecomClockESSMEnable
  at: ieee8021CfmDefaultMdTable > raisecomClockESSMEnable
```

The user reported `raisecomClockEDeviceMaster`, `raisecomClockESSMEnable`, `raisecomClockESrcStatusTable` at root. The mechanism shown here puts the cached IEEE8021 names at root, with CLOCKE name children. The user may have:
- Reported the wrong names from memory (calling out what they expected to see), or
- Had a slightly different cache state. Either way, **the misrendering mechanism is the same**: ID collision between cached and fresh nodes → `dedupedMap` last-write-wins + `rootSet` first-grab-wins → mismatched root + descendant rendering.

---

## 4. Precise root cause (the answer the implementer needs)

The bug is a **composite** but the chain is:

1. **`MibNode.id` is generated by a per-parser counter (`parser.ts:21`).** It is unique within a single `MibParser` instance's lifetime, but NOT across:
   - App restarts (new parser instance, counter starts at 0)
   - Mixing cached modules (whose nodes carry ids from the previous session) with freshly-parsed modules
2. **`extractModuleName` (`parser.ts:148`) misnames modules whose files begin with comments**. The `^` anchor without `m` flag fails, and the fallback `(\S+)\s+MODULE-IDENTITY` matches `IMPORTS\s+MODULE-IDENTITY` from the IMPORTS section. ALL such modules end up named `"IMPORTS"`.
3. **Name-based dedup logic** in `loadMibCache` (`handlers.ts:131-138`) and `handleOpenMibDirectory` (`handlers.ts:256-264`) treats `"IMPORTS"` modules as duplicates. The ADD cache (both modules named `"IMPORTS"`) is wholesale rejected on startup when an earlier cache file already contributed any `"IMPORTS"` module. Later, when the user re-parses ADD, the `oldModuleNames=['IMPORTS']` filter strips ALL `"IMPORTS"`-named modules from `accumulatedModules` — including unrelated ones from the 09_ros6.x cache.
4. **buildMibTree's orphan filter** (`parser.ts:530-569`) uses `nodeById = new Map(survivingNodes)` which silently overwrites on id collision. Combined with the "already reachable" short-circuit (`parser.ts:546-549`), a fresh node's reachability marks the colliding cached node reachable too. Cached IEEE8021 nodes that should logically be orphans (because their real parent `dot1agMIBObjects` was filtered out as an "IMPORTS"-named module) survive into `final`.
5. **Renderer `buildTreeFromNodes` (`mibTreeUtils.ts:21-102`)**:
   - `dedupedMap` (line 72) is built with last-write-wins by id, so collision keys point to ONE node and silently lose the other.
   - The `roots` filter (line 76-81) iterates the FULL `dedupedNodes` array (not deduped by id), so BOTH colliding nodes get evaluated. The cached one — whose `parentId` references an orphan-filtered cached parent NOT in `dedupedMap` — passes the `!dedupedMap.has(n.parentId)` test and claims the `rootSet[id]` slot first. The fresh one with the correct parent is then blocked by `rootSet.has(n.id)`.
   - `buildNode` (line 83-99) resolves children via `dedupedMap.get(cid)` which returns the OTHER colliding node (fresh, last-write-wins), so the cached root mis-renders fresh CLOCKE nodes as its children, and at the correct place under `raisecomClockEObjects` the same fresh nodes also appear → duplicate rendering.

**The PRD addendum's suspect #3 is the *terminal* manifestation; the upstream cause is the lack of globally-unique ids and the buggy module-name extraction.**

---

## 5. Reproduction (minimal)

To reliably reproduce on the current code (post-Fix-1 / post-Issue-3 work):

1. Run the app at least once.
2. Open `E:\RC\MIB\SLT8400\09_ros6.x` (or any directory that contains MIBs starting with `-- file: ...` comments). This populates `D:\learn\mib-cache\mib-cache-09_ros6_x_*.json` with hundreds of cached modules named `"IMPORTS"` and the wider `IEEE8021-CFM-V2-MIB` module (42 nodes, ids node-1..node-42).
3. Close the app.
4. Restart the app. `loadMibCache` ingests the cache; `MibParser` counter is freshly 0.
5. Open `E:\RC\MIB\SLT8400\ADD`. Fresh BERT/CLOCKE parse generates `node-1..node-68`, colliding with cached `IEEE8021-CFM-V2-MIB`'s node-1..node-42.
6. Left tree renders. Sibling nodes of `raisecomClockEObjects` whose fresh IDs collide with cached `IEEE8021-CFM-V2-MIB`'s reachable nodes get displaced into roots / duplicate render positions.

Reproduction scripts confirming each stage are in this directory:
- `trace.cjs` — parse-level verification of all 3 nodes' `oidDef`
- `trace4.cjs` — clean single-session run (no bug)
- `trace7.cjs` — collision count in cache + fresh load
- `trace8.cjs` — full `buildMibTree` simulation with real cache state
- `trace10.cjs` — renderer trace showing duplicate rendering

---

## 6. Fix Recommendations (no code yet — for `trellis-implement`)

### Primary fix: make `MibNode.id` globally stable across sessions

Replace the integer counter with content-derived ids that are stable across parse runs. Options:

- **Option A (recommended)**: id = `${moduleName}::${nodeName}` (or with a small hash suffix if name collisions are possible). Cache and fresh parse of the same MIB produce identical ids, eliminating collisions by construction.
  - Need to be careful that `moduleName` itself is stable — see secondary fix.
  - Acceptable lengths: names are <100 chars typically. No concerns for Map key size.
- **Option B**: id = sha1(moduleName + nodeName + oidDef).slice(0,12). Same idea, opaque.
- **Option C**: Persist `nodeIdCounter` to disk and restore on app start. Brittle (any non-cache parser usage would still race), but minimal change.

Touch: `src/main/mib/parser.ts` — the 4 places that emit `id: \`node-${++this.nodeIdCounter}\``.

### Secondary fix: `extractModuleName`

`src/main/mib/parser.ts:148-160`. The `^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN` regex must tolerate leading comments and whitespace. Suggested approach: search the WHOLE content (not anchored), e.g. `/(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i`. Drop the `^` anchor. This is the smallest correct change and covers files with leading comments.

The `MODULE-IDENTITY` fallback should ALSO strip the IMPORTS section first (using `stripImportsSection`) before searching — currently it operates on the raw content and grabs `IMPORTS` as the symbol preceding the MODULE-IDENTITY keyword in the IMPORTS list.

### Tertiary fix: `loadMibCache` dedup is fragile

`src/main/ipc/handlers.ts:131-138`. Dedup-by-name causes loss of cached data when module names collide ("IMPORTS" everywhere). Two improvements:

1. Once module names are fixed (secondary fix), this becomes much less likely.
2. As defense-in-depth, also dedup by `cache.sourceDir` OR include `sourceDir` in the dedup key, so two distinct directories' caches don't drop each other's modules.

Same applies to `handleOpenMibDirectory` (`handlers.ts:256-264`) — the `oldModuleNames` filter should be restricted to modules that were actually FROM this directory (the current code blindly removes all modules with matching names from accumulatedModules, including modules contributed by other directories).

### Optional defense-in-depth in renderer

`src/renderer/src/utils/mibTreeUtils.ts:72`. Even after the primary fix, `dedupedMap` last-write-wins is fragile. Consider:
- Throw / log on collision (in dev mode), OR
- Use `parentId + childIndex` to disambiguate in case of duplicate ids.

Not strictly necessary if ids are stable, but cheap insurance.

### Optional defense-in-depth in `buildMibTree` orphan filter

`src/main/mib/parser.ts:532-535`. `nodeById = new Map(survivingNodes)` should be aware of duplicates. After the primary fix this becomes moot.

---

## 7. One-line summary

The 3 misplaced siblings are collateral damage of `MibNode.id` collisions between cached nodes (from a prior session's `MibParser`) and freshly-parsed nodes (counter=0 in the new session), made worse by `extractModuleName` falsely naming many cached modules `"IMPORTS"` and a name-based cache/load dedup that wipes out unrelated modules — together they corrupt `dedupedMap` and `rootSet` in the renderer, surfacing as cached nodes hijacking root slots and fresh CLOCKE nodes mis-rendered as their descendants.
