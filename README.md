# MIB Browser

MIB Browser 是一个基于 Electron、React 和 TypeScript 构建的桌面 SNMP/MIB 工具，用于加载厂商 MIB、浏览 OID 树、执行 SNMP 查询、查看和编辑 SNMP 表。

它适合用在这些场景：

- 把厂商 MIB 目录加载成可搜索、可右键操作的 MIB 树。
- 减少手写 OID，通过 MIB 节点直接发起 GET、SET、GETBULK、WALK、BULK WALK。
- 用独立工具窗口处理 GET / SET / Table Viewer，方便边看主界面边调试设备。
- 查看表数据、编辑可写单元格，并对带 RowStatus 语义的表执行 Add Row / Delete Row。
- 监听本地 Trap / Inform，结合 MIB 名称解析和 Debug Logs 排查连接或协议问题。

## 界面预览

![MIB Browser 主界面](doc/png/main.png)

![设备连接设置](doc/png/device-setting.png)

![Table Viewer](doc/png/table-viewer.png)

## 核心能力

| 工作流 | 支持能力 |
|---|---|
| MIB 加载 | 文件、目录、拖拽加载；递归扫描；依赖顺序解析；缺失依赖诊断；缓存复用 |
| MIB 浏览 | 索引化搜索跳转；展开/折叠；节点详情；复制 OID/名称；右键发起 SNMP 操作 |
| SNMP 查询 | SNMP v1/v2c/v3；GET、GETNEXT、GETBULK、WALK、BULK WALK、SET；流式 WALK / BULK WALK 结果 |
| 工具窗口 | GET、SET、Table Viewer 使用独立 Electron 窗口；支持主窗口拖拽节点到工具窗口 |
| 表查看/编辑 | 自动识别 table/entry/columns/instance；过滤、排序、分页、复制、CSV 导出；基础 SET 编辑；RowStatus Add Row / Delete Row |
| 通知接收 | 本地 UDP Trap / Inform 监听；实时事件查看；MIB 名称解析；过滤、复制、清空和自动滚动 |
| 连接配置 | Profiles；自动恢复上次设备配置，包括 Host、端口、版本、认证、超时、重试、Bulk 参数和 transport |
| 调试 | Debug Mode；应用内 SNMP/MIB/IPC 调试日志 |

## 快速开始

环境要求：

- Node.js 18 或更高版本
- npm 9 或更高版本
- Windows、macOS 或 Linux

安装依赖并启动开发模式：

```bash
npm install
npm run dev
```

## 基本使用流程

1. 加载 MIB：优先选择厂商 MIB 目录，应用会递归扫描 `.my`、`.mib`、`.txt` 等常见 MIB 文件并按依赖顺序解析。
2. 配置设备：在连接设置中填写 Host/IP、端口、SNMP 版本、community 或 SNMPv3 参数。
3. 执行查询：可以手动输入 OID，也可以从 MIB 树节点右键发起 GET、SET、GETBULK、WALK、BULK WALK。
4. 查看表数据：对 `table` 或 `entry` 节点打开 Table Viewer，按行列查看实例数据。
5. 接收通知：打开 Trap / Inform Console，默认监听 `udp4:9162`；如需标准端口 `162`，部分系统需要管理员权限。
6. 调试问题：开启 Debug Mode 后，通过 Debug Logs 面板查看请求参数、耗时、错误和返回数量。

## SNMPv3 与协议边界

当前 SNMPv3 能力基于项目使用的 `net-snmp` 包：

| 类型 | 支持项 |
|---|---|
| Security Level | `noAuthNoPriv`、`authNoPriv`、`authPriv` |
| Auth Protocol | MD5、SHA-1、SHA-224、SHA-256、SHA-384、SHA-512 |
| Privacy Protocol | DES、AES-128、AES-256 Blumenthal、AES-256 Reeder |
| Transport | UDP/IPv4、UDP/IPv6 |

不支持的协议不会静默降级，创建 session 前会给出明确错误。SNMP over TCP、TLS/DTLS、TSM、DOCSIS DH 等不在当前 `net-snmp` 能力范围内。

## 实现要点

- MIB 树搜索、选择和展开路径使用预构建索引，避免交互时反复递归扫描整棵树。
- Ant Design Tree 的 `DataNode` 会复用未变化分支，减少搜索高亮或局部状态变化时的 React 节点重建。
- main 进程缓存构建后的 MIB 树，只在已加载模块集合变化时重新构建。
- MIB 加载成功后，IPC 响应直接带回当前 MIB 树，renderer 不再立刻追加一次完整 `mib:get-tree` 拉取。
- GET / SET / Table Viewer 工具窗口只接收所需节点或子树上下文，不随每次打开传输完整 MIB 树。

## 开发命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发模式 |
| `npm run build` | 构建 main、preload、renderer 产物 |
| `npm run preview` | 预览构建后的应用 |
| `npm run typecheck` | 运行 node 和 web 类型检查 |
| `npm run lint` | 对 `src/` 运行 ESLint |
| `npm test` | 运行 Vitest 测试 |
| `npm run package:win` | 类型检查、lint、测试、构建，并打包 Windows x64 NSIS 安装包 |
| `npm run package:mac` | 类型检查、lint、测试、构建，并打包 macOS x64/arm64 DMG |

常规代码变更提交前建议执行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 构建与打包

构建应用产物：

```bash
npm run build
```

固定打包脚本：

```bash
npm run package:win
npm run package:mac
```

两个脚本默认使用国内镜像源下载 Electron 和 electron-builder 辅助包，并关闭证书自动发现；脚本会先清理旧的 `out/` 和 `dist/`，再执行类型检查、lint、测试和构建。Windows 打包脚本为 `scripts/package-win.ps1`，使用 `electron-builder --win --x64 --publish never` 生成 NSIS 安装包；当前 Windows 配置关闭了 exe 签名/资源编辑，避免普通 Windows 用户因为 `winCodeSign` 工具包解压符号链接权限不足而打包失败。macOS 打包脚本为 `scripts/package-mac.sh`，使用 `electron-builder --mac --x64 --arm64 --publish never` 生成 DMG；项目配置支持 macOS 打包，但建议在 macOS 环境执行，后续如需正式分发还需要配置 Apple 签名和 notarization。项目不支持 iOS 打包，当前是 Electron 桌面应用。

默认镜像源为：

- `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
- `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`

如果需要使用本地代理，可以显式设置 `PACKAGE_PROXY`：

```bash
PACKAGE_PROXY=http://127.0.0.1:7897 npm run package:mac
```

PowerShell 示例：

```powershell
$env:PACKAGE_PROXY = 'http://127.0.0.1:7897'
npm run package:win
```

构建输出：

- Electron/Vite 产物：`out/`
- 安装包产物：`dist/`
- 应用图标资源：`build/`

## 项目结构

```text
my-mibbrowser/
├── build/                      # Electron builder resources and app icons
├── doc/png/                    # README screenshots
├── src/
│   ├── main/                   # Electron 主进程、IPC、MIB、SNMP、工具窗口
│   ├── preload/                # 暴露给 renderer 的 window.api
│   ├── renderer/               # React UI、状态、组件和样式
│   └── shared/                 # main/preload/renderer 共享类型
├── .trellis/                   # Trellis 任务、规范和工作记录
├── .agents/                    # 项目内 agent 技能
├── electron.vite.config.ts
├── electron-builder.json5
└── package.json
```

## 开发说明

本项目使用 Trellis 管理任务、代码规范和工作记录，项目规范见 `.trellis/spec/`。

关键约束：

- renderer 只能通过 `window.api` 调用 Electron 能力，不直接导入 `electron`。
- main/preload/renderer 共享的 IPC 类型放在 `src/main/*/types.ts` 或 `src/shared/`。
- MIB IPC 合约、SNMP 树操作约束和工具窗口约束已记录在 `.trellis/spec/`，修改相关流程前先读对应 spec。

## 致谢与链接

- 感谢 [LINUX DO - 新的理想型社区](https://linux.do/) 提供开放、友好的技术交流氛围。

## License

本项目按 GPL-3.0 协议发布。
