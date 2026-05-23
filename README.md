# MIB Browser

> SNMP network management desktop tool — 基于 Electron + React 的现代化 MIB 浏览器与 SNMP 操作客户端。

## ✨ 功能特性

- **MIB 文件加载**：递归加载 MIB 文件并缓存，支持快速浏览大型 MIB 库
- **可视化 MIB 树**：基于 `react-arborist` 的虚拟化树形结构，丝滑浏览
- **SNMP 操作**：支持 GET / GETNEXT / GETBULK / WALK / SET 等核心操作
- **多版本支持**：SNMPv1 / v2c / v3
- **结果可视化**：表格化展示查询结果，支持过滤与导出
- **跨平台**：Windows / macOS / Linux

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) 42 |
| 构建工具 | [electron-vite](https://electron-vite.org/) + [Vite](https://vitejs.dev/) 7 |
| UI 框架 | [React](https://react.dev/) 19 + [Ant Design](https://ant.design/) 6 |
| 状态管理 | [Zustand](https://zustand-demo.pmnd.rs/) 5 |
| SNMP 库 | [net-snmp](https://github.com/markabrahams/node-net-snmp) |
| 树组件 | [react-arborist](https://github.com/brimdata/react-arborist) |
| 语言 | TypeScript 6 |
| 打包 | [electron-builder](https://www.electron.build/) |

## 📁 项目结构

```
my-mibbrowser/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 主进程入口
│   │   ├── ipc/           # IPC 通信处理
│   │   ├── mib/           # MIB 文件解析与缓存
│   │   └── snmp/          # SNMP 协议交互
│   ├── preload/           # 预加载脚本（暴露主进程 API 到渲染层）
│   │   └── index.ts
│   └── renderer/          # 渲染进程（React 应用）
│       ├── index.html
│       └── src/
├── .trellis/              # Trellis 项目管理（规范、任务、研究）
├── electron.vite.config.ts
├── electron-builder.json5
└── package.json
```

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18
- **npm** ≥ 9
- Windows / macOS / Linux

### 安装依赖

```bash
npm install
```

> 💡 国内开发者：项目根目录已配置 `.npmrc`，自动使用淘宝镜像下载 npm 包和 Electron 二进制，无需额外设置代理。

### 启动开发模式

```bash
npm run dev
```

会在本地启动 Vite dev server（`http://localhost:5173`）并自动打开 Electron 窗口，支持热更新。

## 📜 可用脚本

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发模式（热更新 + Electron 窗口）|
| `npm run build` | 构建 main / preload / renderer 三部分产物 |
| `npm run preview` | 预览构建后的产物 |
| `npm run typecheck` | 类型检查（node + web 全量）|
| `npm run typecheck:node` | 仅主进程类型检查 |
| `npm run typecheck:web` | 仅渲染进程类型检查 |
| `npm run lint` | ESLint 检查 `src/` 目录 |

## 📦 构建与打包

```bash
# 1. 构建 JS 产物
npm run build

# 2. 用 electron-builder 打包成安装包
npx electron-builder
```

构建产物位置：
- JS 产物：`out/{main,preload,renderer}/`
- 安装包：`dist/`（Windows 默认 NSIS 安装包）

构建配置详见 [`electron-builder.json5`](./electron-builder.json5)。

## 🧪 开发规范

本项目使用 [Trellis](https://trellis.dev) 管理。在 `src/` 下任一层写代码前，请先阅读对应规范：

- 主进程规范：[`.trellis/spec/backend/`](./.trellis/spec/backend/)
- 渲染进程规范：[`.trellis/spec/frontend/`](./.trellis/spec/frontend/)
- 跨层设计指南：[`.trellis/spec/guides/`](./.trellis/spec/guides/)

提交前请确保：

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 无 error
- [ ] 已根据对应层规范实现

## 🐛 常见问题

### `Error: Electron uninstall`

`node_modules/electron/dist/electron.exe` 缺失，通常是 `npm install` 时网络问题导致 postinstall 没下载二进制。

**解决**：项目根目录的 `.npmrc` 已配置淘宝 electron 镜像。如果还失败，单独执行：

```bash
node node_modules/electron/install.js
```

### Vite dev server 端口被占用

修改 `electron.vite.config.ts` 中 renderer 的 `server.port` 配置。

## 📄 License

私有项目，未公开发布。
