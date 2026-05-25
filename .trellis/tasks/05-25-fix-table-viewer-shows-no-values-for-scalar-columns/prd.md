# Fix: Table Viewer 不显示可读列的结果值

## Goal

在 MIB 树上对 entry 节点（例如 `1.3.6.1.4.1.8886.15.1.4.1.1.1.1`）右键 "Table Viewer" 时，表格能正确显示所有可读数据列的取值；而不是当前的"0 rows / 0 columns / No table rows loaded"。

## What I already know

- 入口路径：右键 → `MibTreePanel.tsx:468 openTableViewer` → 打开独立工具窗口 → 渲染 `TableViewerContent`。
- 工具窗口启动后立刻 `bulkWalk(entryNode.oid)`（成功）→ `buildTableSession(target, varbinds)`。
- `target` 由 `src/renderer/src/utils/tableSession.ts:68 resolveTableTarget` 生成：
  - entry 分支只筛选 `child.kind === 'column' && !!child.oid` 作为表列。
- `src/main/mib/parser.ts:556 determineKind` 的判定：
  - `SEQUENCE OF` → `'table'`
  - 有 `INDEX` 或 `SEQUENCE` → `'entry'`
  - `not-accessible` 且非 SEQUENCE → `'column'`
  - 其他（含 `read-only` / `read-write` / `read-create`）→ `'scalar'`
- 因此真正可读的列（绝大多数 MIB 的数据列）在树里 kind 都是 `'scalar'`；只有 INDEX 这类不可访问列才是 `'column'`。
- `resolveTableTarget` 用 `kind === 'column'` 过滤后，columns 几乎总是空（或只剩 INDEX），`buildTableSession` 内 `columns.find` 全部 miss，varbind 被丢弃 → 表格空。

## Root cause（一句话）

`resolveTableTarget` 对"表列"的定义只认 `kind === 'column'`，但实际 MIB 解析里数据列被 `determineKind` 归为 `'scalar'`，导致表列集合丢失。

## Requirements

- 在 entry / table 节点上打开 Table Viewer 时，必须把 entry 下所有「真正的表列」识别为列，包括 `read-only` / `read-write` / `read-create` 的可读列。
- 不破坏：
  - 在普通 group 下的标量（`scalar`）继续不应该被当成"表列"展示；这些节点根本不会进入 Table Viewer 路径（菜单项已经禁用非 table/entry 节点）。
  - INDEX 列（kind `'column'`）应继续被识别（用于行键 / instance 解析时不丢列）。
  - 现有的 Edit / SET / 列可见性 / 复制 / 导出 行为不退化。

## Acceptance Criteria

- [ ] 对一个真实的 entry 节点（例如用户给出的 `1.3.6.1.4.1.8886.15.1.4.1.1.1.1`，或测试用例里的 `baseEntry`），打开 Table Viewer 能看到 entry 下所有 `read-*` 列作为列头，且每行 cell 渲染出 walk 返回的值。
- [ ] entry 下的 INDEX 列依然出现在 `target.columns` 里（如果它们带 OID）。
- [ ] 在非 entry / table 节点上 Table Viewer 菜单仍然禁用，行为不变。
- [ ] 在 entry / table 节点上右键 GETBULK，`resolveBulkOids` 返回 entry 下所有 read-* 列的 OID（而不是回退到 entry 自身 OID）。
- [ ] `resolveTableTarget` 单元测试覆盖：纯 `scalar` 子节点的 entry → columns 非空；混合 `column + scalar` 的 entry → 二者都收入；无 OID 的子节点不被收入。
- [ ] `buildTableSession` 单元测试覆盖：scalar 列的 varbinds 能匹配到列并形成行。
- [ ] `resolveBulkOids` 单元测试覆盖：entry / table 节点下混合列时返回所有 read-* 列的 OID。

## Definition of Done

- 单元测试通过（vitest）。
- `npm run typecheck` / `npm run lint` 绿。
- 手工在用户给的 entry 节点上验证 Table Viewer 显示出值。
- prd.md / implement.jsonl / check.jsonl 与最终实现一致。

## Out of Scope

- 不改 MIB 解析器 `determineKind` 的 kind 体系（除非选定方案 B —— 已放弃）。
- 不修 `MibTreePanel.tsx:369` 的「单列 GETBULK = BULK_WALK」分支（同根因，另起任务）。
- 不重构 Table Viewer 的 UI / 列可见性 / 编辑流程。
- 不优化 INDEX 列在 Table Viewer 中显示为空列的 UX 问题。
- 不处理跨 module 引用 / TC 解析等其它已知问题。
- 不处理 entry OID 本身被识别错误的场景（如有，单独建任务）。

## Decision (ADR-lite)

**Context**: Table Viewer 在 entry 节点上打开时显示 0 行 0 列。根因是 `tableSession.ts` 与 `MibTreePanel.tsx` 都按 `kind === 'column'` 过滤 entry 子节点，但 MIB 解析器 `determineKind` 把所有 `access != not-accessible` 的列归为 `'scalar'`，于是真正的可读数据列被过滤掉。

**Decision**: 采用 Approach A —— 在 Table Viewer / GETBULK fan-out 这两处的子节点过滤里，把 `'scalar'` 与 `'column'` 并列视作表列。抽一个 `isTableColumnChild(node)` helper 防止逻辑漂移。MVP 范围 = Table Viewer + `resolveBulkOids`，不动 parser。

**Consequences**:
- 最小改动覆盖了同根因的两条用户路径（Table Viewer 显值 + entry 上 GETBULK 多列 fan-out）。
- INDEX 列（`kind: 'column'`、不可访问）仍会列在 Table Viewer 列头里但数据为空 —— 沿用现状，留作后续 UX 优化。
- `MibTreePanel.tsx:369` 的「单列 GETBULK = BULK_WALK」判断仍然只认 `kind === 'column'`，存在同根因的潜在退化；不在本次范围。
- 未真正修复 `determineKind` 的 kind 语义错位 —— 是已知技术债，未来任何按 `kind === 'column'` 过滤的新代码都可能再踩坑。

## Technical Approach

**已选定 Approach A**：在 entry / table 的子节点过滤里，同时接受 `kind === 'column'` 和 `kind === 'scalar'` 且 `!!oid` 作为表列。

修复范围（MVP）：

1. `src/renderer/src/utils/tableSession.ts`
   - `resolveTableTarget` 的 `table` 分支（行 72）
   - `resolveTableTarget` 的 `entry` 分支（行 77）
2. `src/renderer/src/components/MibTreePanel.tsx`
   - `resolveBulkOids` 的 `table` 分支（行 970）
   - `resolveBulkOids` 的 `entry` 分支（行 976）

不在本次范围：

- `MibTreePanel.tsx:369` 的「单列 GETBULK = BULK_WALK」判断（kind === 'column'），属同根因但语义独立，另起任务。
- parser `determineKind` 体系不动（Approach B 的方向放弃）。
- INDEX 列在 Table Viewer 里仍显示为列头但数据为空 —— UX 优化留作后续。

为避免在四处重复同一段过滤逻辑，抽一个内部 helper（不导出 / 或导出 `isTableColumnChild`）：

```ts
const isTableColumnChild = (node: MibTreeNodeData): boolean =>
  (node.kind === 'column' || node.kind === 'scalar') && !!node.oid
```

放在 `tableSession.ts`，从 `MibTreePanel.tsx` import 使用，保证两处定义不会再次漂移。

## Open Decision — 修复点选择

### Approach A: 调整 `resolveTableTarget` 的过滤条件（Recommended）

- 做法：在 entry / table 的子节点过滤里，把 `'scalar'` 与 `'column'` 并列视作表列。
  ```ts
  const columns = entry.children.filter(
    (child) => (child.kind === 'column' || child.kind === 'scalar') && !!child.oid
  )
  ```
- Pros:
  - 改动最小、影响面只限 Table Viewer 这一条链路。
  - 语义合理：只要是 entry 的直接子节点（带 OID），它在 SMI 语义上就是该表的列，与 access 无关。
  - 单测好写，回归风险低。
- Cons:
  - 没修复"kind 语义不准"这个底层问题；其他地方如果也按 `kind === 'column'` 筛子节点会有同类 bug（目前 grep 未发现）。

### Approach B: 修 parser `determineKind` 让 entry 子节点统一为 `'column'`

- 做法：解析建树阶段（或建树后 walk 一遍），凡是 entry 节点的直接子（带 OID）一律覆写 kind 为 `'column'`。
- Pros:
  - 从源头矫正 kind 语义，所有下游消费者（不止 Table Viewer）都受益。
- Cons:
  - 改动面广，可能影响树渲染图标（`MibTreePanel.tsx:921` 区分了 column / scalar 的 icon）、Search 行为、SET Multi Node Dialog 等。
  - 现有测试快照 / 行为依赖 scalar 标签，需要全量回归。
  - 风险与收益不成比例，对当前 bug 是过度修复。

### Approach C: 干脆放弃 kind 过滤

- 做法：`resolveTableTarget` 只过滤 `!!child.oid`，把所有有 OID 的直接子都当列。
- Pros: 实现最短。
- Cons: 没有任何防御，未来 entry 下若混进 notification / group 这类异常节点会被错误纳入；语义不清。

### 我的推荐

**Approach A**。它精准修掉这个 bug、零跨模块风险、语义自洽，并且容易加测试。

## Research References

（本任务不需要外部研究，纯本地代码 + SMI 表语义就足够。）

## Technical Notes

- 受影响文件：
  - `src/renderer/src/utils/tableSession.ts`（`resolveTableTarget`，可能扩展 `buildTableSession` 行为不变）
  - `src/renderer/src/utils/tableSession.test.ts`（**新增**，目前没有）
- 解析器侧不动：`src/main/mib/parser.ts:556`。
- 相关现有测试：`src/main/mib/parser.test.ts` 已确认 `baseStatus`(read-write) / `baseFlags`(read-only) 在解析后是 scalar，本任务测试可复用同款 fixture。
