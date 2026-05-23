import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, App, Empty, Space, Button, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import type { MibTreeNodeData, ResultSession } from '../../types'
import type { SnmpSetValue } from '../../../../main/snmp/types'
import { buildResultSession } from '../../utils/resultColumns'
import { useSetRows } from './useSetRows'
import { SetRow } from './SetRow'
import {
  buildFullOid,
  stripBaseOid,
  validateRow,
  isDuplicate
} from './rowUtils'
import type { SetRowError } from './types'
import type { SetRowPatch } from './types'

/**
 * Lift a varbind's `value` (string | number | Buffer-shaped | null) into a
 * display string suitable for the read-only "current value" cell. Mirrors
 * the IPC-Buffer handling already in resultColumns.formatVarbindValue —
 * we don't import that one because it isn't exported.
 */
function formatCurrentValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      try {
        return String.fromCharCode(...(obj.data as number[]))
      } catch {
        return JSON.stringify(obj.data)
      }
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

interface SetMultiNodeDialogProps {
  /** When non-null, dialog is open and seeded with this node as the first row. */
  initialNode: MibTreeNodeData | null
  onClose: () => void
}

/**
 * Multi-node SET dialog. Replaces the old single-node SET modal in
 * MibTreePanel. Lifecycle:
 *  - `initialNode` flips from null -> node: open dialog, seed first row.
 *  - User can drag additional tree nodes into the dialog body (drop zone
 *    reads `pendingDragNode` from the app store).
 *  - Per-row: edit Instance / type / target value; click buttons to walk
 *    instances or GET the current value.
 *  - "执行 SET" composes a single multi-varbind SNMP SET request.
 */
export function SetMultiNodeDialog({ initialNode, onClose }: SetMultiNodeDialogProps): React.ReactElement {
  const { message: appMessage } = App.useApp()
  const snmpConfig = useAppStore((s) => s.snmpConfig)
  const mibTree = useAppStore((s) => s.mibTree)
  const setResult = useAppStore((s) => s.setResult)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  const pendingDragNode = useAppStore((s) => s.pendingDragNode)
  const setPendingDragNode = useAppStore((s) => s.setPendingDragNode)

  const { rows, append, remove, patch, move, reset } = useSetRows()
  const [isDragOver, setIsDragOver] = useState(false)
  const [instanceFetchingId, setInstanceFetchingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const open = initialNode !== null

  // Seed the first row when the dialog opens. Clear rows when it closes
  // so re-opening starts fresh (matches the old modal's destroyOnClose).
  // Depends only on initialNode — reset/append are stable refs.
  useEffect(() => {
    if (initialNode) {
      reset()
      append(initialNode)
    } else {
      reset()
    }
  }, [initialNode, reset, append])

  // If the user deletes the very last row, the dialog has nothing to act
  // on. Close so they're not stuck staring at an empty modal.
  useEffect(() => {
    if (open && rows.length === 0 && initialNode !== null) {
      // initial seed not yet applied — bail out
      return
    }
    if (open && rows.length === 0) {
      onClose()
    }
  }, [rows.length, open, initialNode, onClose])

  // Per-row first-error map for inline error display.
  const errorsByRow = useMemo<Record<string, SetRowError>>(() => {
    const map: Record<string, SetRowError> = {}
    for (const r of rows) {
      const err = validateRow(r)
      if (err) map[r.rowId] = err
    }
    return map
  }, [rows])

  const handleAppend = useCallback((node: MibTreeNodeData) => {
    if (isDuplicate(rows, node)) {
      appMessage.info(`节点已在列表中：${node.name}`)
      return
    }
    append(node)
  }, [rows, append, appMessage])

  // ── drag from MIB tree ────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!pendingDragNode) return
    e.preventDefault()
    setIsDragOver(true)
  }, [pendingDragNode])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const node = pendingDragNode
    setPendingDragNode(null)
    if (!node) return
    if (!node.oid) {
      appMessage.warning('该节点没有 OID')
      return
    }
    handleAppend(node)
  }, [pendingDragNode, setPendingDragNode, appMessage, handleAppend])

  // ── row actions ───────────────────────────────────────────────────────
  const fetchInstances = useCallback(async (rowId: string) => {
    const row = rows.find((r) => r.rowId === rowId)
    if (!row) return
    setInstanceFetchingId(rowId)
    try {
      const result = await window.api.snmp.walk(snmpConfig, row.node.oid)
      if (!result.success) {
        appMessage.error(`获取实例失败：${result.error}`)
        return
      }
      const suffixes = (result.varbinds || [])
        .map((vb) => stripBaseOid(vb.oid, row.node.oid))
        .filter((s) => s.length > 0)
      const dedup = Array.from(new Set(suffixes))
      if (dedup.length === 0) {
        appMessage.info('未发现实例，请手动输入')
      }
      patch(rowId, { instanceOptions: dedup })
    } catch (err) {
      appMessage.error(`请求失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstanceFetchingId(null)
    }
  }, [rows, snmpConfig, patch, appMessage])

  /**
   * GET the current value for one row. Two opt-ins via `options`:
   *  - `instanceOverride`: use a freshly-picked instance suffix instead of
   *    waiting for state to settle.
   *  - `applyToTarget`: also overwrite `targetValue` with the returned
   *    text. Used by the "fetch current → fill target" buttons so the user
   *    has a one-click "edit from current" flow.
   */
  const fetchCurrentValue = useCallback(async (
    rowId: string,
    options: { instanceOverride?: string; applyToTarget?: boolean } = {}
  ) => {
    const row = rows.find((r) => r.rowId === rowId)
    if (!row) return
    const effectiveInstance = options.instanceOverride ?? row.instance
    const fullOid = buildFullOid(row.node.oid, effectiveInstance)
    patch(rowId, { currentValue: { state: 'loading' } })
    try {
      const result = await window.api.snmp.get(snmpConfig, [fullOid])
      if (!result.success) {
        patch(rowId, { currentValue: { state: 'err', error: result.error || 'unknown' } })
        appMessage.error(`GET 失败：${result.error}`)
        return
      }
      const vb = result.varbinds?.[0]
      if (!vb) {
        patch(rowId, { currentValue: { state: 'err', error: 'empty varbind' } })
        return
      }
      const text = formatCurrentValue(vb.value)
      const next: SetRowPatch = { currentValue: { state: 'ok', text } }
      if (options.applyToTarget) next.targetValue = text
      patch(rowId, next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      patch(rowId, { currentValue: { state: 'err', error: msg } })
      appMessage.error(`请求失败：${msg}`)
    }
  }, [rows, snmpConfig, patch, appMessage])

  // ── submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (rows.length === 0) return
    const firstErr = Object.values(errorsByRow)[0]
    if (firstErr) {
      appMessage.warning(`第 ${rows.findIndex((r) => r.rowId === firstErr.rowId) + 1} 行：${firstErr.message}`)
      return
    }
    const values: SnmpSetValue[] = rows.map((r) => ({
      oid: buildFullOid(r.node.oid, r.instance),
      value: r.targetValue,
      type: r.type
    }))

    setSubmitting(true)
    setIsQuerying(true)
    setResult(null)
    setConnectionStatus('connecting')
    setStatusMessage(`Executing SET on ${values.length} varbind(s)...`)
    try {
      const result = await window.api.snmp.set(snmpConfig, values)
      if (result.success) {
        setConnectionStatus('connected')
        const session: ResultSession = buildResultSession('SET', values[0].oid, result, mibTree)
        setResult(session)
        const baseMsg = `SET: ${session.rows.length} result(s), ${result.responseTime}ms`
        setStatusMessage(
          session.rows.length === 0 ? `${baseMsg} — 本次操作结果为空` : baseMsg
        )
        appMessage.success(`SET succeeded (${values.length} varbind${values.length > 1 ? 's' : ''})`)
        onClose()
      } else {
        setConnectionStatus('error')
        appMessage.error(`SNMP error: ${result.error}`)
        setStatusMessage(`Error: ${result.error}`)
      }
    } catch (err) {
      setConnectionStatus('error')
      const msg = err instanceof Error ? err.message : String(err)
      appMessage.error(`Request failed: ${msg}`)
      setStatusMessage(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
      setIsQuerying(false)
    }
  }, [
    rows,
    errorsByRow,
    snmpConfig,
    mibTree,
    setResult,
    setConnectionStatus,
    setStatusMessage,
    setIsQuerying,
    appMessage,
    onClose
  ])

  return (
    <Modal
      title={
        <Space>
          <span>SET 多节点</span>
          <Tag color="blue">共 {rows.length} 行</Tag>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={960}
      destroyOnClose
      // No mask — the dialog needs to coexist with the MIB tree so the user
      // can keep dragging more nodes in while it's open. With the default
      // mask the tree underneath becomes non-interactive.
      mask={false}
      maskClosable={false}
      // Confine fixed positioning + allow page-level interactions when the
      // dialog is open. Without this antd v6 still wraps a transparent
      // wrapper that can swallow pointer events outside the panel.
      wrapClassName="set-multi-node-dialog-wrap"
      style={{ top: 80 }}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>取消</Button>,
        <Button
          key="ok"
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleSubmit}
          loading={submitting}
          disabled={rows.length === 0}
        >
          执行 SET ({rows.length})
        </Button>
      ]}
    >
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: isDragOver ? '2px dashed #1677ff' : '1px dashed #d9d9d9',
          borderRadius: 6,
          padding: 8,
          backgroundColor: isDragOver ? '#e6f4ff' : '#fafafa',
          minHeight: 80,
          marginBottom: 8,
          fontSize: 12,
          color: '#666',
          textAlign: 'center'
        }}
      >
        {isDragOver
          ? '松开以追加节点'
          : '从左侧 MIB 树拖拽节点到此处可追加为新行'}
      </div>

      {rows.length === 0 ? (
        <Empty description="尚无节点" />
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <th style={{ padding: '6px 4px', width: 36, fontSize: 12, color: '#666' }}>#</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: 12, color: '#666' }}>节点</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: 12, color: '#666' }}>Instance</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: 12, color: '#666' }}>类型</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: 12, color: '#666' }}>目标值</th>
                <th style={{ padding: '6px 4px', textAlign: 'right', fontSize: 12, color: '#666' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <SetRow
                  key={row.rowId}
                  index={idx}
                  total={rows.length}
                  row={row}
                  rowError={errorsByRow[row.rowId]}
                  disabled={submitting}
                  onPatch={(p) => patch(row.rowId, p)}
                  onRemove={() => remove(row.rowId)}
                  onMove={(dir) => move(row.rowId, dir)}
                  onFetchInstances={() => fetchInstances(row.rowId)}
                  onFetchCurrentValue={(opts) => fetchCurrentValue(row.rowId, opts)}
                  instanceFetching={instanceFetchingId === row.rowId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
