# MIB Browser

MIB Browser 是一个面向网络设备管理、MIB 解析和 SNMP 排障的桌面工作台。它把厂商 MIB 加载、MIB 树浏览、SNMP 查询、Table Viewer、SET 编辑和调试日志放在同一个应用里，目标是减少手写 OID，让设备查询和表数据检查更接近真实运维流程。

适合你在这些场景里使用：

- 需要加载一组厂商 MIB，并快速定位节点、表和列。
- 希望从 MIB 树直接发起 GET、SET、GETBULK、WALK、BULK WALK。
- 需要把 SNMP 表按实例整理成可读行列，而不是只看一串 varbind。
- 需要调试 SNMPv3 认证、community、超时、返回数量和设备响应。

![MIB Browser 主界面：MIB 树、SNMP 查询结果和状态栏](doc/png/main.png)

## 亮点

| 能力 | 说明 |
|---|---|
| MIB-first 工作流 | 先加载和浏览 MIB，再从节点直接发起 SNMP 操作，减少手写 OID |
| 真实表格视图 | 自动识别 table / entry / columns / instance，将 WALK 结果组装成表 |
| 独立工具窗口 | GET、SET、Table Viewer 使用独立窗口，不挤占主界面 |
| 完整连接配置记忆 | 自动恢复上次设备地址、端口、SNMP 版本、认证、超时、重试和 Bulk 参数 |
| 应用内 Debug Logs | Debug Mode 打开后在应用内查看 SNMP/MIB/IPC 日志，不依赖主进程终端 |
| 可取消长操作 | WALK / BULK WALK 等长请求可中断，避免界面被慢设备拖住 |

## 设备连接

连接设置集中管理目标地址、端口、SNMP 版本、transport、community、SNMPv3 认证/加密参数、超时、重试和 Bulk 默认参数。Profiles 用于保存多套命名配置；应用也会自动恢复上次使用的完整设备配置。

![Device Connection Settings：设备地址、SNMP 版本、认证和请求参数](doc/png/device-setting.png)

SNMPv3 支持范围来自当前使用的 `net-snmp` 包：

| 类型 | 支持项 |
|---|---|
| Security Level | `noAuthNoPriv`、`authNoPriv`、`authPriv` |
| Auth Protocol | MD5、SHA-1、SHA-224、SHA-256、SHA-384、SHA-512 |
| Privacy Protocol | DES、AES-128、AES-256 Blumenthal、AES-256 Reeder |
| Transport | UDP/IPv4、UDP/IPv6 |

不支持的协议不会静默降级到弱协议。创建 session 前会给出明确错误。

## MIB 树与 SNMP 查询

主界面左侧是虚拟化 MIB 树，适合较大的 MIB 库。节点详情会显示 OID、语法、访问权限、类型、模块和描述。右键节点可以直接发起 GET、SET、GETBULK、WALK、BULK WALK 或打开 Table Viewer。

MIB 加载能力包括：

- 支持单个文件、多个文件和目录加载。
- 目录加载会递归扫描常见 MIB 文件扩展名。
- 预扫描模块名、`IMPORTS` 和依赖关系，按依赖顺序解析。
- 对缺失依赖给出结构化诊断，包括缺失模块、缺失符号和来源模块。
- 保留 `table` / `entry` / `column`、`INDEX`、枚举、`BITS`、`TEXTUAL-CONVENTION`、`DISPLAY-HINT` 等元数据。
- 使用缓存降低重复加载成本。

SNMP 操作支持：

- `GET`
- `GETNEXT`
- `GETBULK`
- `WALK`
- `BULK WALK`
- `SET`

WALK / BULK WALK 会按 OID 段边界判断子树范围，避免把相邻子树误混进结果。

## Table Viewer / Editor

Table Viewer 用来处理 SNMP 表，而不是把表根节点的 WALK 结果直接堆成普通列表。它会自动识别 entry、columns 和实例后缀，通过 WALK / BULK WALK 获取数据，并按实例组装为行列结构。

![Table Viewer：SNMP 表数据查看、过滤、分页和导出](doc/png/table-viewer.png)

Table Viewer 支持：

- 刷新、过滤、排序
- 列显隐
- 分页大小选择
- 复制和 CSV 导出
- 可写列的基础编辑和 SNMP SET 提交
- 枚举、整数、字符串、IP、OID 等类型的基础输入转换

## Debug Mode

连接设置里可以开启 Debug Mode。开启后，顶部工具栏的 Debug Logs 按钮可打开应用内日志面板，查看更详细的诊断信息：

- SNMP 请求开始、结束、耗时、返回数量和错误
- SNMP 请求参数，包括 community、SNMPv3 密码和 SET 值
- MIB 文件/目录加载过程和解析摘要
- IPC 调用、工具窗口打开和主窗口结果回传

Debug Logs 支持复制、清空和自动滚动，最多保留最近 500 条。Debug Mode 默认关闭；开启后可能显示敏感连接信息，只适合可信环境。

## 快速开始

环境要求：

- Node.js 18 或更高版本
- npm 9 或更高版本
- Windows、macOS 或 Linux

安装依赖：

```bash
npm install
```

启动开发模式：

```bash
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 构建与打包

构建 Electron/Vite 产物：

```bash
npm run build
```

使用 electron-builder 打包安装包：

```bash
npx electron-builder
```

当前打包目标来自 `electron-builder.json5`：

| 平台 | 目标 |
|---|---|
| Windows | NSIS x64 |
| macOS | DMG x64 / arm64 |
| Linux | AppImage x64 |

构建输出：

- Electron/Vite 产物：`out/`
- 安装包产物：`dist/`

应用图标资源位于 `build/`：

- `build/icon.svg`：可编辑源文件
- `build/icon.png`：Linux 和运行时窗口图标
- `build/icon.ico`：Windows 打包图标
- `build/icon.icns`：macOS 打包图标

## 项目结构

```text
my-mibbrowser/
├── build/                      # Electron builder resources, including app icons
├── doc/
│   └── png/                     # README screenshots
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron 主进程入口
│   │   ├── ipc/                  # IPC handlers
│   │   ├── mib/                  # MIB parser、类型和缓存逻辑
│   │   ├── snmp/                 # SNMP session、协议映射和操作实现
│   │   ├── toolWindows.ts        # GET/SET/Table Viewer 工具窗口
│   │   └── debugLogger.ts        # Debug Mode 日志入口
│   ├── preload/
│   │   └── index.ts              # 暴露给 renderer 的 window.api
│   ├── renderer/
│   │   └── src/
│   │       ├── components/       # Toolbar、MIB 树、结果面板、工具窗口内容
│   │       ├── stores/           # Zustand 状态
│   │       ├── utils/            # 结果列、表数据、MIB 树工具
│   │       └── styles.css        # 全局样式
│   └── shared/                   # main/preload/renderer 共享类型
├── .trellis/                     # Trellis 任务、规范和工作记录
├── .agents/                      # 项目内 agent 技能
├── electron.vite.config.ts
├── electron-builder.json5
├── tsconfig.node.json
├── tsconfig.web.json
└── package.json
```

## 常见问题

### Electron 二进制下载失败

如果安装依赖后 Electron 可执行文件缺失，通常是 Electron postinstall 下载失败。先重新执行：

```bash
npm install
```

仍失败时，可尝试手动运行：

```bash
node node_modules/electron/install.js
```

### MIB 加载后有大量依赖 warning

这通常表示当前目录缺少被 `IMPORTS ... FROM ...` 引用的基础 MIB。

处理方式：

1. 打开诊断详情，查看缺失模块名。
2. 将缺失 MIB 文件放入同一目录或一起加载。
3. 重新加载目录。

### SNMPv3 认证或加密失败

检查以下内容：

- Security Level 是否与设备一致。
- Auth / Priv 协议是否与设备一致。
- 用户名、认证密码、加密密码是否正确。
- Transport 是否需要 IPv4 或 IPv6。
- 可临时开启 Debug Mode 查看实际请求配置。

## 当前限制

- Trap/Inform 控制台尚未实现。
- Agent Simulator 尚未实现。
- 实时图表和趋势分析尚未实现。
- SNMP over TCP、TLS/DTLS、TSM、DOCSIS DH 等不在当前 `net-snmp` 能力范围内。
- MIB 编译器已支持依赖解析和关键元数据保留，但还不是完整商业级 SMI 诊断器。
- Table Viewer 支持查看和基础编辑，Add Row / Delete Row 等高级表行生命周期操作仍是后续增强方向。

## 开发规范

本项目使用 Trellis 管理任务、代码规范和工作记录。重要约束包括：

- main 进程 SNMP 操作必须保持 session 清理和取消逻辑一致。
- OID 子树判断必须按段边界匹配，不能直接用裸 `startsWith`。
- renderer 发起 SNMP 操作后，结果必须通过统一结果会话写入路径展示。
- 大段诊断信息不能直接放入 toast，应使用短通知加详情视图。
- 业务代码不要散落 `console.log`，诊断输出走 Debug Mode 的集中 logger。

更多细节见 `.trellis/spec/`。

## License

本项目按 GPL-3.0 协议发布。复制、修改、分发以及基于本项目的衍生作品需要遵循 GPL-3.0 的源代码公开和同协议分发要求。
