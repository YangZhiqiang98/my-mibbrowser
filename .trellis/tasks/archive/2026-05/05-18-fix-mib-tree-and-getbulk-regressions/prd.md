# Fix MIB Tree Corruption + GETBULK Empty Results (Regressions)

## Goal

修复两个之前"已修但实际仍存在"的回归 bug：(1) 增量加载 MIB 时左侧树结构错乱；(2) GETBULK 操作的结果展示为空。两者都在前序任务的修复中遗留了根因未触及。

## What I already know

### Bug 1: 增量加载 MIB 时左侧树混乱 —— ID 冲突

`MibParser` 使用单例（`handlers.ts:12`）。`parseFiles()` / `parseFileContents()` 在每次调用都执行 `this.nodeIdCounter = 0`（`parser.ts:30, 60`）。

加载流程：

- 第一次 `parseFiles(['A.mib'])` → 产生 `node-1, node-2, ...`，存入 `accumulatedModules`
- 第二次 `parseDirectory('dir/')` / `parseFileContents(...)` → 计数器归零，新产生的节点也是 `node-1, node-2, ...`
- `accumulatedModules` 现在含两批同 id 不同对象的 `MibNode`
- `buildMibTree(accumulatedModules)` → `nodeMap`（按 name 索引）正确，但所有节点的 `children`/`parentId` 数组里以 string id 引用对象
- renderer `buildTreeFromNodes` 的 `dedupedMap = new Map(dedupedNodes.map(n => [n.id, n]))` 后入者覆盖前者（`mibTreeUtils.ts:72`）
- 结果：父节点的 children 数组里 `"node-1"` 被错误地映射到第二批的同 id 节点 → 树结构错位/重复/缺失

之前的去重 + 孤儿过滤修复假设 id 唯一，因此治标不治本。

### Bug 2: GETBULK 空结果 —— net-snmp varbinds 嵌套数组未展平

`net-snmp` 的 `session.getBulk(oids, nonRepeaters, maxRepetitions, cb)` 回调中 `varbinds` 是 hybrid shape：

- 索引 `[0..nonRepeaters-1]`：单个 varbind 对象
- 索引 `[nonRepeaters..length-1]`：**子数组**，每个元素是该 repeater OID 的多次 bulk 结果

当前 `client.ts:230` 与 `client.ts:396` 直接 `varbinds.map(vb => formatVarbindValue(vb))`，把子数组当成 varbind 对象处理：

- `vb.oid / vb.type / vb.value` 全是 `undefined`
- `formatVarbindValue` 返回 `{ oid: undefined, type: 'Unknown(undefined)', value: null }`
- 渲染到表格就是空行

`snmpBulkWalk`（`client.ts:373-439`）走同一份 callback，存在同样问题。

## Requirements

1. **ID 全局唯一**：`MibParser` 实例生命周期内，所有 `parseFiles` / `parseFileContents` 产生的节点 id 都不冲突。重置计数器的行为必须移除。
2. **snmpGetBulk 正确展平**：按 net-snmp 协议规范，把 `[0..nonRepeaters-1]` 区段和 `[nonRepeaters..]` 区段的嵌套数组合并成扁平 varbind 列表，再走 `formatVarbindValue`。
3. **snmpBulkWalk 同步修复**：同样的展平逻辑应用到 `snmpBulkWalk` 的 callback。
4. **不改 IPC / 不改 UI 接口形态**：renderer 拿到的依然是 `SnmpResult { varbinds: SnmpVarbind[] }`。

## Acceptance Criteria

- [ ] 连续加载两批 MIB 后（先 Files 再 Directory，或两次 drag-and-drop），左侧树没有重复节点、没有错位的父子关系
- [ ] 重启 app 多次加载缓存后，nodeId 也无冲突（验证 `loadMibCache` 路径）
- [ ] GETBULK 单 OID 默认参数（maxReps=10, nonRepeaters=0）能返回多行非空数据（OID/type/value 都正确）
- [ ] BULK_WALK 也能返回完整非空数据
- [ ] GETBULK 在 nonRepeaters > 0 时，前 N 个非重复 OID 也正确展示
- [ ] typecheck + lint 通过

## Definition of Done

- typecheck + lint 通过
- 上面 AC 全部手动验证（用真实 SNMP 设备或模拟器）
- 不引入对其他 SNMP 操作（GET/GETNEXT/SET/WALK）的回归

## Out of Scope

- 重写 MibParser（只动 id 生成策略）
- 改 IPC 接口形态
- 引入新的 MIB 缓存版本（CACHE_VERSION 不动）
- 任何 UI 层面的改动

## Technical Approach

### Fix 1: Stable ID counter

`src/main/mib/parser.ts`：

- 移除 `parseFiles()` 中的 `this.nodeIdCounter = 0`（line 30）
- 移除 `parseFileContents()` 中的 `this.nodeIdCounter = 0`（line 61）
- 保留构造时初始化为 0
- `this.modules = []`、`this.errors = []`、`this.warnings = []` 可以继续重置（这些不跨调用累积）

这样每次解析都从上一次的计数器继续递增，id 永远唯一。

### Fix 2: Flatten getBulk varbinds

`src/main/snmp/client.ts`：

在 `snmpGetBulk` 与 `snmpBulkWalk` 的 callback 里，先展平再走 `formatVarbindValue`：

```ts
function flattenBulkVarbinds(raw: unknown[], nonRepeaters: number): RawVb[] {
  const out: RawVb[] = []
  for (let i = 0; i < raw.length; i++) {
    if (i < nonRepeaters) {
      if (raw[i]) out.push(raw[i] as RawVb)
    } else {
      const item = raw[i]
      if (Array.isArray(item)) out.push(...(item as RawVb[]))
      else if (item) out.push(item as RawVb)
    }
  }
  return out
}
```

- `snmpGetBulk`：调用 `flattenBulkVarbinds(varbinds, nonRepeaters)` 后再 map
- `snmpBulkWalk`：`nonRepeaters` 固定为 0（实现里 `session.getBulk([rootOid], 0, maxRepetitions, callback)`），所以 `flattenBulkVarbinds(varbinds, 0)`
- BULK_WALK 的"超出 rootOid 范围则终止"循环逻辑保留，只是数据源换成展平后的列表

## Decision (ADR-lite)

**Context**：两个回归 bug 都是先前修复未触及到底层。

**Decision**：

- 用最小改动方案：parser 不再重置 id 计数器；snmp client 在 getBulk/bulkWalk 展平响应。
- 不引入 schema 校验或防御性检测。

**Consequences**：

- 后续如果用户清空 MibParser 实例（重启应用），id 从 0 重开，行为符合预期。
- net-snmp 未来若改 API 形态，本展平逻辑仍兼容嵌套和扁平两种输入（`Array.isArray` 检查会自动处理）。

## Technical Notes

- 关键文件：
  - `src/main/mib/parser.ts` — Bug 1 改动点
  - `src/main/snmp/client.ts` — Bug 2 改动点（`snmpGetBulk`、`snmpBulkWalk` 两个函数）
- 相关历史任务：
  - `archive/2026-05/05-15-mib-tree-dedup-and-cache-location` — 假设 id 唯一做了去重；本次修根因后该假设才真正成立
  - `archive/2026-05/05-15-left-panel-mib-tree-optimization` — 走渲染端 OID 回溯；本次不动它
  - `archive/2026-05/05-15-bugfix-snmp-session-and-mib-tree-ui-issues` — SNMP session 创建已正确，GETBULK 是新发现的链路
## Addendum (2026-05-18 followup)

第一次实现完成后用户测试发现两个新问题（仍属同根因家族，scope 扩入）：

### Issue 3: 缓存恢复后 renderer 不展示

`loadMibCache()` 在主进程启动时被调用（`index.ts:47`），后端 `mibNodes`/`accumulatedModules` 已正确恢复。但 renderer 启动时 `appStore.mibTree: []`，且 `MibTreePanel` 没有 `useEffect` 在 mount 时调 `window.api.mib.getTree()`，导致缓存的数据永远不被渲染。

**Fix**：renderer 启动时主动 `getTree()`，非空则写入 store；同时还原 `loadedModules`（可从节点的 `module` 字段聚合得出）。

### Issue 4: 部分子节点渲染为 root（缩进错位）

复现：加载 `E:\RC\MIB\SLT8400\ADD\*.my` 后，`raisecomClockEObjects` 下的部分子节点（`raisecomClockEDeviceMaster`、`raisecomClockESSMEnable`、`raisecomClockESrcStatusTable`）出现在树的最左列（root 级别），而其余兄弟节点正常缩进。

可疑路径（trellis-research 待确认）：
1. `parser.ts parseMultiSegmentOidDef` 分支若 multi-segment OID 解析成功但**找不到 parent 节点**，节点会有 oid 但 `parentId = null`；第二轮迭代只处理 `oid.length === 0` 的节点，会跳过这些。
2. dedup 合并时（`parser.ts:480-499`），父节点出现两次时 children 合并 + redirect 可能漏掉某些 child 引用。
3. renderer `buildTreeFromNodes` root 判定（`mibTreeUtils.ts:74-80`）：`parentId` 非空但 `dedupedMap` 找不到该 id 时，节点变 root。

**Fix**：根据 research 结论修 parser / mibTreeUtils。

### 新 Acceptance Criteria（追加）

- [ ] 重启 app 后，之前加载的 MIB 自动出现在左侧树（不需再次手动 Files/Directory）
- [ ] 加载 `E:\RC\MIB\SLT8400\ADD\*.my` 后，`raisecomClockEObjects` 的所有子节点（包括 raisecomClockEDeviceMaster、raisecomClockESSMEnable、raisecomClockESrcStatusTable）都正确显示在该父节点下，无任何节点错位到 root

