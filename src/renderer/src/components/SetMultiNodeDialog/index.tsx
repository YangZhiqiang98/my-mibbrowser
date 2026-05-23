import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, App, Empty, Space, Button, Tag } from 'antd'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { PlusOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import type { MibTreeNodeData, ResultSession } from '../../types'
import type { SnmpSetValue } from '../../../../main/snmp/types'
import { buildResultSession } from '../../utils/resultColumns'
import { useDraggableModal } from '../useDraggableModal'
import { useSetRows } from './useSetRows'
import { SetRow } from './SetRow'
import {
  buildFullOid,
  stripBaseOid,
  validateRow,
  isDuplicate
} from './rowUtils'
import type { SetRowError } from './types'
import type { SetRowPatch, SetSeed } from './types'

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
  /**
   * When non-null, dialog is open and the first row is seeded from this.
   * `instance` and `targetValue` are optional pre-fills (used by the GET
   * dialog's "转为 SET" handoff). When omitted the row defaults to
   * instance='0' / targetValue=''.
   */
  initialSeed: SetSeed | null
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
export function SetMultiNodeDialog({ initialSeed, onClose }: SetMultiNodeDialogProps): React.ReactElement {
  const { message: appMessage } = App.useApp()
  const snmpConfig = useAppStore((s) => s.snmpConfig)
  const mibTree = useAppStore((s) => s.mibTree)
  const setResult = useAppStore((s) => s.setResult)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  const pendingDragNode = useAppStore((s) => s.pendingDragNode)
  const setPendingDragNode = useAppStore((s) => s.setPendingDragNode)

  const { rows, append, remove, patch, moveTo, reset } = useSetRows()
  const [isDragOver, setIsDragOver] = useState(false)
  const [instanceFetchingId, setInstanceFetchingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const open = initialSeed !== null
  const draggableModal = useDraggableModal(open)

  // Seed the first row when the dialog opens. Clear rows when it closes
  // so re-opening starts fresh (matches the old modal's destroyOnClose).
  // Depends only on initialSeed — reset/append/patch are stable refs.
  useEffect(() => {
    if (initialSeed) {
      reset()
      const row = append(initialSeed.node)
      const overrides: SetRowPatch = {}
      if (initialSeed.instance !== undefined) overrides.instance = initialSeed.instance
      if (initialSeed.targetValue !== undefined) overrides.targetValue = initialSeed.targetValue
      if (Object.keys(overrides).length > 0) {
        patch(row.rowId, overrides)
      }
    } else {
      reset()
    }
  }, [initialSeed, reset, append, patch])

  // If the user deletes the very last row, the dialog has nothing to act
  // on. Close so they're not stuck staring at an empty modal.
  useEffect(() => {
    if (open && rows.length === 0 && initialSeed !== null) {
      // initial seed not yet applied — bail out
      return
    }
    if (open && rows.length === 0) {
      onClose()
    }
  }, [rows.length, open, initialSeed, onClose])

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

  const handleSortEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    moveTo(String(active.id), String(over.id))
  }, [moveTo])

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
        if (result.aborted) {
          // User-cancelled path. Even though SET is single-shot, the abort
          // flag may still arrive (close() raced the callback). Persist any
          // varbinds the device echoed and label the status bar accordingly.
          // No connectionStatus mutation (D5), no message toast (D4), and
          // crucially no onClose() — keep the dialog open so the user can see
          // what they cancelled and either retry or close it themselves.
          const session: ResultSession = buildResultSession('SET', values[0].oid, result, mibTree)
          setResult(session)
          setStatusMessage(
            `SET: aborted at ${session.rows.length} row(s), ${result.responseTime}ms`
          )
        } else {
          setConnectionStatus('connected')
          const session: ResultSession = buildResultSession('SET', values[0].oid, result, mibTree)
          setResult(session)
          const baseMsg = `SET: ${session.rows.length} result(s), ${result.responseTime}ms`
          setStatusMessage(
            session.rows.length === 0 ? `${baseMsg} — 本次操作结果为空` : baseMsg
          )
          appMessage.success(`SET succeeded (${values.length} varbind${values.length > 1 ? 's' : ''})`)
          onClose()
        }
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
        <Space className="non-modal-dialog-title" {...draggableModal.titleProps}>
          <span>SET 多节点</span>
          <Tag color="blue">共 {rows.length} 行</Tag>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={900}
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
      rootClassName="set-multi-node-dialog-root"
      modalRender={draggableModal.modalRender}
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
            <SortableContext items={rows.map((row) => row.rowId)} strategy={verticalListSortingStrategy}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <th style={{ padding: '6px 4px', width: 32, fontSize: 12, color: '#666' }} />
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
                      row={row}
                      rowError={errorsByRow[row.rowId]}
                      disabled={submitting}
                      onPatch={(p) => patch(row.rowId, p)}
                      onRemove={() => remove(row.rowId)}
                      onFetchInstances={() => fetchInstances(row.rowId)}
                      onFetchCurrentValue={(opts) => fetchCurrentValue(row.rowId, opts)}
                      instanceFetching={instanceFetchingId === row.rowId}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </Modal>
  )
}
