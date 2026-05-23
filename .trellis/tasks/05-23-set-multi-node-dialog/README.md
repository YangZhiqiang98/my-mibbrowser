---
id: 05-23-set-multi-node-dialog
title: 多节点 SET 对话框（拖拽 + Instance + 当前值）
status: planning
priority: P2
owner: yzq
created: 2026-05-23
layers: [frontend]
---

# 多节点 SET 对话框

## 目标
完全替换现有的单节点 SET 模态，提供一个支持**多节点同时设置 + 拖拽编排 + Instance 协助 + 当前值回填**的对话框。原子化下发到后端 (`snmpSet` 已原生支持多 varbind)。

## 触发入口
- MIB Tree 节点右键菜单 → `SET`（替换旧入口；只要节点有 OID 即可，多个时通过对话框追加）。
- 对话框打开后可继续把其它节点从树上拖入。

## 文档
- [prd.md](./prd.md) — 需求与交互细节（待补充）
- [tech_design.md](./tech_design.md) — 组件拆分与 IPC 复用（待补充）
- [task_list.md](./task_list.md) — 实施步骤（待补充）

## 关键决策（已对齐）
1. **替换旧 SET 模态**：右键 SET 直接打开新对话框，单/多节点均走同一流程。
2. **Instance 获取**：默认手输后缀；提供"获取实例"按钮触发该节点 OID 的 walk，结果以下拉形式供选。
3. **当前值获取**：每行单独按钮触发单个 GET，回填到"目标值"输入框作为起点。
4. **批量执行**：一次 SNMP SET 请求带多个 varbind（原子化）。后端无需改造。

## Out of Scope
- 不做"批量取消"等导致部分提交的回滚逻辑（SNMP SET 本身原子）。
- 不做 SET 模板保存/复用（后续可加）。
- 不引入新的 IPC 通道，复用现有 `window.api.snmp.set / get / walk`。
