# Task List — 多节点 SET 对话框

> 按顺序推进；每完成一项打勾。

## Phase 1 — 脚手架
- [x] 在 `package.json` 检查 `@dnd-kit/core` + `@dnd-kit/sortable` 是否已存在；缺则 `npm i` 安装。
- [x] 新建 `src/renderer/src/components/SetMultiNodeDialog/` 目录，建立 `index.tsx / SetRow.tsx / useSetRows.ts / rowUtils.ts / types.ts` 空壳。
- [x] `types.ts` 写 `SetRowDraft` 接口。

## Phase 2 — 纯逻辑（先有测试）
- [x] `rowUtils.ts` 实现 `buildFullOid / stripBaseOid / validateRow`。
- [x] 补 `rowUtils.test.ts`。
- [x] `useSetRows.ts` 实现 add/remove/patch/move/moveTo。
- [x] 补 `useSetRows.test.ts`。

## Phase 3 — UI
- [x] `SetRow.tsx`：渲染单行（Instance Input 或 Select、类型 Select、当前值显示、目标值 Input、操作按钮）。
- [x] `index.tsx`：组装 Modal、表格容器、拖拽 drop 区、提交按钮。
- [x] 用 `@dnd-kit/sortable` 包裹行实现拖拽排序。

## Phase 4 — 集成
- [x] `MibTreePanel.tsx` 删除旧 `setModalNode` 相关 state、useEffect、`handleSetConfirm`、Modal JSX。
- [x] 引入新 Dialog；右键菜单 `SET` 改为 `openSetDialog(contextMenuNode)`。
- [x] 在 `MibTreePanel` 的树 `onDragStart` 中通过 Zustand `pendingDragNode` 桥接拖拽节点（antd Tree 未暴露原生 DataTransfer）。

## Phase 5 — 后端交互联调
- [x] 行内 `获取实例` → `window.api.snmp.walk`，剥离后缀填入 `instanceOptions`。
- [x] 行内 `获取当前值` → `window.api.snmp.get`，回填 `currentValue`。
- [x] 提交按钮 → `window.api.snmp.set`，成功后 `buildResultSession('SET', ...)` 走原 ResultsPanel 路径。

## Phase 6 — 验收 & 收尾
- [x] 跑 `npm run typecheck`、`npm run lint`、`npm run build`、`npm test`。
- [ ] 手测清单（来自 prd 的"验收清单"）逐项过一遍并截屏存档到 `.trellis/workspace/yzq/journal-1.md`。
- [ ] 提 commit：`feat(renderer): multi-node SET dialog with drag-and-drop and instance helpers`。
- [ ] 任务 archive。
