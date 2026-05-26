# streaming-snmp-results-to-results-panel

## Goal

让 WALK/BULK_WALK 操作的结果在获取过程中逐步推送到 Results Panel，而不是等待全部完成后一次性显示。用户可以看到数据逐行追加，与专业 MIB 浏览器体验一致。

## What I already know

### 当前数据管道
1. UI 调用 `window.api.snmp.walk(config, oid)` → `ipcRenderer.invoke('snmp:walk')`
2. 主进程 `snmpWalk()` 内部循环 `session.getNext()`，累积所有 varbinds
3. 全部完成后 resolve Promise，通过 IPC 返回给渲染进程
4. 渲染进程一次性 `buildResultSession()` + `setResult()`
5. Results Panel 显示完整结果

### 关键文件
- `src/main/snmp/client.ts` — SNMP 客户端，WALK (652-791) / BULK_WALK (796-929)
- `src/main/ipc/handlers.ts` — IPC 处理器（`handleSnmpWalk` 第 507 行起）
- `src/preload/index.ts` — IPC 桥接
- `src/renderer/src/stores/appStore.ts` — Zustand 状态管理
- `src/renderer/src/components/QueryPanel.tsx` — UI 触发操作（`handleSend` 第 46 行起）
- `src/renderer/src/components/ResultsPanel.tsx` — 结果展示（虚拟滚动日志视图）
- `src/renderer/src/utils/resultColumns.ts` — `buildResultSession()` 批量构建逻辑

### 代码调研发现
1. **WALK 回调天然流式**: `snmpWalk` 的 callback 每次 `getNext` 返回 1 个 varbind；`snmpBulkWalk` 每次 `getBulk` 返回 N 个 (N = maxRepetitions)。数据已在逐步产生，只是没有推送
2. **IPC handler 已有 event.sender**: `handleSnmpWalk(_event: IpcMainInvokeEvent, ...)` — 去掉 `_` 前缀即可用 `event.sender.send()` 向渲染进程推送事件
3. **snmpTool 已有事件模式先例**: preload 中 `onContextUpdated` 使用 `ipcRenderer.on` + 返回 unsubscribe 函数
4. **resolveVarbindNames 是模块级函数**: handlers.ts 中的 `resolveVarbindNames()` 使用闭包 `mibNodes`，可在流式回调中复用
5. **buildResultSession 可拆分**: `flattenMibTree()` 可预计算一次，`resolveOidToColumn()` + `formatVarbindValue()` 可按 varbind 增量调用

### 关键约束
- 全局 `currentSession` 意味着同时只能有一个 SNMP 操作
- 取消机制已有（`abortRequested`），保留部分结果
- `net-snmp` 库用回调模式，天然适合增量推送
- ResultsPanel 使用虚拟滚动（`LINE_HEIGHT=22`, `OVERSCAN=10`），大量数据追加时性能可控

## Open Questions

_None remaining — all resolved by code inspection._

## Requirements (confirmed)

* WALK/BULK_WALK 每获取一批 varbinds 就推送到渲染进程
* 渲染进程逐步追加到 Results Panel 日志视图
* 状态栏实时显示已获取数量（如 "WALK: 47 result(s)..."）
* 流式追加时自动滚到底部；用户手动上滚时暂停自动滚动，滚回底部时恢复
* 查询进行中时显示加载指示器（Spin）
* 取消操作时保留已展示的部分结果
* 完成时显示结束标记和统计信息

## Acceptance Criteria (confirmed)

* [ ] WALK/BULK_WALK 结果逐步出现在 Results Panel（不等全部完成）
* [ ] 查询进行中可看到已返回的数据
* [ ] 状态栏实时更新已获取数量
* [ ] 自动滚动到新数据；用户上滚时暂停，滚回底部时恢复
* [ ] 取消时保留已显示的部分结果，显示 abort 结束标记
* [ ] 完成时显示结束标记和统计信息
* [ ] GET/GETNEXT/GETBULK/SET 操作不受影响

## Definition of Done

* Tests added/updated
* Lint / typecheck / CI green
* GET/GETNEXT/SET 等操作不受影响

## Out of Scope (explicit)

* GET/GETNEXT/SET 操作改造（这些本身就是单次返回，无需流式）
* 查询历史保留 / 多 session
* 多操作并发
* Tool window 流式推送（仅主窗口 Results Panel）

## Technical Approach

### IPC 模式：混合模式（invoke + event sender）

保留 `invoke/handle` 发起请求（错误处理），利用 `event.sender.send()` 推送进度事件：

```
Renderer                          Main Process
  │                                   │
  ├── invoke('snmp:walk') ──────────► │
  │                                   ├── snmpWalk(config, oid, { onProgress })
  │                                   │     └── callback 每批 varbinds:
  │  ◄── sender.send('snmp:walk-progress') │
  │  ◄── sender.send('snmp:walk-progress') │
  │  ◄── sender.send('snmp:walk-progress') │
  │                                   │     └── walk 结束:
  │  ◄── Promise resolve ───────────── │
```

### 各层改动

**1. `src/main/snmp/client.ts`** — snmpWalk/snmpBulkWalk 添加 `onProgress` 回调
- 新增可选参数 `onProgress?: (varbinds: SnmpVarbind[]) => void`
- 在 callback 循环中，每收集一批 varbinds 后调用 `onProgress(newBatch)`
- 不改变现有 Promise resolve 语义

**2. `src/main/ipc/handlers.ts`** — 流式转发 + OID 名称解析
- `handleSnmpWalk` 解开 `_event`，传入 `onProgress` 回调
- 回调内：`resolveVarbindNames(batch)` → `event.sender.send('snmp:walk-progress', batch)`
- 完成时 resolve Promise 正常返回最终结果

**3. `src/preload/index.ts`** — 添加事件监听
- `snmp.onWalkProgress(callback): () => void` — 监听进度，返回 unsubscribe
- `snmp.removeWalkListeners()` — 清理所有监听器

**4. `src/renderer/src/stores/appStore.ts`** — 增量更新
- 新增 `appendResultVarbinds(varbinds: ResultVarbind[])` action
- 新增 `initResultSession(operation, rootOid)` action — 创建空 session

**5. `src/renderer/src/components/QueryPanel.tsx`** — 流式消费
- WALK/BULK_WALK 分支：先订阅 `onWalkProgress`，再 `invoke`
- progress 回调：将 raw varbinds 转换为 ResultVarbind（复用 `resolveOidToColumn`），`appendResultVarbinds`
- invoke 返回后：最终化 session（设置 responseTime、error 等）

**6. `src/renderer/src/components/ResultsPanel.tsx`** — 自动滚动
- 新增 `isAutoScroll` state（默认 true）
- 每次收到新数据且 isAutoScroll=true 时，scrollContainerRef.current.scrollTop = scrollHeight
- onScroll 检测：距底部 > 阈值 → isAutoScroll=false；距底部 ≤ 阈值 → isAutoScroll=true
- streaming 时 Spin 指示器保持显示（不遮挡已有数据）

### 流式 varbinds 的 OID 解析

`buildResultSession` 当前批量调用 `flattenMibTree()` + 对每个 varbind 调用 `resolveOidToColumn()`。
拆分为：
- `initResolveContext(mibTree)` → 预计算扁平化 MIB 树（一次）
- `resolveVarbind(varbind, context, index)` → 单条 varbind 转换为 ResultVarbind（增量）

QueryPanel 在流式开始时创建 context，每次 progress 复用。
