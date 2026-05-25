# fix-table-viewer-formatter-parity-with-results

## Goal

让 Table Viewer 的值格式化行为与 Results Panel 保持一致，消除两者之间的显示差异。

## What I already know

* Table Viewer 使用 `tableSession.ts:formatTableValue()` — 简单格式化，无 SNMP 类型感知
* Results Panel 使用 `resultColumns.ts:formatVarbindValue()` + `formatBytes.ts:formatBytesToString()` — 类型感知，丰富格式化
* 两者的主进程预格式化相同（`client.ts:formatVarbindValue()`）
* 关键差异：

| 维度 | Table Viewer | Results Panel |
|------|-------------|---------------|
| TimeTicks | 原始整数 `12345678` | 美化 `1d 10h 17m 36.78s` |
| IpAddress | 可能显示 hex | 点分十进制 |
| 可打印阈值 | 80% | 70% |
| 文本解码 | `String.fromCharCode` (逐字节) | `TextDecoder` (正确 UTF-8) |
| HEX/ASCII 切换 | 无 | 有 |
| 类型感知 | 无 SNMP type 参数 | 有，按类型处理 |

## Assumptions (temporary)

* 修复应以 Results Panel 的格式化逻辑为"真相源"
* Table Viewer 的 formatter 需要接收 SNMP type 信息才能对齐
* `formatBytes.ts:formatBytesToString()` 是共享工具，Table Viewer 应复用它

## Requirements

* Table Viewer 的 TimeTicks 显示必须与 Results Panel 一致（美化格式）
* Table Viewer 的 IpAddress 显示必须与 Results Panel 一致（点分十进制）
* Table Viewer 的 OCTET STRING 解码必须使用正确的 UTF-8 TextDecoder
* Table Viewer 的可打印阈值应对齐到 70%
* 复用 `formatBytes.ts:formatBytesToString()` 共享工具函数
* Table Viewer 的 OCTET STRING 单元格需要支持 HEX/ASCII 切换按钮

## Acceptance Criteria

* [ ] TimeTicks 在 Table Viewer 中显示为 `Xd Xh Xm X.XXs` 格式
* [ ] IpAddress 在 Table Viewer 中正确显示为点分十进制
* [ ] OCTET STRING 使用 TextDecoder 解码，70% 可打印阈值
* [ ] OCTET STRING 单元格支持 HEX/ASCII 切换（参考 Results Panel 实现）
* [ ] Results Panel 行为不变（回归测试）

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes

## Out of Scope

* 重构 Results Panel 的格式化逻辑
* 改变主进程的 `formatVarbindValue()`
* Enum 名称解析（两个面板目前都没有实现）

## Technical Notes

* **文件**:
  * `src/renderer/src/utils/tableSession.ts` — `formatTableValue()` (line 156-177)
  * `src/renderer/src/utils/resultColumns.ts` — `formatVarbindValue()` (line 137-167)
  * `src/renderer/src/utils/formatBytes.ts` — `formatBytesToString()` (共享)
  * `src/renderer/src/components/TableViewer/TableViewerContent.tsx`
* **关键问题**: `formatTableValue()` 当前不接收 SNMP type 参数，需要修改调用链传入 type 信息
* **之前的修复**: `ea097a4` 已经修复了 scalar 列不显示值的问题，确保 Table Viewer 能正确获取数据
