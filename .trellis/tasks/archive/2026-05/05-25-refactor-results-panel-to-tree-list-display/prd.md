# refactor-results-panel-to-tree-list-display

## Goal

将 Results Panel 从 antd 表格改为等宽字体日志/控制台风格展示，与专业 MIB 浏览器（mgSOFT 等）的纯文本输出保持一致。

## What I already know

* 已完成透视表格 → 扁平 varbind 列表的数据模型重构
* 数据管道完整：`buildResultSession()` 生成 `ResultVarbind[]`
* 用户反馈：antd 表格 checkbox 列太宽、底部空白、表格感太重
* 参考设计：等宽字体纯文本日志 `1: ifIndex.1275084831 (integer) 1275084831`

## Research References

* [`research/mib-browser-result-display-patterns.md`](research/mib-browser-result-display-patterns.md) — 7 款专业 MIB 浏览器结果展示模式研究

## Requirements (v2 — 日志风格)

* **展示风格**: 等宽字体纯文本日志，每行格式 `序号: 列名称.instance (类型) 值`
* **类型高亮**: SNMP 类型用绿色/彩色显示，快速视觉区分
* **错误高亮**: 错误行用红色文本或标记
* **HEX/ASCII 切换**: OCTET STRING 值支持点击切换
* **行选择**: 去掉 checkbox 列，改为行点击选中（用于复制选中行）
* **布局**: 组件填满可用空间，无底部空白
* **滚动**: 使用虚拟滚动处理大量结果（>500 行）
* **工具栏**: 保留 Copy/Copy All/CSV/XML/Clear 按钮

## Acceptance Criteria

* [ ] 结果以等宽字体日志风格展示
* [ ] 每行格式：`序号: 列名称.instance (类型) 值`
* [ ] SNMP 类型用彩色高亮（绿色）
* [ ] 错误行用红色视觉标识
* [ ] OCTET STRING 值支持 HEX/ASCII 切换
* [ ] 行点击选中，无 checkbox 列
* [ ] 组件填满可用空间，无底部空白
* [ ] 大量结果滚动流畅
* [ ] Copy/Copy All/CSV/XML/Clear 全部可用

## Definition of Done

* Tests added/updated
* Lint / typecheck / CI green
* 无功能回归

## Technical Approach

1. **替换 antd Table 为自定义日志组件**:
   - 使用 `<div>` 容器 + 虚拟滚动（`@tanstack/react-virtual` 或自实现）
   - 每行一个 `<div>`，等宽字体渲染
   - 行格式：`<span>1:</span> <span>ifIndex.1275084831</span> <span style="color:green">(integer)</span> <span>1275084831</span>`
   - 行点击切换选中状态（高亮背景色）

2. **CSS 布局修复**:
   - 容器 `height: 100%` / `flex: 1` 填满父容器
   - 移除 antd Table 的 `scroll={{ y: 'calc(100vh - 380px)' }}` 硬编码

3. **导出格式保持**:
   - TSV/CSV/XML 继续用结构化格式（序号、名称、Instance、类型、值）
   - 与视觉展示解耦

4. **移除不再需要的组件**:
   - `ResizableHeaderCell` 不再需要（无表格列）
   - `columnWidths` / `columnOrder` 状态移除

## Out of Scope

* Table Viewer 功能（已独立）
* MIB 树面板
* SET 操作 UI
* 流式结果返回（单独立项）

## Technical Notes

* **主要修改文件**:
  * `src/renderer/src/components/ResultsPanel.tsx` — 重写 UI
  * `src/renderer/src/styles.css` — 布局修复
* **数据模型不变**: `ResultVarbind[]` 和 `buildResultSession()` 已在上一轮完成
* **虚拟滚动方案**: `@tanstack/react-virtual` 或简单的 `overflow-y: auto` + `IntersectionObserver`
