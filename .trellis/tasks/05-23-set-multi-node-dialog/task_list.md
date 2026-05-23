# Task List — 多节点 SET 对话框

> 按顺序推进；每完成一项打勾。

## Phase 1 — 脚手架
- [ ] 在 `package.json` 检查 `@dnd-kit/core` + `@dnd-kit/sortable` 是否已存在；缺则 `npm i` 安装。
- [ ] 新建 `src/renderer/src/components/SetMultiNodeDialog/` 目录，建立 `index.tsx / SetRow.tsx / useSetRows.ts / rowUtils.ts / types.ts` 空壳。
- [ ] `types.ts` 写 `SetRowDraft` 接口。

## Phase 2 — 纯逻辑（先有测试）
- [ ] `rowUtils.ts` 实现 `buildFullOid / stripBaseOid / validateRow`，配套 `rowUtils.test.ts`。
- [ ] `useSetRows.ts` 实现 add/remove/patch/move，配套 `useSetRows.test.ts`（用 `@testing-library/react-hooks` 或 `act`）。

## Phase 3 — UI
- [ ] `SetRow.tsx`：渲染单行（Instance Input 或 Select、类型 Select、当前值显示、目标值 Input、操作按钮）。
- [ ] `index.tsx`：组装 Modal、表格容器、拖拽 drop 区、提交按钮。
- [ ] 用 `@dnd-kit/sortable` 包裹行实现拖拽排序。

## Phase 4 — 集成
- [ ] `MibTreePanel.tsx` 删除旧 `setModalNode` 相关 state、useEffect、`handleSetConfirm`、Modal JSX。
- [ ] 引入新 Dialog；右键菜单 `SET` 改为 `openSetDialog(contextMenuNode)`。
- [ ] 在 `MibTreePanel` 的树 `onDragStart` 中写入 `dataTransfer.setData('application/x-mib-node-id', node.id)`（保留现有逻辑不动）。

## Phase 5 — 后端交互联调
- [ ] 行内 `获取实例` → `window.api.snmp.walk`，剥离后缀填入 `instanceOptions`。
- [ ] 行内 `获取当前值` → `window.api.snmp.get`，回填 `currentValue`。
- [ ] 提交按钮 → `window.api.snmp.set`，成功后 `buildResultSession('SET', ...)` 走原 ResultsPanel 路径。

## Phase 6 — 验收 & 收尾
- [ ] 跑 `npm run typecheck`、`npm run lint`。
- [ ] 手测清单（来自 prd 的"验收清单"）逐项过一遍并截屏存档到 `.trellis/workspace/yzq/journal-1.md`。
- [ ] 提 commit：`feat(renderer): multi-node SET dialog with drag-and-drop and instance helpers`。
- [ ] 任务 archive。
