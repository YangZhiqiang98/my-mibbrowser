# 优化 GET 操作：移除右键 GETNEXT 菜单并支持选择 instance

## Goal

清理 MIB 树右键菜单和顶部查询面板里的 GETNEXT 入口；为右键 GET 增加 instance 选择对话框，让 GET 体验与已有的 SET 多节点对话框对齐。底层 SNMP `getNext` IPC 保留（WALK 内部依赖它）。

## What I already know

**代码勘察结论**：
- 右键菜单 GETNEXT 项：`src/renderer/src/components/MibTreePanel.tsx:416-421`
- 顶部查询面板 GETNEXT 下拉项 + case 分支：`src/renderer/src/components/QueryPanel.tsx:65-66, 180`
- 当前 GET 调用：`MibTreePanel.tsx:330-332`，直接传 `node.oid`，无 instance 拼接 → 对 scalar/column agent 回 `noSuchInstance`
- SET dialog 已实现 walk 实例 + 下拉选择：`SetMultiNodeDialog/SetRow.tsx`、`rowUtils.ts:buildFullOid`、`useSetRows.ts`
- 底层 IPC：`src/preload/index.ts:25`、`src/main/snmp/client.ts:202+` 中 `getNext` 被 WALK 实现依赖，不能删
- `SnmpOperation` 类型：`src/main/snmp/types.ts:24` 保留 `'GETNEXT'`（IPC 仍可用）

## Decisions (locked through brainstorm)

| # | Topic | Decision |
|---|---|---|
| D1 | GETNEXT 清理范围 | **两处 UI 入口都清**：MibTreePanel 右键菜单 + QueryPanel 顶部下拉。底层 IPC 保留。 |
| D2 | GET instance UX 形态 | **轻量弹层 — 单节点 Modal**（PR2 已实现）。**D6 演进**为多节点。 |
| D3 | Modal 内交互 | **对齐 SET**：默认 instance='0' 的 Input + 旁边一个 "API/获取实例" 按钮（walk 后下拉可选）。 |
| D4 | Modal 关闭时机 | **发请求后保持打开**。用户可改 instance 再次点 "执行 GET"，结果区刷新。 |
| D5 | ~~"转为 SET" 快捷按钮~~ | **已撤回**（用户决定 GET 只负责 GET，不和 SET 流程交叉）。PR3 中加入的按钮 + onConvertToSet prop 在 PR4 中一并删除。 |
| D6 | Multi-node GET | **演进 GetSingleNodeDialog 为 GetMultiNodeDialog**：仿 SetMultiNodeDialog 的多行结构 + 拖拽追加 + 行级 walk / 删除 / 排序。不保留单节点版本。 |
| D7 | Multi-node GET 执行语义 | **原子多 OID GET**：一次 `window.api.snmp.get(config, [fullOid₁, fullOid₂, …])`，结果写主结果区。Modal 保持打开。 |

## Requirements

- [R1] 移除 MIB 树右键菜单中的 "GETNEXT" 项及对应 onClick；删除 `SwapOutlined` 导入（如该图标未被其他菜单项使用）。
- [R2] 移除 QueryPanel Operation 下拉中的 `{ label: 'GETNEXT', value: 'GETNEXT' }` 选项及 switch 中的 `case 'GETNEXT'` 分支。
- [R3] `executeSnmpOperation` 类型联合中可以保留 `'GETNEXT'`（被 WALK 内部经 IPC 间接走），但 UI 不再触达该分支；本任务**不要求**把类型联合也改窄，避免连带改动。
- [R4] 新增右键 GET 流程：点击右键菜单的 "GET" → 弹出 `GetSingleNodeDialog`（或同等组件名）。
- [R5] Dialog 内容：
   - 显示节点名称（用 Tag 或文字）+ 节点的 OID（只读）+ syntax/kind 提示
   - Instance 输入框，默认值 `'0'`
   - "获取实例" 按钮（图标按钮，仿 SetRow 那个 `ApiOutlined`），点击后对 `node.oid` 做 walk，结果作为下拉选项（仿 SetRow.instanceOptions 模式）
   - 底部按钮：取消 / 执行 GET
- [R6] 点击 "执行 GET" 后：
   - 用 `buildFullOid(node.oid, instance)` 拼出完整 OID
   - 调用同样的结果路径（确保结果区行为一致），把结果写入主结果区
   - **Modal 保持打开**，用户可改 instance 再次发请求；GET 成功后，把刚拿到的值缓存在 Modal 内部 state，给后续 "转为 SET" 用作 targetValue 预填
- [R7] Walk 失败 / 返回 0 实例时：
   - 失败 → `appMessage.error(...)` 提示
   - 0 实例 → `appMessage.info('未发现实例，请手动输入')`，仍保持 Input 形态
- [R8] 复用 `SetMultiNodeDialog/rowUtils.ts` 的 `buildFullOid` 和 `stripBaseOid`（不要重复实现）。
- [R9] Modal 底部新增 "转为 SET" 按钮：
   - 仅在已经成功 GET 至少一次（缓存了 currentValue）时启用，否则 disabled + Tooltip 提示 "请先执行 GET"
   - 点击后：
     1. 关闭 GET Modal
     2. 打开 SetMultiNodeDialog，第一行预填：node = 当前节点；instance = 当前 instance；targetValue = 刚拿到的值
   - 需要扩展 SetMultiNodeDialog 的 props 接受一个携带 `instance` / `targetValue` 的种子（而非现在的 `initialNode: MibTreeNodeData`）—— 设计 see Technical Approach
- [R10] QueryPanel 删除 GETNEXT 选项后，若用户当前 `queryOperation` state 为 `'GETNEXT'`（历史持久化或上次会话），自动 fallback 到 `'GET'`

### 追加（D6/D7）— Multi-node GET 演进

- [R11] 把 `GetSingleNodeDialog/` 重命名 / 重写为 `GetMultiNodeDialog/`，结构对齐 `SetMultiNodeDialog/`（types.ts / rowUtils.ts / useGetRows.ts / GetRow.tsx / index.tsx 同一目录）。
- [R12] `GetRowDraft` 仅包含 GET 所需字段：`rowId / node / instance / instanceOptions`。**不包含** `targetValue` / `currentValue`（这是 SET 的关注点；GET 的结果直接进主结果区表格）。
- [R13] Modal 顶部有一个拖拽 drop zone：用户从 MIB 树拖任意节点进来即追加为新行，复用 appStore 的 `pendingDragNode` 桥接机制（与 SetMultiNodeDialog 完全相同）。
- [R14] 每行 UI：行号 / 节点名 + syntax / instance 控件 + "获取实例" walk 按钮 / 上移 / 下移 / 删除（参照 SetRow 但删除"目标值"列和"获取当前值"按钮）。
- [R15] 底部 "执行 GET" 按钮：将所有行的 `buildFullOid(node.oid, instance)` 合并为 OID 列表，调用 `window.api.snmp.get(config, oids)` 一次取回所有 varbinds，写入 `currentResult` via `buildResultSession`。**Modal 保持打开** 以便用户调整后再次发起。
- [R16] **删除 PR3 引入的 "转为 SET" 按钮 + `onConvertToSet` prop + MibTreePanel `handleConvertToSet`**。`SetSeed` 类型保留（无副作用，未来仍可能用到）。

## Acceptance Criteria

- [ ] 右键 MIB 树任意节点，菜单中不再有 "GETNEXT" 项
- [ ] 顶部 QueryPanel 的 Operation 下拉中不再有 "GETNEXT" 选项；若历史 `queryOperation === 'GETNEXT'`，启动后自动落到 `'GET'`
- [ ] 右键 scalar 节点 → 点 GET → 弹出 Modal，instance 默认 `0` → 点"执行 GET" → 实际请求 OID 为 `<node.oid>.0`，结果区显示该值；**Modal 保持打开**
- [ ] 右键 column 节点 → 点 GET → 弹出 Modal → 点"获取实例" → 拉到的实例后缀填入下拉 → 选某个 → 点"执行 GET" → 结果区显示该实例的值
- [ ] 在 Modal 已经成功 GET 过一次后，点击"转为 SET" → GET Modal 关闭 → SetMultiNodeDialog 打开 → 第一行 instance 与 targetValue 已预填为刚才 GET 用的 instance 与拿到的值
- [ ] "转为 SET" 在未做过 GET 时是 disabled，Tooltip 提示"请先执行 GET"
- [ ] Walk 失败 / 返回 0 实例时有清晰提示，不会卡在 loading 状态
- [ ] 取消 / Esc → Modal 关闭，无副作用，不发请求
- [ ] TypeScript / ESLint / Vite 构建通过；没有引入未使用的 import
- [ ] 不影响其他操作（WALK / BULK_WALK / GETBULK / SET）的现有体验

### 追加 AC（Multi-node GET）

- [ ] 右键 GET → 打开 `GetMultiNodeDialog`，第一行预填为右键节点（instance 默认 `'0'`）
- [ ] 从 MIB 树拖另一个节点进 Dialog 顶部 drop zone → 追加为新行；重复节点（同 node.id + 同 instance）给出 `appMessage.info`，不重复加
- [ ] 行级 walk / 删除 / 上移 / 下移 正确工作
- [ ] 点击 "执行 GET" → 一次 `window.api.snmp.get(config, [oid₁.inst₁, oid₂.inst₂, …])` → 主结果区表格展示所有 varbinds → Modal 仍保持打开
- [ ] Dialog 中不存在 "转为 SET" 按钮（PR3 的撤回到位）

## Definition of Done

- 类型检查、Lint、Build 均通过
- 手工验证：scalar + column 两种节点各跑一遍 GET 流程
- 旧的 GETNEXT 入口在两个面板都不再可见
- commit 描述清楚移除 / 新增的入口

## Out of Scope

- 选实例后自动 GET（用户需要主动点 "执行 GET" 按钮触发，与"保持打开 + 多次发"语义更契合）
- 把 `executeSnmpOperation` 的类型联合从 `'GETNEXT'` 中移除 —— 与底层 IPC 强耦合，避免连带改动
- 底层 IPC `getNext` 的删除或弃用警告
- 改动 `SnmpOperation` 在 backend 的 type 定义
- QueryPanel 主查询区点 "GET" 时是否也加 instance 选择 —— 该入口由用户在输入框手动写完整 OID，本任务不动
- GET → SET 联动 / "转为 SET" 按钮（D5 撤回；GET 只负责 GET）
- 多节点 GET 的 abort 能力（abort 整体走独立任务）

## Technical Approach

**新组件**：`src/renderer/src/components/GetSingleNodeDialog/index.tsx`（独立目录，便于将来扩展为 multi-node 版本）。

**组件 props**：
```typescript
interface GetSingleNodeDialogProps {
  initialNode: MibTreeNodeData | null  // null = 关闭；non-null = 打开
  onClose: () => void
  onConvertToSet: (seed: SetSeed) => void  // 父级负责打开 SET dialog
}

interface SetSeed {
  node: MibTreeNodeData
  instance: string
  targetValue: string
}
```

**内部状态**：
- `instance: string`（默认 `'0'`，节点变化时重置）
- `instanceOptions: string[] | null`
- `walkLoading: boolean`
- `getLoading: boolean`
- `lastGet: { instance: string; text: string } | null`（成功 GET 后缓存，给 "转为 SET" 用；任何 instance 变更后清空）

**复用**：
- `buildFullOid` / `stripBaseOid` 来自 `SetMultiNodeDialog/rowUtils.ts`
- 同样使用 `App.useApp().message`、`buildResultSession`、appStore 的 `setResult`/`setIsQuerying`/...
- 直接调 `window.api.snmp.get(snmpConfig, [fullOid])` 即可（不一定要重用 `executeSnmpOperation`，避免给那个函数加一个 fullOidOverride 参数把签名搞复杂）

**MibTreePanel 改动**：
- 移除 GETNEXT 菜单项 + `SwapOutlined` import
- 新增 `getDialogSeed` state + `openGetDialog(node)` callback；右键菜单 GET 改成 `openGetDialog(contextMenuNode)` 而非直接 `executeSnmpOperation`
- 渲染 `<GetSingleNodeDialog initialNode={getDialogSeed} onClose={...} onConvertToSet={handleConvertToSet} />`
- `handleConvertToSet(seed)` 把 seed 写入 SetMultiNodeDialog 的种子 state，同时清空 getDialogSeed

**SetMultiNodeDialog 扩展**：
- props 从 `initialNode: MibTreeNodeData | null` 扩展为 `initialSeed: SetSeed | MibTreeNodeData | null`（保持兼容 —— 拿到 MibTreeNodeData 时走老的"默认 instance='0'/targetValue=''"逻辑；拿到 SetSeed 时按预填）
- 或者更干净的：换成 `initialSeed: SetSeed | null`，调用方负责构造 SetSeed（哪怕 instance='0' / targetValue=''）
- 倾向后者（更显式）。MibTreePanel 在右键 SET 时也按 `{ node, instance: '0', targetValue: '' }` 构造 seed
- `useSetRows.append(node)` 暂不动；新增内部 `appendWithSeed(seed)` 或在 useEffect 里 patch 第一行 instance/targetValue

**QueryPanel 改动**：
- 删 Operation 下拉中的 GETNEXT option
- 删 switch 中的 `case 'GETNEXT'` 分支
- 启动后 effect 检测一次：`if (queryOperation === 'GETNEXT') setQueryOperation('GET')`

## Decision (ADR-lite)

**Context**: GETNEXT 单步操作对普通用户价值低（WALK / BULKWALK 是更常用的遍历方式），且当前右键 GET 直接传 `node.oid` 没有 instance 拼接导致大多场景失败。

**Decision**: 
1. 移除两处 UI 中的 GETNEXT 入口；底层 IPC 保留不动
2. 右键 GET 改为弹出轻量单节点 Modal，让用户选择 / 输入 instance 后再发请求
3. Modal 交互对齐 SET 的实例发现 + 选择模式

**Consequences**: 
- ✅ 用户的 GET 操作不再因为忘了加 `.0` 而失败
- ✅ UX 与 SET 一致，学习成本低
- ✅ 改动局部，不动底层 SNMP 客户端
- ⚠️ 比"右键 GET 立刻出结果"多了一步 Modal —— 如果用户高频 GET scalar，多一次回车的代价，可接受
- ⚠️ 复用了 `SetMultiNodeDialog/rowUtils.ts` 的 pure functions —— 未来如果 rowUtils 大改可能影响 GET dialog，需要在 commit / 注释中标注

## Research References

无需外部研究（纯 UI 决策；模式已在 SET dialog 验证）。

## Technical Notes

- 可考虑后续把 `buildFullOid` / `stripBaseOid` 从 `SetMultiNodeDialog/rowUtils.ts` 提到 `src/renderer/src/utils/oid.ts`，让 GET / SET / 任何未来需要的地方共用 —— 但**本任务先内部 import 一下**，提升的事拆到独立 refactor PR 里做。
- Modal 应当使用 `App.useApp().message`（v6 推荐方式），跟 SetMultiNodeDialog 保持一致。
- 注意 `pendingDragNode` 是 SET dialog 专用的拖拽桥接，GET dialog 本任务**不支持**拖拽追加节点（单节点），所以这块 store 字段不动。
