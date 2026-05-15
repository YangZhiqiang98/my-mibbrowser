# MIB 树完整构建 + SNMP 操作 UI 打通

## Goal

让 MIB Browser 桌面应用能够端到端运行：加载 .my MIB 文件 → 完整构建 MIB 树（含 OID 解析和父子关系）→ 选中节点发送 SNMP 请求 → 结果展示。当前代码骨架已搭建，但 MIB 树构建不完整（只处理标准根节点），需要补全核心路径。

## What I already know

### 已完成（代码已存在）

- **MIB Parser** (`src/main/mib/parser.ts`): SMIv1/v2 解析，能提取 OBJECT-TYPE、OBJECT-IDENTITY、NOTIFICATION-TYPE
- **SNMP Client** (`src/main/snmp/client.ts`): 完整实现 GET/GETNEXT/GETBULK/SET/WALK/BULKWALK，支持 v1/v2c/v3
- **IPC Handlers** (`src/main/ipc/handlers.ts`): 完整的 mib/snmp/profile/export 四组通道
- **Preload Bridge** (`src/preload/index.ts`): 类型完整的 contextBridge API
- **Zustand Store** (`src/renderer/src/stores/appStore.ts`): 完整状态 + actions
- **Toolbar**: Host/Port/Version/Community/v3配置/Profile保存加载 ✅
- **QueryPanel**: OID输入/操作选择/SET值输入/Enter发送 ✅
- **ResultsPanel**: 表格展示/HEX切换/复制/CSV导出/XML导出 ✅
- **StatusBar**: 连接状态/主机信息/结果计数 ✅
- **MibTreePanel**: 加载文件/目录/搜索/选中节点/详情展示 ✅

### 关键缺陷

1. **MIB 树 OID 构建不完整** — `buildRelationships()` 在 `src/main/mib/parser.ts:421-445` 只硬编码了标准根节点关系（iso→org→dod→internet→...），解析出的 MIB 节点的 OID 字段为空数组 `[]`，`oidString` 为空字符串，无法构建完整的父子树
2. **OID 解析缺失** — `parseObjectTypes()` 提取了 `::= { parent child }` 定义（match[3]），但没有解析为 OID 数字路径，也没有建立解析节点与父节点的关联
3. **拖放文件未真正实现** — MibTreePanel 的 handleDrop 只显示提示信息（第114行），没有通过 IPC 传递文件路径给主进程
4. **MIB 节点 OID 未解析** — parser 提取的节点 `oid: []` 和 `oidString: ''` 始终为空

## Assumptions (temporary)

- MIB 文件的 `::= { parent childNumber }` 语法是建立 OID 路径的标准方式
- 需要支持跨模块引用（如 IF-MIB 中节点引用 SNMPv2-TC 的类型）
- 标准根节点结构 (iso.org.dod.internet...) 可以硬编码

## Open Questions

1. ~~MIB 模块依赖解析策略~~ → **已决定：按需容错**（见 Decision）
2. ~~OID 符号名解析~~ → **已决定：MVP 包含**，用 MIB 树反查 OID 前缀匹配符号名

## Requirements (evolving)

### 核心：MIB 树完整构建

- 解析 `::= { parentName childNumber }` 为完整 OID 数字路径
- 建立解析节点的父子关系（基于 parentName 查找父节点）
- 支持 `::= { enterprises 1234 }` 等跨模块引用（通过节点名查找全局 nodeMap）
- 支持多次加载 MIB 文件，增量合并到现有树
- 处理循环引用和缺失父节点的容错

### 补全：拖放文件加载

- 将拖放的文件路径通过 IPC 传递给主进程解析
- 与"Open Files"按钮走相同的解析逻辑

### 可选：OID 符号名解析

- 查询结果的 OID 转换为 `nodeName.0` 格式显示（依赖 MIB 树数据）

## Acceptance Criteria (evolving)

- [ ] 加载 RFC1213-MIB.my 后，能在 MIB 树中看到完整的 `iso.org.dod.internet.mgmt.mib-2.system` 子树
- [ ] 每个解析出的 MIB 节点都有正确的 `oidString`（如 `1.3.6.1.2.1.1.1`）
- [ ] 选中一个 scalar 节点后，QueryPanel 自动填入 OID，点击 Send 能返回结果
- [ ] 选中一个 table 节点后，执行 WALK 能遍历整张表
- [ ] 拖放 .my 文件到 MIB 树面板能正确加载
- [ ] 多次加载不同 MIB 文件不会覆盖之前已加载的树

## Definition of Done

- MIB 树构建逻辑可单元测试
- TypeScript 类型检查通过
- 应用能启动并完成完整的 加载MIB → 选节点 → 发SNMP请求 → 看结果 流程
- 无 console.log 遗留

## Out of Scope (explicit)

- MIB 文件自动下载/内置标准 MIB 仓库
- MIB 模块 IMPORTS 的严格验证
- 查询历史记录功能
- SNMP Trap 接收
- 多窗口支持

## Decision (ADR-lite)

**Context**: MIB 文件存在跨模块 IMPORTS 依赖，加载顺序不确定
**Decision**: 按需容错 — 不强制依赖顺序，解析时遇到未知父节点名则暂时跳过该节点的 OID 构建。用户后续加载缺失 MIB 文件时，通过全局 nodeMap 重试未解析的节点
**Consequences**: 首次加载可能不完整，但用户体验好（不报错不阻塞）。增量加载自然补全

## Technical Notes

- 关键文件：`src/main/mib/parser.ts` — `buildRelationships()` 和 `parseObjectTypes()` 需要重写 OID 解析逻辑
- OID 定义语法参考：`sysDescr OBJECT-TYPE ... ::= { system 1 }` → 解析为 parent=system, child=1
- 当前 `nodeMap` 以节点名为 key，足以支持 `::= { parentName childNum }` 查找
- 标准根节点 OID 已硬编码在 `createStandardRootNodes()` 中
