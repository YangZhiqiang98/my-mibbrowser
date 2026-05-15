# Bugfix: SNMP Session + MIB Tree UI Issues

## Goal

修复 5 个阻塞性 bug，让应用能正常使用 SNMP 通信和 MIB 树浏览。

## Bug List

### Bug 1 (CRITICAL): SNMP 请求未实际发送
- **现象**: 发送 SNMP 请求报 `RequestTimedOutError`，抓包确认没有 UDP 包发出
- **根因**: `src/main/snmp/client.ts:111` — `snmp.createSession(config.host, config.community, options)` API 调用方式错误。net-snmp npm 包的 `createSession` 签名是 `createSession(target, community, options)` 其中 target 格式应为 `host:port`
- **修复**: 将 host 和 port 组合为 target 字符串 `config.host + ':' + config.port`

### Bug 2 (HIGH): 缺少测试连接功能
- **现象**: 没有"测试连接"按钮，无法验证设备是否可达
- **修复**: 在 Toolbar 添加"Test"按钮，执行 SNMP GET sysDescr.0 (1.3.6.1.2.1.1.1.0) 验证连通性，显示成功/失败

### Bug 3 (HIGH): 导入的 MIB 文件 OID 显示为空
- **现象**: 导入自定义 .my 文件后，树中节点 OID 为空
- **根因**: `parseOidDef()` 只处理 `parentName childNumber` 格式，但实际 MIB 文件的 `::=` 后面可能是多级路径如 `::= { iso(1) org(3) dod(6) internet(1) mgmt(2) mib-2(1) 1 }` 或 `::= { system 1 }`（system 不在 nodeMap 中）
- **修复**: 增强 OID 解析：(1) 支持多级 OID 定义直接构建路径 (2) 对于找不到父节点的，尝试用已知的 OID 前缀匹配

### Bug 4 (MEDIUM): 左侧 MIB 树面板不可调节宽度
- **现象**: 左侧面板固定宽度，无法拖拽调节
- **修复**: 将左侧面板改为可拖拽分栏（使用 CSS resize 或简单的拖拽分隔条）

### Bug 5 (MEDIUM): MIB 节点无右键菜单
- **现象**: 右键点击 MIB 节点没有操作菜单
- **修复**: 添加右键菜单，支持：Copy OID、Copy Name、Set as Query OID、Expand All、Collapse All

## Acceptance Criteria

- [ ] SNMP GET 请求能实际发送 UDP 包并获得响应
- [ ] 点击"Test"按钮能测试设备连通性并显示结果
- [ ] 导入标准 MIB 文件（如 RFC1213-MIB）后所有节点有正确的 OID
- [ ] 左侧面板可拖拽调节宽度
- [ ] 右键点击 MIB 节点弹出操作菜单

## Out of Scope

- 查询历史记录
- MIB 内置仓库
- 多语言支持

## Technical Notes

- SNMP session bug 在 `src/main/snmp/client.ts:67-117` 的 `createSession` 函数
- MIB OID 解析在 `src/main/mib/parser.ts:463-478` 的 `parseOidDef` 函数
- 左侧面板样式在 `src/renderer/src/styles.css`
- 右键菜单使用 Ant Design 的 Dropdown 组件
