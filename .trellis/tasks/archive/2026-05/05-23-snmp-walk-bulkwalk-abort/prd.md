# 支持 SNMP 操作中止（WALK / BULKWALK abort）

## Goal

让用户能在长时间运行的 SNMP 操作（特别是 `WALK` / `BULK_WALK`，可能数十秒甚至更久）执行过程中点一个按钮把它中止，前端 `isQuerying` 状态恢复，结果区不要堵在 loading。短操作（GET / GETNEXT / GETBULK / SET）单次往返毫秒级，本身不需要 abort，但实现层面如能"统一一套机制"覆盖所有操作也无害。

## What I already know

**IPC / 主进程层（`src/preload/index.ts`、`src/main/ipc/handlers.ts`、`src/main/snmp/client.ts`）**：
- 所有 SNMP IPC 都是 `ipcRenderer.invoke` (req-resp 模型)，没有 event/send 通道。前端 `await` 整个 `Promise<SnmpResult>`。
- 主进程 `snmpWalk` (client.ts:364)、`snmpBulkWalk` (client.ts:441) 是在 Promise 内部用 `session.getNext` / `session.getBulk` 回调递归，循环到子树边界或 endOfMibView。
- 每次 SNMP 调用都 `createSession(config)` 一个独立 session，操作完调 `session.close()`。没有跨调用的 session 复用。
- `net-snmp` 库每个 session 有 `.close()` 方法 —— 关闭后正在进行的 callback 行为待研究（这是 research 题目）。

**前端层**：
- `appStore.isQuerying: boolean` 是单一互斥锁。QueryPanel send button、MibTreePanel 右键 op、SetMultiNodeDialog 提交、GetMultiNodeDialog 提交都共享这一个 flag。
- 也就是说：**UI 上同一时刻只能有一个 SNMP 操作在跑**。Abort 设计可以对齐这个语义（全局一个 abort，不需要 token 化按操作 id 取消）。
- 长操作期间 UI 提示：现在仅有 status bar 的 `Executing WALK on ...` 文本 + Send 按钮的 loading 圈圈。没有 abort 入口。

**痛点（驱动需求的场景）**：
- 用户对一棵大表（数千行）做 WALK，发现挑错了 OID 或网络慢，目前只能干等几十秒。
- BULK_WALK 在 maxReps=10 设错或目标 OID 太宽时同样卡死。
- 配置写错、host 不可达时，每次操作要等 timeout × retries 才返回。

## Assumptions (temporary, to validate)

- net-snmp 的 `session.close()` 在 in-flight 状态调用会让正在等的 callback 收到 error（典型 "Session closed"），从而让我们的 walk loop 跳出。**待研究确认**。
- 单 abort 入口（全局取消"当前正在跑的 SNMP 操作"）就够用，不需要 token-based per-operation cancel。**待用户确认**。
- Abort 按钮放在哪里？最直观的位置是 status bar 或 send button 旁边的小 ✕。**待用户决策**。

## Open Questions

（全部已收敛 — 见下方 Decisions）

## Decisions (locked through brainstorm)

| # | Topic | Decision |
|---|---|---|
| D1 | Abort 覆盖范围 | **所有 SNMP 操作都开 abort**（GET / GETNEXT / GETBULK / SET / WALK / BULK_WALK）。短操作即便点 abort 也无害（要么取消成功，要么已经返回 = no-op）。统一一套机制 + UX 一致。 |
| D2 | Abort UI 入口 | **仅 status bar 加一个全局 abort 按钮**。loading 时高亮可点，闲时灰。**不**在 Send / 提交按钮上做 loading→cancel 切换；**不**联动 Modal 的 cancel 按钮（modal 关了操作还在后台跑直到完成或 status bar abort）。 |
| D3 | 部分结果处理 | **保留**已经收集的部分 varbinds（仅 WALK / BULK_WALK 有意义）。结果区显示这些行，status bar 文本加后缀 `aborted at N rows`。 |
| D4 | 额外反馈 | **不**弹 antd `message.info`。仅 status bar 文字反馈即可（避免噪声）。 |
| D5 | 连接状态 | abort 时**不主动改** `connectionStatus`。`isQuerying` 复位为 false。前一状态（'connecting' / 'connected'）保持，UI 自然收敛。 |
| D6 | 取消机制 | `session.close()`，配合 `aborted` flag + `settled` flag（per net-snmp research）。主进程持有"当前 in-flight session"全局 ref，因 UI 单操作互斥。 |

## Requirements

- [R1] 主进程持有当前 in-flight SNMP session 的全局引用（`currentSession: snmp.Session | null`）。每次 `snmpGet / snmpGetNext / snmpGetBulk / snmpSet / snmpWalk / snmpBulkWalk` 在 `createSession` 之后立刻把 session 注册到这个 ref，在 resolve/reject 之前清空。
- [R2] `snmpWalk` / `snmpBulkWalk` 改造为支持 abort：
   - 函数内维护 `aborted: boolean` 和 `settled: boolean` 两个 flag
   - 主循环每次回调进入时先检查 `aborted` —— 是的话立即 resolve 为 `{ success: true, varbinds: collectedSoFar, aborted: true, ... }`，**不再发** `getNext` / `getBulk`
   - close 触发的 `Error("Socket forcibly closed")` callback 收到后，若 `aborted` 为 true 则按 abort 处理，否则按一般错误处理
   - 通过 `settled` flag 防止 Promise 重复 resolve
- [R3] `snmpGet` / `snmpGetNext` / `snmpGetBulk` / `snmpSet`：单次回调，同样要在 callback 入口检查 `aborted`，如果 close 在 in-flight 期间触发，按 abort 处理（返回 `{ success: true, varbinds: [], aborted: true, ... }`）。
- [R4] 新增 IPC：
   - `snmp:cancel` → `ipcMain.handle(...)` → 调主进程的 `cancelCurrentSnmpOperation()` 函数 → 若有 `currentSession` 则 try/catch `session.close()` 并设 `aborted = true`；若 currentSession 已 null（操作已完成 / 没在跑）则 no-op。返回 `boolean`（是否真的 cancel 了某个东西）。
   - preload 暴露 `window.api.snmp.cancel(): Promise<boolean>`
- [R5] `SnmpResult` 类型扩展可选字段 `aborted?: boolean`（默认 false / undefined）。
- [R6] 前端 status bar 增加 abort 按钮（图标 `StopOutlined` 或 `CloseCircleOutlined`），绑定 `isQuerying` 状态：true 时高亮可点，false 时 disabled / 灰。点击时调 `window.api.snmp.cancel()`。
- [R7] 前端各调用方（`QueryPanel.handleSend`、`MibTreePanel.executeSnmpOperation`、`SetMultiNodeDialog.handleSubmit`、`GetMultiNodeDialog.handleSubmit`）在收到 `result.aborted === true` 时：
   - 走"成功"路径写 `setResult` / `buildResultSession`（部分结果保留）
   - `setStatusMessage` 用 abort 文案（如 `${operation}: aborted at ${session.rows.length} rows, ${result.responseTime}ms`）
   - **不**调 `appMessage.error` / `appMessage.info`
   - **不**调 `setConnectionStatus`（保持现状）
- [R8] 主进程在每次 `createSession` 失败 / Promise reject 路径中也必须清空 `currentSession` ref，防止脏 ref 阻塞下次 abort 调用。
- [R9] 重复点 abort（在同一操作期间多次按 status bar 按钮）必须幂等：第一次有效，后续 no-op，不抛错（用 try/catch 包 `session.close()`）。

## Acceptance Criteria

- [ ] 触发一个慢 WALK（如 `1.3.6.1.2.1`），点 status bar abort → ≤ 1s 内操作停止
- [ ] Abort 后结果区显示已收集的部分行（不是空）
- [ ] Status bar 文本显示 `WALK: aborted at N rows, Xms`
- [ ] Abort 后 `isQuerying = false`，可以立即触发下一个操作
- [ ] Abort 按钮在 `isQuerying === false` 时是 disabled / 灰
- [ ] 操作 X 已完成（Promise 已 resolve）后点 abort → no-op，无异常
- [ ] 同一 abort 期间双击多次按钮 → 第一次生效，后续 no-op，不抛错
- [ ] BULK_WALK / GET / SET 也都能 abort（即便短操作可能 abort 前已返回）
- [ ] 主进程多次 abort 后无 session 句柄泄漏（手动观察）
- [ ] TypeScript / ESLint / Build 全绿

## Definition of Done

- typecheck / lint / build 全绿
- 手测：(1) WALK 大表中途 abort → 部分结果 + status bar 正常；(2) abort 后立刻发新操作不被卡；(3) 操作已完成后点 abort 无副作用；(4) 双击 abort 不崩
- 主进程 `currentSession` 在任何路径退出后都清空（review 时 trace 一遍 success / error / abort / sync-throw 四条路径）

## Out of Scope

- 多操作并发 + per-operation cancel token（前 UI 是 isQuerying 单 boolean 互斥；并发要的是另一套设计）
- Modal cancel 联动 abort（D2 明确：Modal cancel 仅关 modal，操作继续后台跑直到 status bar abort 或自然完成）
- Send / 提交按钮 loading → cancel 状态切换（D2 否决）
- 弹 `message.info` 提示（D4 否决）
- 操作进度条 / 已抓取行数实时显示
- 修改底层 net-snmp 行为以支持 per-request cancel（库不支持，且 close-only 已够用）

## Technical Approach

**主进程**（`src/main/snmp/client.ts`）：
- 顶部加 `let currentSession: ReturnType<typeof snmp.createSession> | null = null` 和 `let aborted = false`
- 加导出函数 `cancelCurrentSnmpOperation(): boolean`：
  ```typescript
  export function cancelCurrentSnmpOperation(): boolean {
    if (!currentSession) return false
    aborted = true
    try {
      currentSession.close()
    } catch (e) {
      // ERR_SOCKET_DGRAM_NOT_RUNNING — already closed; swallow
    }
    return true
  }
  ```
- 每个 `snmpXxx` 函数体改造：
  - `aborted = false` (reset at start)
  - `createSession` 之后 `currentSession = session`
  - 内部 callback 在每次进入时检查 `aborted` → 直接 resolve abort 路径
  - 任何 `resolve(...)` 之前用 `if (settled) return; settled = true; currentSession = null`
  - close-trigger 的 callback error 通过 `error.message === 'Socket forcibly closed'` 或简单地 `if (aborted) → resolve abort` 来识别

**IPC 与 preload**（`src/main/ipc/handlers.ts`、`src/preload/index.ts`）：
- 新增 `ipcMain.handle('snmp:cancel', () => cancelCurrentSnmpOperation())`
- preload 加 `cancel: (): Promise<boolean> => ipcRenderer.invoke('snmp:cancel')`

**类型**（`src/main/snmp/types.ts`、renderer mirror）：
- `SnmpResult` 加 `aborted?: boolean`

**前端**（`src/renderer/src/components/StatusBar.tsx`）：
- 在 left 区或合适位置加一个 abort 图标按钮
- 绑定 `useAppStore((s) => s.isQuerying)`：true → 启用 + 高亮；false → disabled / 灰
- onClick 调 `window.api.snmp.cancel()`，不需要本地额外状态

**前端调用方**（QueryPanel / MibTreePanel / SetMultiNodeDialog / GetMultiNodeDialog 共 4 处）：
- 在 `if (result.success)` 分支内，判断 `result.aborted`，按 abort 文案设置 status bar；不调 message 弹窗；不动 connectionStatus

## Decision (ADR-lite)

**Context**: net-snmp v3 没有 per-request cancel API；`session.close()` 是唯一中止机制。当前 UI 单操作互斥（isQuerying boolean），所以不需要 token-based cancel。

**Decision**:
1. 主进程持有单全局 `currentSession` ref
2. `cancelCurrentSnmpOperation()` 通过 close + `aborted` flag 协作
3. UI 仅在 status bar 加一个全局 abort 入口
4. 部分结果保留 + status bar 文本反馈

**Consequences**:
- ✅ 实现简单，不引入并发 cancel 框架
- ✅ 与 net-snmp 库的 close-only 机制天然契合
- ✅ UI 一致（所有操作同一个 abort 入口）
- ⚠️ Modal 关了操作仍后台跑 —— 用户必须去 status bar abort，**这是 D2 明确选择**
- ⚠️ 单 session ref 假设了"前 UI 单操作互斥"，未来要并发 SNMP ops 必须先重做这层（加 token map）

## Implementation Plan (small PRs)

- **PR1 主进程 + IPC + preload**: client.ts 加 `currentSession` ref + `aborted` flag + `cancelCurrentSnmpOperation()` + 6 个 snmpXxx 函数体改造；handlers.ts 注册 `snmp:cancel`；preload 暴露 `window.api.snmp.cancel`；types.ts 加 `aborted?: boolean`。typecheck + lint + build 三检。
- **PR2 StatusBar abort 按钮**: 改 `StatusBar.tsx`，按 isQuerying 状态显示 / 启用 / 禁用 abort 按钮，onClick 调 cancel。三检。
- **PR3 前端 4 处调用方处理 result.aborted**: QueryPanel、MibTreePanel.executeSnmpOperation、SetMultiNodeDialog.handleSubmit、GetMultiNodeDialog.handleSubmit 都加 abort 分支（保留部分结果 + status bar 文本）。三检 + 手测。

## Research References

- [`research/net-snmp-cancel-api.md`](research/net-snmp-cancel-api.md) — net-snmp 的 close-only 取消机制 + 推荐的 aborted/settled flag 模式

## Technical Notes

**net-snmp 取消机制（research 结论，详见 [`research/net-snmp-cancel-api.md`](research/net-snmp-cancel-api.md)）**：
- `session.close()` 是 net-snmp v3.26.3 **唯一**的取消机制 —— 没有 per-request cancel API
- 关闭后底层 UDP socket 关闭；所有 pending request callbacks 在下一 tick 收到一个 plain `Error("Socket forcibly closed")`
- **实现要点**：walk loop 必须用一个 `aborted: boolean` flag + `settled: boolean` flag 协作
   - `aborted` flag：被取消时由外部设置，loop 检测到就 resolve 为 "aborted" 状态而非 "error"
   - `settled` flag：防止 Promise 多次 resolve（close 后 pending callback 还会触发一次）
   - 关掉之后**不要再发** `getNext` / `getBulk`（socket 已 close）—— 让最后一个 in-flight callback 收到 close error 自然终止 loop
- `session.close()` 调用两次会抛 `ERR_SOCKET_DGRAM_NOT_RUNNING` —— 必须 try/catch
- 一个 session close 后不能复用（当前 `client.ts` 已经是 per-call createSession，符合）

**架构层**：
- IPC 需要新增一个 `snmp:cancel` 通道（invoke 即可，返回 boolean / void）
- 主进程要持有"当前 in-flight session" 的句柄。**单 session ref 全局变量**就够用（前提：UI 单操作互斥 = 现状），不需要 token-based map
- preload 暴露 `window.api.snmp.cancel()`
- 前端在 UI 上挂 abort 入口（位置 TBD）

## Research References

- [`research/net-snmp-cancel-api.md`](research/net-snmp-cancel-api.md) — net-snmp 的 close-only 取消机制 + 推荐的 aborted/settled flag 模式
