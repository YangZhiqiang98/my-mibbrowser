# Research: MGSOFT MIB Browser Professional 功能特性

- **Query**: 研究 MGSOFT MIB Browser Professional 的功能特性
- **Scope**: external (基于训练数据知识，原始官网 mgsoft.com 已下线)
- **Date**: 2026-05-15

## 概述

MGSOFT MIB Browser Professional 是由斯洛文尼亚 MGSOFT d.o.o. 公司开发的专业 SNMP 管理工具，是业界最知名的 MIB Browser 之一。该工具为 Windows 平台原生应用，用于浏览 MIB 树、发送 SNMP 请求、接收 Trap、编译 MIB 文件等网络管理任务。

---

## 1. 核心功能列表

### SNMP 操作类型

| 操作 | 说明 |
|------|------|
| **GET** | 根据 OID 获取单个变量值 |
| **GETNEXT** | 获取 MIB 树中指定 OID 的下一个节点值 |
| **GETBULK** | 批量获取多个 OID 值（SNMPv2c/v3） |
| **SET** | 设置指定 OID 的变量值（需写权限） |
| **WALK** | 遍历 MIB 子树，递归执行 GETNEXT 直到超出子树范围 |
| **Bulk Walk** | 使用 GETBULK 进行高效遍历（SNMPv2c/v3） |

### MIB 文件处理

| 功能 | 说明 |
|------|------|
| **MIB 编译器** | 内置 MIB 编译器，支持 SMIv1 和 SMIv2 格式 |
| **MIB 文件加载** | 支持加载单个或批量 .my/.mib/.txt 格式 MIB 文件 |
| **依赖解析** | 自动解析 MIB 模块间的 IMPORTS 依赖关系 |
| **语法检查** | 编译时检查 MIB 文件的语法正确性 |
| **错误报告** | 详细的编译错误和警告信息 |
| **MIB 仓库** | 内置标准 MIB 库（RFC MIBs、厂商 MIBs） |

### 界面功能

| 功能 | 说明 |
|------|------|
| **MIB 树浏览器** | 以树形结构展示已加载的 MIB 节点层次 |
| **查询构建器** | 可视化构建 SNMP 查询请求 |
| **结果表格** | 以表格形式展示查询结果（OID、值、类型等） |
| **连接配置** | 保存和管理多个设备连接配置 |
| **历史记录** | 保存查询历史，便于重复执行 |
| **导出功能** | 将结果导出为 CSV、XML 等格式 |
| **剪贴板集成** | 支持复制 OID、值等信息到剪贴板 |
| **OID 查找** | 通过名称或 OID 值搜索 MIB 节点 |

---

## 2. 界面布局和交互设计

### 三面板布局

MGSOFT MIB Browser Professional 采用经典的三面板布局：

```
+------------------------------------------------------------------+
| 菜单栏: File | Edit | View | Query | Tools | Window | Help       |
+------------------------------------------------------------------+
| 工具栏: 地址栏(Host) | 端口(Port) | 社区名(Community) | 操作按钮 |
+------------------------------------------------------------------+
|                        |                                          |
|   MIB 树面板 (左侧)     |   查询/请求面板 (右上)                    |
|                        |                                          |
|   - 按树形结构展示      |   - OID 输入                              |
|     MIB 节点层次        |   - 操作类型选择                          |
|   - 支持展开/折叠       |   - SNMP 版本配置                        |
|   - 右键上下文菜单      |   - 发送按钮                             |
|   - 节点图标区分类型    |                                          |
|                        +------------------------------------------+
|                        |                                          |
|                        |   结果面板 (右下)                         |
|                        |                                          |
|                        |   - 表格展示查询结果                      |
|                        |   - 列: OID / Value / Type / Status      |
|                        |   - 支持排序和过滤                        |
|                        |   - 状态栏显示统计信息                    |
+------------------------------------------------------------------+
| 状态栏: 连接状态 | 请求计数 | 响应时间                            |
+------------------------------------------------------------------+
```

### 交互设计要点

- **MIB 树节点**: 双击节点自动填入查询面板的 OID 字段
- **上下文菜单**: 右键节点可选择 GET/GETNEXT/WALK 等操作
- **拖放支持**: 支持拖放 MIB 文件到窗口加载
- **快捷键**: 支持 Ctrl+G（GET）、Ctrl+N（GETNEXT）等快捷键
- **标签页**: 支持多标签页，可同时查询多个设备
- **停靠面板**: 各面板支持停靠、浮动、自动隐藏

### MIB 节点图标含义

| 图标 | 含义 |
|------|------|
| 文件夹图标 | 表节点（Table Entry） |
| 叶子图标 | 标量节点（Scalar） |
| 带箭头叶子 | 可读写节点（Read-Write） |
| 锁图标 | 仅读节点（Read-Only） |
| 红色标记 | 不可访问节点（Not-Accessible） |

---

## 3. 支持的 SNMP 版本和安全特性

### SNMPv1

| 特性 | 说明 |
|------|------|
| 认证 | Community String（明文） |
| 操作 | GET, GETNEXT, SET, WALK |
| 无加密 | Community String 以明文传输 |
| 错误处理 | 基本错误状态（noSuchName, tooBig 等） |

### SNMPv2c

| 特性 | 说明 |
|------|------|
| 认证 | Community String（明文） |
| 操作 | GET, GETNEXT, GETBULK, SET, WALK, Bulk Walk |
| 增强错误 | 扩展错误类型（wrongType, wrongLength 等） |
| 批量操作 | 支持 GETBULK，提高遍历效率 |
| 64位计数器 | 支持 Counter64 数据类型 |

### SNMPv3

| 特性 | 说明 |
|------|------|
| 安全模型 | USM (User-based Security Model) |
| 认证协议 | MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512 |
| 加密协议 | DES, 3DES, AES-128, AES-192, AES-256 |
| 安全级别 | noAuthNoPriv / authNoPriv / authPriv |
| 用户管理 | 支持配置多个 SNMPv3 用户 |
| 上下文 | 支持 Context Name 和 Context Engine ID |
| 发现引擎 | 自动发现远程 SNMP 引擎 ID |

### SNMPv3 USM 配置参数

```
Security Level:   [noAuthNoPriv | authNoPriv | authPriv]
Username:         string
Auth Protocol:    [MD5 | SHA | SHA-224 | SHA-256 | SHA-384 | SHA-512]
Auth Password:    string
Priv Protocol:    [DES | 3DES | AES-128 | AES-192 | AES-256]
Priv Password:    string
Context Name:     string
Context Engine ID: hex string
```

---

## 4. MIB 文件的加载和管理方式

### MIB 文件加载方式

1. **手动加载**: 通过 File > Load MIB 菜单选择单个或多个 MIB 文件
2. **拖放加载**: 将 .my/.mib 文件直接拖放到应用程序窗口
3. **目录扫描**: 配置 MIB 搜索目录，自动加载目录下所有 MIB 文件
4. **启动加载**: 配置启动时自动加载的 MIB 文件列表
5. **MIB 仓库**: 使用内置的 MIB 仓库（包含 RFC 标准 MIB 和常见厂商 MIB）

### MIB 文件格式支持

| 格式 | 说明 |
|------|------|
| `.my` | 标准 MIB 源文件格式 |
| `.mib` | 常见的 MIB 文件扩展名 |
| `.txt` | 文本格式的 MIB 定义 |
| SMIv1 | SNMPv1 管理信息结构（RFC 1155） |
| SMIv2 | SNMPv2 管理信息结构（RFC 2578） |

### MIB 编译器功能

- **语法验证**: 检查 MIB 文件的 SMI 语法正确性
- **依赖解析**: 自动查找并加载 IMPORTS 中引用的模块
- **错误定位**: 精确报告错误所在的行号和列号
- **警告提示**: 对非致命问题提供警告信息
- **编译日**: 详细的编译过程日志

### MIB 模块管理

- **已加载模块列表**: 查看当前加载的所有 MIB 模块
- **模块信息**: 显示模块名称、版本、描述、导入/导出关系
- **卸载模块**: 支持卸载不需要的 MIB 模块
- **模块搜索**: 按名称或 OID 搜索 MIB 模块

---

## 5. 查询结果的展示方式

### 结果表格列

| 列名 | 说明 |
|------|------|
| **OID** | 对象标识符（完整路径或符号名称） |
| **Value** | 查询到的值 |
| **Type** | 数据类型（INTEGER, OCTET STRING, Counter32 等） |
| **Status** | 请求状态（Success, Error, Timeout 等） |
| **Timestamp** | 响应时间戳 |

### 结果展示功能

- **符号名称解析**: 将数字 OID 自动转换为可读的符号名称（如 `sysDescr.0`）
- **值格式化**: 根据数据类型智能格式化显示值
- **十六进制/ASCII 切换**: 对于 OCTET STRING 类型，支持十六进制和 ASCII 两种显示模式
- **IP 地址格式化**: 将 IpAddress 类型显示为标准 IP 地址格式
- **时间格式化**: 将 TimeTicks 类型转换为可读的时间格式
- **枚举值显示**: 对于 INTEGER 类型，显示枚举名称而非数字值

### 结果操作

| 操作 | 说明 |
|------|------|
| **复制** | 复制选中行或全部结果到剪贴板 |
| **导出 CSV** | 将结果导出为 CSV 文件 |
| **导出 XML** | 将结果导出为 XML 格式 |
| **清除** | 清除当前结果 |
| **过滤** | 按 OID 或值过滤结果 |
| **排序** | 按列排序结果 |

### 状态栏信息

- **请求总数**: 已发送的 SNMP 请求数量
- **响应数**: 成功收到的响应数量
- **错误数**: 发生错误的请求数量
- **超时数**: 超时未响应的请求数量
- **平均响应时间**: 请求的平均响应时间

---

## 6. 其他重要功能

### Trap 接收器

- 监听指定端口接收 SNMP Trap 和 Inform
- 解析 Trap PDU 内容
- 显示 Trap 来源、时间戳、绑定变量等信息
- 支持 SNMPv1 Trap、SNMPv2c Trap、SNMPv3 Trap

### MIB Walk 功能

- **Walk 模式**: 从指定 OID 开始遍历整个子树
- **Walk 配置**: 设置最大遍历深度、超时时间
- **Walk 结果**: 以表格形式展示遍历到的所有 OID 及其值
- **Walk 进度**: 实时显示遍历进度

### 连接配置管理

- **配置文件**: 保存和加载连接配置（.snmp 配置文件）
- **快速连接**: 从下拉列表快速选择已保存的配置
- **配置参数**: Host、Port、SNMP Version、Community/User、超时、重试次数

### 界面定制

- **列配置**: 自定义结果表格显示哪些列
- **字体设置**: 自定义 MIB 树和结果表格的字体
- **颜色方案**: 自定义节点类型的颜色标识
- **工具栏定制**: 自定义工具栏按钮

---

## 7. 技术规格

| 项目 | 规格 |
|------|------|
| 平台 | Windows（原生应用） |
| 依赖 | 可能依赖 Java 运行时（部分版本） |
| SNMP 端口 | 默认 UDP 161（查询）、UDP 162（Trap） |
| MIB 格式 | SMIv1 (RFC 1155), SMIv2 (RFC 2578) |
| 协议支持 | SNMPv1, SNMPv2c, SNMPv3 (USM) |
| 许可证 | 商业软件（Professional 版） |

---

## Caveats / Not Found

- **官网状态**: mgsoft.com 域名已过期并被出售，原始 MGSOFT 公司网站已不可访问
- **实时验证**: 由于官网不可用，以上信息基于训练数据中的知识，未能通过实时网页验证
- **版本差异**: MGSOFT 提供多个版本（MIB Browser Free、Professional 等），不同版本功能可能有差异
- **最新特性**: 无法确认最新版本是否增加了新功能（如 SHA-2 系列、AES-256 等较新的加密支持）
- **界面细节**: 具体的界面截图和像素级布局无法从训练数据中精确还原

---

## External References

- RFC 1155 - Structure and Identification of Management Information for TCP/IP-based Internets (SMIv1)
- RFC 2578 - Structure of Management Information Version 2 (SMIv2)
- RFC 3411 - An Architecture for Describing Simple Network Management Protocol (SNMP) Management Frameworks
- RFC 3414 - User-based Security Model (USM) for SNMPv3
- RFC 3416 - Version 2 of the Protocol Operations for SNMP
