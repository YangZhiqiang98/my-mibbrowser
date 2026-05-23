# PRD — 多节点 SET 对话框

## 1. 背景与问题
当前 `MibTreePanel.tsx` 中 SET 入口是个**单节点模态**（见 `MibTreePanel.tsx:283-285, 482-540, 799-840`），用户一次只能给一个 OID 写值，且无法：
- 看到表格列已有哪些 instance 后缀；
- 在写之前先 GET 一下当前值做对照；
- 把多个相关的 OID 凑成一次操作。

实际运维场景中（例如改一组接口的 `ifAdminStatus`、批量改 SNMPv3 用户字段）这非常痛。

## 2. 目标用户故事
- **作为 NMS 操作员**，我希望右键 SET 弹出的对话框里能**同时编辑多个节点**，按我期望的顺序一次性下发，看到一份明确的"哪些行成功 / 哪些行失败"的结果。
- **作为对 MIB 结构不熟的人**，我希望对表格列点一下"获取实例"，能看到设备上实际存在的实例后缀，挑一个就行，不用自己猜 `.1` 还是 `.10.100.0.1`。
- **作为想做对照修改的人**，我希望对每一行点一下"获取当前值"就能回填到目标值输入框，再在此基础上改。

## 3. 交互规格

### 3.1 入口
- 树节点右键菜单 `SET`：
  - 若对话框尚未打开：打开对话框，并把该节点作为**第一行**加入。
  - 若对话框已打开：把该节点**追加为新行**；如果同 OID+instance 已存在则给 `appMessage.info('节点已在列表中')`。

### 3.2 对话框布局（Antd `Modal`，width=900）
```
┌─ SET 多节点（共 N 行） ────────────────────────────┐
│ [拖拽提示条] 将左侧树节点拖入此区域可追加          │
├────────────────────────────────────────────────────┤
│  ┃ # ┃ 节点 ┃ OID + Instance ┃ 类型 ┃ 当前值 ┃ 目标值 ┃ 操作 ┃
│  ┃ ⠿ ┃ ...  ┃ .1.3.6...[.1▼] ┃ ...  ┃ ...    ┃ ...    ┃ ...  ┃
│  ┃ ⠿ ┃ ...  ┃                ┃      ┃        ┃        ┃      ┃
├────────────────────────────────────────────────────┤
│                                  [取消]  [执行 SET]│
└────────────────────────────────────────────────────┘
```

#### 列含义
| 列 | 说明 |
| --- | --- |
| `⠿` | 拖拽手柄；按住可在表内上下拖动改顺序（用 `@dnd-kit/sortable`，复用社区轻量库） |
| `#` | 行号，从 1 开始，随排序自动更新 |
| 节点 | 节点名 + syntax 灰字（来自 `MibTreeNodeData`） |
| OID + Instance | 形如 `1.3.6.1.2.1.2.2.1.7` + 紧跟一个 Instance 输入框（默认 `.0`）；右侧有 `🔍 获取实例` 按钮 |
| 类型 | `Select`，候选与现有 `guessSetTypeFromSyntax` 一致，默认按 syntax 推断 |
| 当前值 | 只读文本 + `↻ 获取` 按钮；按钮触发对**完整 OID+instance** 做一次 GET，结果填入此格 |
| 目标值 | `Input`，必填；提供按钮 `← 用当前值` 把当前值原样填入 |
| 操作 | `删除`（图标）；最后一行删除后对话框自动关闭 |

### 3.3 拖拽来源
- 复用 `MibTreePanel` 的拖拽（树节点 `draggable`），对话框区域作为 drop target：
  - 监听 `dragover` 显示高亮；
  - `drop` 时从 `event.dataTransfer.getData('application/x-mib-node-id')` 取节点 id，回到 `mibTree` 中 lookup 节点对象后调用 `addRow(node)`。
  - 若树本身还未实现该 dataTransfer key，则在本任务里**顺带加上**最小改动（只增、不动现有点击/选中逻辑）。

### 3.4 获取实例
- 点击行内 `🔍 获取实例`：
  - 复用 `window.api.snmp.walk(snmpConfig, baseOid)`；
  - 把返回的 `varbinds[].oid` 都剥去 baseOid 前缀，剩下的后缀（例如 `.1`、`.10.0.0.1`）作为下拉选项；
  - 替换该行的 Instance 控件为 `Select`（保留手动输入：`showSearch + allowClear`），选中即更新。
  - 若 walk 返回 0 项：toast `'未发现实例，请手动输入'`。
  - 若 walk 失败：toast 错误并保留原 Input。

### 3.5 获取当前值
- 行级按钮，单独触发：`window.api.snmp.get(snmpConfig, [fullOid])`；
- 成功：把 `varbinds[0].value` 显示在"当前值"列；
- 失败：在该列显示红字 `Err: <短错误>`，并通过 `appMessage.error` 提示一次。
- 行级按钮在请求过程中显示 loading；不影响其它行。

### 3.6 执行 SET
- 校验：所有行 instance 已填写（或可为空，按现有约定 `.0` 自动补）、目标值非空、类型已选。
- 组装 `SnmpSetValue[]`，调用 `window.api.snmp.set(snmpConfig, values)` 一次性提交。
- 成功：复用 `buildResultSession('SET', firstOid, result, mibTree)` 写入 ResultsPanel；toast `'SET succeeded (N varbinds)'`，关闭对话框。
- 失败（任一 varbind 错）：保持对话框打开；toast 显示后端返回的 `error`；ResultsPanel 不改动。
- 全程 `isQuerying = true`，按钮显示 loading。

## 4. 非功能需求
- **类型安全**：所有新组件 props、状态用显式 `interface`；不用 `any`（参见 typescript/coding-style）。
- **不可变更新**：行编辑用 `rows.map`，禁止 `rows[i].xxx = ...`。
- **拆分**：新增 `components/SetMultiNodeDialog/` 目录，按 ≤400 行原则拆 `index.tsx / SetRow.tsx / hooks.ts / types.ts`。
- **测试**：纯函数（如 instance 后缀剥离、行校验）写单元测试；交互流程靠手测覆盖。

## 5. 验收清单
- [ ] 右键 SET 打开新对话框；旧单节点模态被移除（搜索 `setModalNode` 应无残留）。
- [ ] 树节点能拖入对话框追加为行；重复节点提示存在。
- [ ] 行可拖拽排序，行号实时更新。
- [ ] "获取实例"在有表格数据的列上能列出后缀并支持选择。
- [ ] "获取当前值"在单行能拉到当前值。
- [ ] "执行 SET"一次发出，多 varbind 一起到后端；结果落 ResultsPanel。
- [ ] 删除最后一行自动关闭对话框；取消按钮丢弃全部草稿。
- [ ] 长列表（≥20 行）在对话框内有滚动，不撑爆。
