# MIB Browser

MIB Browser 是一个基于 Electron、React 和 TypeScript 构建的桌面 SNMP/MIB 工具。它的目标不是做一个只会发送单条 OID 查询的简单客户端，而是提供更接近专业 MIB Browser 的日常运维工作流：加载真实厂商 MIB、解析依赖、浏览 MIB 树、执行 SNMP 操作、查看和编辑 SNMP 表。

当前项目仍在持续演进，但核心方向已经明确：可靠处理 MIB、减少手写 OID、让 SNMP 查询和表编辑更接近网络设备管理场景。

## 主要能力

### MIB 加载与解析

- 支持加载单个或多个 MIB 文件。
- 支持加载 MIB 目录，并递归扫描常见 MIB 文件扩展名。
- 支持依赖感知解析：预扫描模块名、`IMPORTS` 和依赖关系，按依赖顺序解析。
- 对缺失依赖给出结构化诊断，包括缺失模块、缺失符号和来源模块。
- 支持保留表结构、`table` / `entry` / `column`、`INDEX`、枚举、`BITS`、`TEXTUAL-CONVENTION`、`DISPLAY-HINT` 等元数据。
- 支持 MIB 缓存和缓存版本升级，减少重复加载成本。
- MIB warning/error 使用短通知加详情弹窗展示，避免长提示遮挡界面。

### MIB 树浏览

- 基于虚拟化树组件浏览 MIB 节点，适合较大的 MIB 库。
- 支持节点搜索、匹配跳转、展开/折叠。
- 节点详情区展示 OID、语法、访问权限、类型、模块和描述。
- 右键菜单可从 MIB 节点直接发起 GET、SET、GETBULK、WALK、BULK WALK 和表查看。

### SNMP 操作

- 支持 SNMPv1、SNMPv2c、SNMPv3。
- 支持 GET、GETNEXT、GETBULK、WALK、BULK WALK、SET。
- GETBULK 和 BULK WALK 支持配置默认 `maxRepetitions` / `nonRepeaters`。
- WALK / BULK WALK 会按 OID 段边界判断子树范围，避免把相邻子树误混进结果。
- 支持取消当前 SNMP 请求。
- 查询结果以动态列形式展示，支持基于 MIB 树解析列名和实例后缀。

### GET / SET 工具窗口

- GET 和 SET 使用独立 Electron 工具窗口，而不是主窗口内的普通弹窗。
- 支持从 MIB 树右键打开 GET / SET 工作流。
- 支持多节点、多行操作。
- 支持实例后缀拼接，标量默认实例 `.0`。
- 支持对 SET 值做基础类型推断和校验。
- SET 后窗口不自动关闭，便于继续 GET 验证写入结果。

### SNMP Table Viewer / Editor

- 支持从 MIB 树的 `table` 或 `entry` 节点打开专用表查看器。
- 自动识别 entry、columns 和实例后缀。
- 使用 WALK / BULK WALK 获取表数据，并按实例组装为行列结构。
- 支持刷新、过滤、排序、列显隐、复制和 CSV 导出。
- 对可写列提供基础编辑能力，并通过 SNMP SET 提交。
- 枚举、整数、字符串、IP、OID 等类型会尽量使用合适的输入方式或转换逻辑。

### SNMPv3 能力

当前 SNMPv3 能力基于项目使用的 `net-snmp` 包实现：

- Security Level：`noAuthNoPriv`、`authNoPriv`、`authPriv`
- Auth Protocol：MD5、SHA-1、SHA-224、SHA-256、SHA-384、SHA-512
- Privacy Protocol：DES、AES-128、AES-256 Blumenthal、AES-256 Reeder
- Transport：UDP/IPv4、UDP/IPv6

不支持的协议不会静默降级到弱协议。比如不支持的 auth/priv/transport 选项会在创建 session 前给出明确错误。

### 连接配置与 profile

- 支持保存、加载、删除连接 profile。
- 支持主机、端口、SNMP 版本、community、SNMPv3 用户、安全协议、超时、重试次数、bulk 参数和 transport 配置。
- 旧 profile 会通过配置归一化逻辑补齐新增字段，保持兼容。

### Debug Mode

连接设置中提供 Debug Mode 开关。开启后，应用内 Debug Logs 面板会输出更详细的调试日志，包括：

- SNMP 请求开始、结束、耗时、返回数量和错误。
- SNMP 请求参数，包括 community、SNMPv3 密码和 SET 值。
- MIB 文件/目录加载过程和解析摘要。
- IPC 调用、工具窗口打开和主窗口结果回传。

顶部工具栏的 Debug Logs 按钮可打开/关闭日志面板。面板支持复制、清空和自动滚动，最多保留最近 500 条日志。主进程控制台只作为开发运行时的辅助输出。

Debug Mode 默认关闭。它是本地诊断模式，可能输出敏感连接信息，只应在可信环境中开启。

## 快速开始

### 环境要求

- Node.js 18 或更高版本
- npm 9 或更高版本
- Windows、macOS 或 Linux

### 安装依赖

```bash
npm install
```

项目根目录包含 `.npmrc`，用于配置 npm registry 镜像。国内网络环境下通常不需要额外代理。

### 启动开发模式

```bash
npm run dev
```

该命令会启动 electron-vite 开发环境，并打开 Electron 窗口。

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发模式 |
| `npm run build` | 构建 main、preload、renderer 产物 |
| `npm run preview` | 预览构建后的应用 |
| `npm run typecheck` | 同时运行 node 和 web 类型检查 |
| `npm run typecheck:node` | 检查 Electron main/preload 相关 TypeScript |
| `npm run typecheck:web` | 检查 renderer 相关 TypeScript |
| `npm run lint` | 对 `src/` 运行 ESLint |
| `npm test` | 运行 Vitest 测试 |

提交前建议至少运行：

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

## 项目结构

```text
my-mibbrowser/
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron 主进程入口
│   │   ├── ipc/                  # IPC handler
│   │   ├── mib/                  # MIB parser、类型和缓存逻辑
│   │   ├── snmp/                 # SNMP session、协议映射和操作实现
│   │   ├── toolWindows.ts        # GET/SET/Table Viewer 工具窗口
│   │   └── debugLogger.ts        # Debug Mode 日志入口
│   ├── preload/
│   │   └── index.ts              # 安全暴露给 renderer 的 window.api
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

## 使用建议

### 加载 MIB

1. 优先选择厂商 MIB 所在目录，而不是只加载单个文件。
2. 如果出现依赖 warning，点击通知中的详情查看缺失模块和符号。
3. 如果 MIB 目录很大，首次加载后缓存会减少后续启动和浏览成本。

### 执行 SNMP 查询

1. 在连接设置中配置设备地址、SNMP 版本和认证信息。
2. 可使用 Query Panel 手动输入 OID。
3. 更推荐从 MIB 树节点右键发起操作，减少手写 OID 错误。
4. 表类节点优先使用 Table Viewer，而不是只对表根节点做普通 WALK。

### 调试连接问题

1. 打开连接设置。
2. 开启 Debug Mode。
3. 再执行连接测试或 SNMP 请求。
4. 查看应用内 Debug Logs 面板中的 SNMP 参数、耗时、错误和返回数量。

注意：Debug Mode 会打印 community、SNMPv3 密码和 SET 值。

## 当前限制

- Trap/Inform 控制台尚未实现。
- Agent Simulator 尚未实现。
- 实时图表和趋势分析尚未实现。
- SNMP over TCP、TLS/DTLS、TSM、DOCSIS DH 等不在当前 `net-snmp` 能力范围内。
- MIB 编译器已支持依赖解析和关键元数据保留，但还不是完整商业级 SMI 诊断器。
- Table Viewer 支持查看和基础编辑，Add Row / Delete Row 等高级表行生命周期操作仍是后续增强方向。

## 常见问题

### Electron 二进制下载失败

如果安装依赖后 Electron 可执行文件缺失，通常是 Electron postinstall 下载失败。可以先重新执行：

```bash
npm install
```

仍失败时，可尝试手动运行：

```bash
node node_modules/electron/install.js
```

### MIB 加载后有大量依赖 warning

这通常表示当前目录缺少被 `IMPORTS ... FROM ...` 引用的基础 MIB。处理方式：

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
