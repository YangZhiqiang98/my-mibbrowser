# fix-streaming-render-gated-by-isquerying

## Goal

修复 WALK / BULK_WALK 流式渲染失效问题：后端、IPC、store 都按批次推送数据，但 `ResultsPanel.tsx` 把整段行容器用 `!isQuerying` 包住，导致 querying 期间只显示 Spin、所有行在 `setIsQuerying(false)` 瞬间一次性出现，用户体验仍是"一次性渲染"。

## Root Cause

`src/renderer/src/components/ResultsPanel.tsx:282`：

```tsx
{!isQuerying && (rowCount > 0 || session?.error) && (
  <>
    <div className="results-log-header">...</div>
    {/* rows + virtual scroll */}
    <div className="results-log-footer">...</div>
  </>
)}
```

整个 header + 行块 + footer 都被 `!isQuerying` 短路，querying 期间无论 `appendResultVarbinds` 推了多少行进 store，DOM 里都没有行容器。`:260` 的 Spin 是 `{isQuerying && ...}` 单独一段，与行块互斥。

附带影响：
- `:76-86` 的自动滚动 effect 在 querying 期间能跑，但 DOM 没有行容器，`scrollHeight` 不增长，自动滚动是空操作。
- `QueryPanel.tsx:80` 的 `setStatusMessage('${op}: N result(s)...')` 持续递增，证明 store 在追加，只是 ResultsPanel 不显示。

## Requirements

* WALK / BULK_WALK querying 期间，行容器持续渲染并随 `appendResultVarbinds` 实时追加。
* 用一个 inline running 横幅替代当前居中 Spin，与 monospace 日志风格一致，文案：`***** SNMP QUERY RUNNING... (N results so far) *****`，N 跟随 `rowCount` 实时跳动。
* querying 且 0 行时显示 running 横幅，**不**再显示 Empty 提示。
* querying 结束（success / error / aborted）后切回原有 `***** SNMP QUERY COMPLETED ... *****` footer。
* GET / GETBULK / SET 的体验不变（它们是单次返回，querying → done 之间没有 partial 数据，running 横幅会闪现一下，符合预期）。

## Acceptance Criteria

* [ ] WALK / BULK_WALK 进行中，结果行可见且随时间增加（不再等到 `setIsQuerying(false)` 才出现）。
* [ ] querying 期间 footer 位置显示 `***** SNMP QUERY RUNNING... (N results so far) *****`，N 与 `rowCount` 同步。
* [ ] querying 结束后 running 横幅切回 `***** SNMP QUERY COMPLETED (N results, Tms) *****`。
* [ ] 自动滚动（`isAutoScrollRef`）在 querying 期间生效：新行追加且用户停留在底部时自动滚到底。
* [ ] querying 且 0 行时不显示 Empty 提示，只显示 header + running 横幅。
* [ ] GET / GETBULK / SET 流程视觉无回归（无 partial 数据闪烁、footer 文案正常）。
* [ ] Error / aborted 路径渲染未受影响（error banner、aborted footer 文案保持原样）。

## Definition of Done

* `pnpm typecheck` 通过
* `pnpm lint` 通过
* 手动验证：跑一次大表 WALK（如 `1.3.6.1.2.1.2.2`），观察行随时间增加；观察 Stop 中断后行保留。
* 手动验证：GET / GETBULK / SET 仍正常。

## Technical Approach

只动 `src/renderer/src/components/ResultsPanel.tsx` 的 JSX：

1. **拆分外层条件**：把 `!isQuerying && (rowCount > 0 || session?.error)` 改成两段：
   - 顶部 header：`(isQuerying || rowCount > 0 || session?.error)` 显示
   - 行容器 + error banner：同上条件
   - footer：根据 `isQuerying` 在 RUNNING / COMPLETED 之间切换
2. **删除独立 Spin**：移除 `:260-264` 的 `results-log-loading` 块。
3. **空态条件收紧**：`!isQuerying && rowCount === 0 && !session?.error && !session` 仍走 Empty；`!isQuerying && session && rowCount === 0` 走"操作完成但 0 结果"的 Empty（已有逻辑）。querying 时不走 Empty。
4. **Running 横幅**：新增 `<div className="results-log-footer">` 内分支，querying 时文案 `***** SNMP QUERY RUNNING... ({rowCount} results so far) *****`，否则保持 COMPLETED 文案。
5. **样式**：复用 `.results-log-footer` 现有样式；如需视觉差异（例如 RUNNING 灰一点），可加 `.results-log-footer--running` 的最小 className，但不强制。

不动文件：
- `src/main/snmp/client.ts`
- `src/main/ipc/handlers.ts`
- `src/preload/index.ts`
- `src/renderer/src/stores/appStore.ts`
- `src/renderer/src/components/QueryPanel.tsx`
- `src/renderer/src/utils/resultColumns.ts`

## Decision (ADR-lite)

**Context**: 流式管道（store / IPC / SNMP client）都正确分批推送，但 UI 渲染被 `!isQuerying` 整段挡住。修复可选位置有：(a) 在 ResultsPanel 拆条件让行容器持续渲染；(b) 在 QueryPanel 控制 isQuerying 翻转时机。

**Decision**: 选 (a)。`isQuerying` 在 store 层语义清晰（"有 SNMP 操作在飞"），多处订阅（StatusBar、按钮 loading 态），改它的翻转时机会引发跨组件回归。在展示层拆条件，影响面最小，符合"流式数据应当持续可见"的展示语义。

**Consequences**:
- ResultsPanel 同时承担"渲染历史结果"和"渲染流式中间态"两个职责，条件分支增多，但仍局限在一个组件内。
- GET / GETBULK / SET 会短暂闪一下 RUNNING 横幅；可接受（操作通常 <100ms）。
- 未来若引入"多 session 并存"或"后台预取"，本次拆分不阻碍演进。

## Out of Scope

* SNMP client / IPC / preload / store 任何改动。
* Spin 组件替换为其他视觉元素（除 inline 文本横幅之外）。
* Abort 状态独立 footer 文案（保持现有 COMPLETED 文案，aborted 信息已经在 status bar）。
* 流式吞吐性能优化（已有虚拟滚动）。

## Technical Notes

* 父任务（`05-25-streaming-snmp-results-to-results-panel`）实现了流式数据管道，PRD 见 `.trellis/tasks/05-25-streaming-snmp-results-to-results-panel/prd.md`。
* 单一写路径约束（`.trellis/spec/frontend/mib-tree-snmp-ops.md` §"SNMP Operation Results Go Through a Single Write Path"）：本次只动 ResultsPanel 展示层，不引入新的 setResult 写入点，不破坏该约束。
* `appendResultVarbinds`（`appStore.ts:141`）与 `initResultSession`（`:131`）是父任务新增的流式 action，本次不动。
