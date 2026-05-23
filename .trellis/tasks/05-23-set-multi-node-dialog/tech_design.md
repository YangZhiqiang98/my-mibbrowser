# Tech Design — 多节点 SET 对话框

## 1. 目录与文件
```
src/renderer/src/components/SetMultiNodeDialog/
  index.tsx          # Modal 外壳 + 顶层状态 + 提交
  SetRow.tsx         # 单行（Instance/类型/当前值/目标值/操作）
  useSetRows.ts      # 行集合的不可变操作 (add / remove / move / patch)
  rowUtils.ts        # 纯函数：fullOid 拼接、instance 后缀剥离、校验
  types.ts           # SetRowDraft / SetRowError 等接口
```

`MibTreePanel.tsx`：
- 移除 `setModalNode / setFormValue / setFormType` 三个 useState 与对应 Modal JSX (`PR3 — SET dialog` 注释段)；
- 引入 `useSetDialog()` hook 暴露 `open(node)` / `appendNode(node)`，挂到右键菜单 `onClick`。

## 2. 状态模型
```ts
interface SetRowDraft {
  rowId: string            // uuid，仅前端
  node: MibTreeNodeData    // 来源节点（含 oid、name、syntax）
  instance: string         // 默认 '.0'，可为空字符串
  instanceOptions: string[] | null // null = 未 walk；[] = walk 过但空；非空 = 下拉
  type: string             // SnmpType 字符串，沿用现有 typeMap
  targetValue: string
  currentValue: { state: 'idle' | 'loading' | 'ok' | 'err'; text?: string; error?: string }
}
```
顶层 `rows: SetRowDraft[]`；所有更新都返回新数组（`.map` / `.filter` / `arrayMove`）。

## 3. 拖拽
- **行内排序**：`@dnd-kit/core` + `@dnd-kit/sortable`（轻量、SSR 友好；如项目未装则用 antd `Table` + `react-dnd`，二选一，brainstorm 时再定）。
- **从 MIB 树拖入**：
  - `MibTreePanel` 的 `<Tree draggable />` 已暴露 `onDragStart`；在 handler 里 `e.dataTransfer.setData('application/x-mib-node-id', node.id)`。
  - Dialog 在 `Modal` body 外层包一个 `<div onDragOver onDrop>`，drop 时拿 id → 在 `mibTree` 中查 node → `appendNode(node)`。

## 4. 与后端的契约
**完全复用现有 IPC**，零改动：
- `window.api.snmp.walk(snmpConfig, baseOid)` — 获取实例后缀。
- `window.api.snmp.get(snmpConfig, [fullOid])` — 获取当前值（单 varbind）。
- `window.api.snmp.set(snmpConfig, SnmpSetValue[])` — 多 varbind 原子下发。

后端 `snmpSet` (`src/main/snmp/client.ts:281`) 已经天然接受数组，无需改动。

## 5. 校验规则（rowUtils）
```ts
function buildFullOid(baseOid: string, instance: string): string
// 规则：instance 为空 → 视为 '.0'；自动补 '.'；去重 '..'
function validateRow(row: SetRowDraft): SetRowError | null
// 必填：targetValue 非空；fullOid 形如 \d+(\.\d+)+
```

## 6. 风险与回退
- **拖拽库未安装**：先用 antd `Table` + 上下移动按钮兜底；不挡功能。
- **walk 大表慢**：在按钮上加 loading，给"取消"按钮（abort 控制器可暂缓，先靠后端超时）。
- **替换旧模态后用户找不到入口**：右键菜单文案仍叫 `SET`，标题改为 `SET (1 行)`，单节点体验不退化。

## 7. 测试策略
- 单测：`rowUtils.test.ts` 覆盖 `buildFullOid` 各边界。
- 单测：`useSetRows.test.ts` 覆盖 add/remove/move 的不可变性。
- 手测脚本：写进 `task_list.md` 验收步骤。
