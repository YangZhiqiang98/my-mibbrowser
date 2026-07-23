# Port correctness fixes from legacy project (SNMP SET/WALK/filter/parser/XML)

## Goal

把旧项目（D:\learn\my-mibbrowser）两轮修复中、新项目尚未解决的正确性 bug，按新项目的重构后架构重新落地。旧项目按 commit/diff 无法合并（独立 git 历史 + 大幅重构），因此逐项语义移植。

## Context / 来源

- 旧项目已修复并归档 14 项高/中/低严重度 bug（两个 commit：high-severity SNMP 组、medium/low 组）。
- 三个对比 agent 已核对旧修复 × 新项目现状（带 file:line 佐证）。约 40% 新项目已自行解决或不适用。
- 本任务只移植"新项目仍有 bug"的部分。

## 新项目已解决 / 不适用（不在本任务范围）

- WALK 部分结果：流式架构原生保留（`client.ts:761` onProgress + `streamingResultBatcher`，失败分支不清空 currentResult）。
- 表格高度自适应：`ResultsPanel`（虚拟滚动）+ `TableViewer/TableViewerContent.tsx:171` 均 ResizeObserver。
- antd `destroyOnClose`→`destroyOnHidden`：已迁移（`MibTreePanel.tsx:878`）。
- legacy store 死代码（results/addResult/ResultRow）：新架构不存在。
- 空 OCTET STRING 真实场景：空 Buffer→`formatBytes`→`''` 已正确（残留仅纯 `{}` 防御 guard，列为可选）。
- GETNEXT 空表症状：新 UI 已移除 GETNEXT 操作（但过滤代码路径仍错，见 PR2）。

## Requirements（按 PR 分组）

### PR1 — 低风险 helper 移植 + 清理（几乎零架构风险）

- **R1 SET 数值转换**：移植旧 `setValues.ts` 到 `src/main/snmp/setValues.ts`；重写 `client.ts` snmpSet（新 ~`:568` 的 `.map`）——转换/校验后再 `createSession`，非法输入早返回友好错误（不开 socket）。typeMap 已存在于 `client.ts:555`。
- **R2 XML sanitize + CSV BOM/公式**：移植旧 `exporters.ts` 到 `src/main/ipc/exporters.ts`；`handlers.ts` handleExportCsv(`:1008`)/handleExportXml(`:1045`) 改用 `buildCsv`/`buildXml`；删新项目内联 `escapeXml`(`:1076`) 改用模块导出。修 `handlers.ts:1066` 用 raw header 当 XML 标签名。
- **R3 密码加密**：移植旧 `profileCrypto.ts` 到 `src/main/ipc/profileCrypto.ts`；`handlers.ts` handleSaveProfile(`:951` encrypt)/handleLoadProfiles(`:978` decrypt) 接入；给持久化记录 + `ConnectionProfile`（`snmp/types.ts:129`）加 `encrypted` 字段；`safeStorage` 不可用静默降级、旧明文向后兼容。
- **R4 HEX UTF-8 字节**：`ResultsPanel.tsx:369` 与 `TableViewer/TableViewerContent.tsx:706` 两处 `toHexDisplay` 的 `charCodeAt` 改 `TextEncoder().encode`；抽到共享 util 避免第三份拷贝。
- **R5 伪造 OID**：删 `mibTreeUtils.ts:54-68` 的 `${parentOid}.${childIndex+1}` fallback，未解析节点保持空 OID。
- **R6 死代码 mib:search**：删 preload(`:29`)、handlers(`:313` 注册 + `:679` handler)、types(`:34`) 整链。
- **R7（可选）空对象 guard**：`resultColumns.ts:141` + `tableSession.ts:269` 补空对象→`''`。

### PR2 — 结果过滤 + 符号名解析（新架构最关键正确性）

- **R8 结果过滤**：`resultColumns.ts` buildResultSession(`:220`) 重新引入 `options.filterToSubtree`（默认关）；仅 `MibTreePanel` 表/entry fan-out（`:553`）开启。**新项目更严重**：多节点 SET 工具窗多行 GET/SET（`SetToolWindowContent.tsx:209/266`）当前把不在 `oids[0]` 子树的行全丢——务必覆盖。QueryPanel 手动 GETBULK 关闭过滤。
- **R9 符号名 OID 解析**：移植旧 `resolveNameToOid.ts` 到 `utils/`；接入 `QueryPanel.handleSend`（`:50` 分词后解析）+ 不可解析 warn+abort。`mibTreeIndex` 只做搜索、无 name→OID。

### PR3 — 流式 WALK 守卫 + parser（最需贴合新架构，独立可回退）

- **R10 WALK 终止守卫**：`client.ts` snmpWalk/snmpBulkWalk 加 (a) `compareOids` 单调递增守卫（跨回调记 `lastPushedOid`）、(b) `WALK_MAX_ROWS` 行上限、(c) v1 `NoSuchName` 视为正常结束（`isNoSuchNameEnd`）；`SnmpResult`（`types.ts`）加 `warning?`，在各 `finish()` 处合并。新项目已有 session 防泄漏（`finish()`/`settled`），保留。compareOids 放新 `src/main/snmp/oid.ts` 或就近。**不得破坏 abort/streaming 语义。**
- **R11 parser 同模块冲突 + 多段 OID**（捆绑，同 `parser.ts` 区域）：加 `resolveParent` + 预算 `(module,name)`/`name` 索引，两处父查找（first pass `:871`、second pass `:915`）优先同模块；`parseOidDef`(`:782`) 正则改 `^(\S+)((?:\s+\d+)+)$` 返回 `childNumbers[]`，调用点（`:889/:932`）spread。

## Acceptance Criteria

- [ ] SET INTEGER 输入 `42` 发合法请求；`abc` 友好报错不崩。
- [ ] XML 导出可被标准解析器打开（无空格/方括号标签）；CSV 有 BOM 且 `=1+1` 被中和。
- [ ] 保存 profile 密码为密文（safeStorage 可用时）；旧明文仍可加载。
- [ ] 多节点 SET 工具窗多行 GET/SET 不再丢行（R8 回归）。
- [ ] `sysDescr.0` 在 QueryPanel 可解析执行；不可解析时提示。
- [ ] 不递增 OID 的 walk 终止（compareOids 单测）；v1 walk 到尽头正常结束。
- [ ] 跨模块同名父节点各自挂对；`::= { enterprises 1 2 }` 解析正确。
- [ ] HEX 对中文显示正确 UTF-8 字节（两处）。
- [ ] 每个 PR 后 typecheck / lint / test 绿；新增纯逻辑有 co-located 测试。

## Definition of Done

- 触及纯函数有 co-located `*.test.ts`（新项目约定）；typecheck / lint / vitest 绿；分 PR 提交。

## Out of Scope

- 新项目已解决/不适用项（见上）。
- 旧项目"树上单 SET 补 .0"：新项目是多节点 SET（`rowUtils.ts buildFullOid`），需**单独确认** scalar 是否补 `.0`——列为验证项，非直接移植。
- antd 静态 `message`→`App.useApp()`：新项目仅 MibTreePanel 有此差异且是有意选择、非正确性 bug，可选低优先。
- 新增功能（trap/工具窗口等）不动。

## Technical Notes

- 测试约定：新项目用 **co-located `*.test.ts`**（非旧项目的 `tests/` 目录）。已有 vitest + `"test": "vitest run"`。
- 旧项目 helper 源码可直接参考 D:\learn\my-mibbrowser 对应文件（setValues/exporters/profileCrypto/resolveNameToOid/oid）。
- 遵守新项目 spec：snmp-guidelines（OID 段边界）、error-handling（IPC 不抛、返回 result）、mib-tree-snmp-ops、state-management、type-safety。
- 顺序：PR1（低风险）→ PR2（过滤+解析）→ PR3（walk+parser）。每 PR 独立提交、独立验证。
