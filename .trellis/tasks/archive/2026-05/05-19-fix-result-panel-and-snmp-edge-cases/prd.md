# fix-result-panel-and-snmp-edge-cases

## Goal

修复 5 个用户报告的问题：(1) column 节点上 GETBULK 改为自动多轮迭代（语义同 BULK_WALK），(2) 操作结果为空时在表格区内显示 empty state + status bar 提示，(3) profile 保存能用但 apply 不上 → 修菜单 click 路径，(4) QueryPanel 默认折叠（保留作为"无 MIB 节点但知道 OID"的入口）并给 MIB 树右键加 SET，(5) 结果表改为动态表头 + 覆盖式 + 列宽可调。

## What I already know

### 代码事实（Session 7 后状态）

- **MIB tree 节点 kind**：`root | module | group | scalar | table | entry | column | notification`
- **当前 SNMP 操作分发**（`src/renderer/src/components/MibTreePanel.tsx::executeSnmpOperation`）：
  - `GET / GETNEXT / WALK / BULK_WALK` 走单 OID（`node.oid`）
  - `GETBULK` 走 `resolveBulkOids(node)`：`table` / `entry` → 取所有 column OID 作为 multi-OID repeaters；其它（含 `column` / `scalar`）→ `[node.oid]` 单 OID
  - **没有 SET 菜单项**（当前 SET 仅由 QueryPanel 提供）
- **WALK / BULK_WALK 在 client.ts 已支持**严格 `.`-边界子树判定 + leading-dot 处理（Session 7 修复）。column 节点上 WALK / BULK_WALK 应已能正确遍历该列所有 instance — 这条归"验证"项。
- **结果数据流**：`appStore.results: ResultRow[]`，操作完成时 `addResults(rows)` 是**追加**。
- **ResultRow shape** (`src/renderer/src/types/index.ts:40-49`)：`{ key, oid, name, value, type, status, timestamp, responseTime }`。
- **`ResultsPanel.tsx`** 当前展示：
  - 顶部操作栏：`Results (N)` 标题 + `Copy / Copy All / CSV / XML / Clear` 5 个按钮 — **保留**（Issue 4 不是动这里）
  - 表格列固定为 `OID / Name / Value / Type / Status / Time` 6 列
- **`QueryPanel.tsx`**：当前结构是 `<h3>SNMP Query</h3>` + `query-form`（OID 输入、Operation 选择、Max Reps、SET Value/Type、Send/Clear）。Issue 4 = 让它折叠起来，默认收起。
- **Profile load / save / delete IPC** 正确，问题在 UI：`Toolbar.tsx:118-129` 菜单项 label 是 `<div>` 内嵌 `<span onClick={handleLoadProfile}>` — AntD v5 Dropdown 的 menu item click 路径依赖 item 级 onClick 或 menu 级 onClick，依赖 span 的 inline onClick 不会触发 → Issue 3 根因。

### 用户表达的明确意图（已澄清）

- Issue 1：column 上 GETBULK = 自动多轮迭代到走出该 column 子树（语义同 BULK_WALK）。table / entry 维持 Session 7 的多列单 PDU。WALK / BULK_WALK on column 已正确，归"验证"。
- Issue 2：结果为空 → 表格区内显示 empty state + status bar 文本提示，**不弹框**。
- Issue 4：QueryPanel 整体**折叠**（默认隐藏，标题区有展开按钮可打开）。MIB 树右键菜单**新增 SET 项**，点击弹框填 value/type。
- Issue 5：
  - 表头动态：基于该次操作的实际结果，按 MIB 树 longest-prefix 匹配把 OID 拆成 `<column-node-oid>.<instance>`。匹配不到时用 OID 末段做列名，前缀做列。
  - 列名带类型（如 `ifDescr (OCTET STRING)`），表头去掉 timestamp 和 status。
  - 表格 rows = unique instances，cells = (instance, column) 对应的 value。
  - 覆盖式：**点操作那一刻立刻 clearResults + isQuerying=true**；响应回来后写入。
  - 列宽可调（antd Table column `resize` 能力，不是 panel 高度调）。

## Requirements (final)

### R1. Column GETBULK 自动迭代（client.ts + MibTreePanel.tsx）

- 新增 `snmpBulkGetIterative(config, rootOid, maxRepetitions)` 或复用 `snmpBulkWalk` 的迭代逻辑暴露成"column 上的 GETBULK 行为"。最简洁的实现：MibTreePanel `executeSnmpOperation` 的 GETBULK 分支增加 column / scalar 判定 — `kind === 'column'` → 调 `window.api.snmp.bulkWalk(...)`（复用已有 IPC），其它单 OID kind 维持单次 getBulk。
- WALK / BULK_WALK 不动。

### R2. 空结果 UI（ResultsPanel + statusMessage）

- 操作完成 `result.success && result.varbinds.length === 0` 时：
  - `setResults([])`（已是覆盖语义）
  - `setStatusMessage('<Operation>: 0 result(s), Xms')` 并在 status bar 附加 "本次操作结果为空" 标识
  - 表格区域 antd Table 自带的 empty placeholder 改为自定义文案：`本次 SNMP 操作没有返回任何数据` + 上次操作类型/OID
- 不弹 message / Modal。

### R3. Profile apply 修复（Toolbar.tsx）

- 改 `profileMenuItems`：把 `handleLoadProfile` 提升到 item 级 `onClick`，或用 `<Dropdown menu={{ items, onClick: ({ key }) => ... }}>`。
- 删除按钮单独保留 inner click + `stopPropagation`。

### R4. QueryPanel 折叠 + MIB 树右键 SET

- QueryPanel：包一层 antd `Collapse` 或自管 `useState(collapsed=true)`，默认折叠。展开后内容不变（OID 输入、Operation 选择、Send/Clear、Max Reps、SET fields）。折叠时只显示一行标题 + 展开按钮。
- MibTreePanel contextMenuItems 增加 `SET` 子项：点击后弹 antd Modal（form 含 Value Type 下拉 + Value 输入框）→ 调 `window.api.snmp.set(config, [{ oid, value, type }])` → 结果合入 ResultsPanel。
- SET 操作菜单项的 `disabled` 条件：`!hasOid || node.access === 'not-accessible'`（按 MIB 节点 access 字段判定，避免对只读 / 不可写节点弹框）。

### R5. 动态表头结果表（ResultsPanel + appStore + types）

- `ResultRow` 不再是表格主数据结构；引入新的形态：
  ```ts
  interface ResultSession {
    operation: SnmpOperation
    rootOid: string                          // 用户触发的根 OID
    timestamp: number
    responseTime: number
    rows: Array<{
      instance: string                       // 该 row 的 instance 后缀（拆分自 OID）
      cells: Record<string, ResultCell>      // key = column key (MIB node oid 或 OID prefix)
    }>
    columns: Array<{
      key: string                            // column key
      name: string                           // 显示名 (MIB 名 / OID 末段)
      type: string                           // SNMP type tag, 用于表头
      oidPrefix: string                      // 用于排序 / 调试
    }>
  }
  interface ResultCell {
    value: string
    rawType: string
    isError: boolean
  }
  ```
- `appStore`：`results: ResultRow[]` 改为 `currentResult: ResultSession | null`。`addResults` 改为 `setResult(session)`。`clearResults` 改为 `setResult(null)`。
- 表头生成算法：
  1. 对每条 varbind，调 `resolveOidToColumn(varbind.oid, mibTree)`：返回 `{ columnKey, columnName, instance, type }`
     - 在 mibTree 里做 longest-prefix 匹配。匹配到的节点 OID 作为 column key + columnName=node.name。
     - 没匹配到的：column key = OID 去掉最后一段，columnName=去掉的部分 / fallback。
  2. 同一 columnKey 的 varbinds 聚到一列；同一 instance 的 varbinds 聚到一行。
  3. 列按首次出现顺序排；行按 instance 字典 / 数值排序。
- 表格：antd `<Table>` 列动态生成：`[{ title: 'Instance', dataIndex: 'instance' }, ...columns.map(c => ({ title: `${c.name} (${c.type})`, dataIndex: c.key }))]`。
- 列宽可调：antd Table 5.x 支持 `resizable`（或通过 `react-resizable`）。MVP 用 `column.resizable` + 简单 onResize 持久化到组件本地 state。
- 覆盖式：QueryPanel `handleSend` 和 MibTreePanel `executeSnmpOperation` 在调底层 API 前立即 `setResult(null)` 并 `setIsQuerying(true)`；响应后 `setResult(session)` 或保留 null + status 文案。
- 导出 / Copy：CSV / XML / Copy / Copy All 适配新数据结构（同 columns 顺序输出）。

## Acceptance Criteria

- [ ] AC1：MIB 树右键 GETBULK on column 节点，得到该列所有 instance（最少 14 行 for rcIfDsCrossConnectEntry's 任一 column）。
- [ ] AC2：MIB 树右键 WALK / BULK_WALK on column 节点，得到该列所有 instance。
- [ ] AC3：对空表 / 不可达 OID 执行任意操作，结果区显示自定义 empty 文案 + status bar 显示 "0 result(s)" 文本；无弹框。
- [ ] AC4：保存一个 profile 后，从 Toolbar 的 Profiles 下拉选中它 → host / port / version / community / v3 字段全部恢复到该 profile 的值。
- [ ] AC5：QueryPanel 默认折叠状态，标题区有展开按钮，展开后所有原字段可用，可正常发起 SNMP 操作。
- [ ] AC6：MIB 树节点右键有 SET 项；任意节点都可点（不按 access 限制），点击后弹框填 value + 选 type → 点确定下发 SET，结果合到 ResultsPanel；设备拒绝时显示错误。
- [ ] AC7：WALK / BULK_WALK on rcIfDsCrossConnectEntry → ResultsPanel 表头为 `Instance | col1 (type) | col2 (type) | ...`，行 = 14 个 instance；timestamp 和 status 列不出现。
- [ ] AC8：再次执行任意 SNMP 操作 → 旧表格立刻消失（点击瞬间清空），loading 完成后展示新数据；不与旧数据混合。
- [ ] AC9：拖动 ResultsPanel 表格列分隔线 → 列宽可调；拖动表头位置 → 列顺序可改；两者均在 session 内生效（不需要持久到磁盘）。
- [ ] AC10：响应中含 noSuchObject / noSuchInstance / endOfMibView 的 varbind 仍展示在动态表对应 (instance, column) 格，value 列以红色 tag 标记该错误名。

## Definition of Done

- 类型 + lint + typecheck 全绿
- 5 个 issue 在 dev 模式实测通过用户基准场景（`rcIfDsCrossConnectEntry` 表 / 单 column / scalar / 空表 / 配 profile 切换 / SET 一个 read-write OID）
- 不破坏 Session 7 的 SNMP walk subtree 不变量（spec/backend/snmp-guidelines.md）

## Out of Scope

- 结果多 tab / 历史保留：当前是覆盖式
- Profile 字段在 v3 模式下的完整恢复（authProtocol / privProtocol 等）→ 走当前 `setSnmpConfig` 的浅合并，不重写 store 设计
- SET 操作的批量 / 多 OID（一次只对当前选中节点 SET）
- 列宽持久化到磁盘 / 重启后保留（MVP 仅 session 内）

## Technical Approach

- **底层 SNMP**：复用 Session 7 修好的 `snmpBulkWalk`；column GETBULK 在 renderer 层把意图映射到 `bulkWalk` IPC，不新建 main 进程端点。
- **状态层**：`appStore` 把 `results` 重构为 `currentResult: ResultSession | null` + `setResult`。
- **解析层**：`resolveOidToColumn(varbindOid, mibTree)` 新 helper 放 `src/renderer/src/utils/resultColumns.ts`。
- **UI 层**：
  - QueryPanel 套 antd Collapse 默认 collapsed
  - MibTreePanel contextMenuItems 加 SET，新增 SET Modal 组件
  - ResultsPanel 重写为基于 `currentResult` 渲染动态 columns / dataSource，CSV/XML/Copy 适配
  - Empty state 使用 antd Table 自带 locale.emptyText slot
- **列宽 resize**：antd `Table` + `components.header.cell` 包一层 react-resizable，单文件实现，不引第三方除非必要

## Decision (ADR-lite)

**Context**：结果展示需要从静态 6 列改为动态列，触发覆盖式刷新。多个独立 UX 改进同期处理。

**Decision**：
- 数据结构改为 ResultSession，不再用 ResultRow[]
- column GETBULK 复用 bulkWalk，不新增 IPC
- profile apply 走 menu-level onClick，不再依赖 inner span
- QueryPanel 折叠不删除，保留 OID 直查能力
- SET 走右键菜单 + Modal

**Consequences**：
- ResultRow 类型废弃（或者保留旧字段做向后兼容），CSV/XML 导出格式被动调整为列名带类型
- QueryPanel `handleSend` 的覆盖式 setResult 触发逻辑要和 MibTreePanel `executeSnmpOperation` 保持一致 → 抽个共享 helper
- SET 菜单项的 enable 条件依赖 access 字段，对 access 为空 / unknown 的节点要做兜底（默认 enable）

## Technical Notes

- `oidInSubtree` / `stripLeadingDot` / `flattenBulkVarbinds` / `resolveBulkOids` 已是稳态，复用而非重写
- AntD 版本 v5（`App.useApp` + `Dropdown menu={{ items }}` API 已在用）
- Spec reference：`.trellis/spec/backend/snmp-guidelines.md`、`.trellis/spec/frontend/mib-tree-snmp-ops.md`、`.trellis/spec/frontend/component-guidelines.md`、`.trellis/spec/frontend/state-management.md`

## Resolved Questions

- **Q1（Issue 1, 2026-05-19）**：column 上 GETBULK → 自动多轮迭代（= BULK_WALK 等价语义）
- **Q2（Issue 2, 2026-05-19）**：空结果 → 表格内 empty state + status bar，不弹框
- **Q3（Issue 4 scope, 2026-05-19）**：QueryPanel 折叠（默认隐藏，可展开）+ MIB 树右键加 SET
- **Q4（Issue 4 SET, 2026-05-19）**：右键 SET 弹框填值
- **Q5（Issue 5 timing, 2026-05-19）**：点击操作即 clearResults
- **Q6（Issue 5 unknown OID, 2026-05-19）**：OID 末段做列名，前缀做列 key
- **Q7（Expansion error varbinds, 2026-05-19）**：noSuchObject / noSuchInstance / endOfMibView 仍进动态表，value 列以 tag 标记错误
- **Q8（Expansion SET access, 2026-05-19）**：SET 菜单项总是可点（不按 MIB access 限制），设备返回错误时提示
- **Q9（Expansion table UX, 2026-05-19）**：MVP 包含列宽可调 + 列顺序拖动（无表格高度调）

## Open Questions

- 无剩余 blocking 问题，等待用户最终确认

## Implementation Plan (small PRs)

- PR1（Issue 1 + Issue 3）：低风险点修
  - column GETBULK 在 MibTreePanel.executeSnmpOperation 走 bulkWalk
  - Toolbar profileMenuItems 改成 menu item-level onClick / dropdown-level onClick
  - 这两个是单文件 / 短改动，独立验证
- PR2（Issue 5 数据流重构）：核心
  - 新增 `resolveOidToColumn` helper
  - appStore：`results` → `currentResult`，导出 `setResult` action
  - ResultsPanel 重写为动态列
  - QueryPanel.handleSend / MibTreePanel.executeSnmpOperation 统一改用 setResult，点击瞬间 setResult(null) + isQuerying=true
  - CSV/XML/Copy 适配
  - antd Table resizable column 接入
- PR3（Issue 2 + Issue 4）：UX polish
  - 空结果 empty state + status bar 文案
  - QueryPanel collapsed 包装
  - MIB 树右键 SET 菜单 + SET Modal 组件
