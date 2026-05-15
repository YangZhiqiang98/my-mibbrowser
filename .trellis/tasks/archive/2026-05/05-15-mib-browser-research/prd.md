# brainstorm: MIB Browser 桌面应用

## Goal

开发一个类似 MGSOFT MIB Browser Professional 的桌面应用，支持 SNMPv1/v2/v3 协议配置、加载 .my MIB 文件、展示 MIB 节点树、下发 SNMP 请求（GET/GETNEXT/SET/WALK 等操作）。

## What I already know

- 参考工具：MGSOFT MIB Browser Professional
- 核心功能：SNMP 协议支持、MIB 文件解析、MIB 节点展示、SNMP 请求操作
- 这是一个全新的项目（当前仓库为空）
- MGSOFT 核心功能：
  - SNMP 操作：GET、GETNEXT、GETBULK、SET、WALK、Bulk Walk
  - MIB 处理：内置编译器、SMIv1/v2 支持、依赖解析、批量加载
  - 界面：三面板布局（MIB 树 + 查询面板 + 结果表格）
  - SNMPv3：USM 认证（MD5/SHA-512）、加密（DES/AES-256）
  - 结果展示：符号名称解析、十六进制/ASCII 切换、导出 CSV/XML

## Assumptions (temporary)

- 需要跨平台桌面应用（Windows/macOS/Linux）
- 需要图形界面展示 MIB 树结构
- 需要支持 SNMPv1、SNMPv2c、SNMPv3 三个版本
- 需要解析标准 SMIv1/SMIv2 格式的 .my MIB 文件

## Open Questions

- 技术栈选择：Electron + Web / Tauri / Qt / Java Swing / Python Tkinter？
- SNMP 库选择：net-snmp / pysnmp / snmpjs / 其他？
- MIB 解析方案：使用现有库还是自行实现？
- 目标平台：跨平台还是特定平台？
- 界面风格：参考 MGSOFT 的经典布局还是现代化设计？

## Requirements (evolving)

- 支持 SNMPv1/v2c/v3 协议配置
- 加载和解析 .my 格式的 MIB 文件（**核心功能，必须优先实现**）
  - 文件对话框选择单个/多个文件
  - 拖放文件到窗口加载
  - MIB 搜索目录配置
  - 内置标准 MIB 仓库（RFC MIBs）
  - 启动时自动加载配置的 MIB 文件
  - MIB 编译错误报告（行号、错误类型）
- 以树形结构展示 MIB 节点
- 查看 MIB 节点详细信息（类型、访问权限、描述、OID 等）
- 支持 SNMP 操作：GET、GETNEXT、GETBULK、SET、WALK、Bulk Walk
- 支持 SNMPv3 的认证和加密（USM）
  - 安全级别：noAuthNoPriv / authNoPriv / authPriv
  - 认证协议：MD5、SHA-1
  - 加密协议：DES、AES-128
- 保存和加载连接配置
- 导出查询结果（CSV/XML）
- OID 搜索功能
- 查询历史记录
- **界面布局：经典三面板设计**
  - 左侧：MIB 树面板（树形结构、节点图标、右键菜单）
  - 右上：查询面板（OID 输入、操作类型、SNMP 配置）
  - 右下：结果表格（OID、值、类型、状态）
  - 顶部：工具栏（Host、Port、Community/User 配置）
  - 底部：状态栏（连接状态、请求统计）
- **结果展示：完整格式化**
  - 符号名称解析（sysDescr.0）
  - IP 地址格式化
  - TimeTicks 时间格式化
  - 十六进制/ASCII 切换（OCTET STRING）
  - 枚举值显示（INTEGER）
  - 导出 CSV/XML

## Acceptance Criteria (evolving)

- [ ] 能加载 .my 格式的 MIB 文件并解析所有节点定义
- [ ] 能以树形结构展示 MIB 层次，支持展开/折叠
- [ ] 能查看 MIB 节点详细信息（类型、访问权限、描述、OID）
- [ ] 能成功连接 SNMP 设备并获取数据
- [ ] 能执行各种 SNMP 操作（GET/GETNEXT/GETBULK/SET/WALK/Bulk Walk）
- [ ] 支持 SNMPv3 的安全配置（USM 认证和加密）
- [ ] 能保存和加载连接配置
- [ ] 能导出查询结果为 CSV/XML
- [ ] 能通过名称或 OID 搜索 MIB 节点

## Definition of Done

- 代码结构清晰，模块划分合理
- 核心功能可用，能完成基本的 SNMP 操作流程
- 错误处理完善，网络异常时有友好提示
- 有基本的使用文档
- 所有 SNMP 操作（GET/GETNEXT/GETBULK/SET/WALK/Bulk Walk）正常工作
- MIB 文件加载和解析功能完整
- SNMPv3 安全配置正常工作

## Out of Scope (explicit)

- SNMP Trap 接收功能（MVP 阶段不实现）
- 网络发现功能
- 批量设备管理
- 性能监控和告警
- SNMPv3 SHA-2 系列认证（SHA-256/384/512）
- SNMPv3 AES-192/256 加密
- 多用户管理功能

## Technical Notes

- 空项目，无现有约束
- 需要选择桌面技术栈、SNMP 库、MIB 解析方案
- 参考 MGSOFT 的三面板布局设计

## Research References

- [`research/mgsoft-features.md`](research/mgsoft-features.md) — MGSOFT 功能特性：三面板布局、SNMPv3 USM、MIB 编译器
- [`research/desktop-tech-stacks.md`](research/desktop-tech-stacks.md) — 桌面技术栈对比：Electron vs Tauri vs Qt vs JavaFX vs .NET
- [`research/snmp-libraries.md`](research/snmp-libraries.md) — SNMP 库对比：net-snmp (npm) vs pysnmp vs snmp2 (Rust)
- [`research/mib-parsing.md`](research/mib-parsing.md) — MIB 解析方案：pysmi vs mib-parser vs net-snmp 内置

## Research Notes

### What similar tools do

- MGSOFT MIB Browser：经典三面板布局，Windows 原生，商业软件
- iReasoning MIB Browser：类似功能，跨平台 Java 实现
- Paessler SNMP Tester：轻量级命令行工具

### Constraints from our repo/project

- 空项目，无现有约束
- 需要跨平台支持（Windows/macOS/Linux）

### Feasible approaches here

**Approach A: Electron + React + TypeScript** (Selected ✓)

- 前端：React + TypeScript + Ant Design
- 后端：Node.js + net-snmp (npm)
- MIB 解析：net-snmp 内置或 mib-parser
- 优点：开发效率高、生态丰富、跨平台优秀
- 缺点：包体积大（~100MB）、内存占用高

## Decision (ADR-lite)

**Context**: 需要选择桌面应用技术栈开发 MIB Browser
**Decision**: 采用 Electron + React + TypeScript 方案
**Consequences**:
- 开发效率高，npm 生态丰富
- 包体积较大（~100MB），但对于工具类应用可接受
- 可直接使用 net-snmp 库，SNMPv3 支持完善
