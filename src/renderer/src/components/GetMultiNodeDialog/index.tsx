import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, App, Empty, Space, Button, Tag } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import type { MibTreeNodeData, ResultSession } from '../../types'
import { buildResultSession } from '../../utils/resultColumns'
import { buildFullOid, stripBaseOid } from '../SetMultiNodeDialog/rowUtils'
import { useGetRows } from './useGetRows'
import { GetRow } from './GetRow'
import { validateGetRow, isDuplicate } from './rowUtils'
import type { GetRowError } from './types'

interface GetMultiNodeDialogProps {
  /**
   * Non-null = open dialog with this node as the first row. Right-click GET
   * passes the raw MibTreeNodeData (not a seed object) because GET has no
   * instance/targetValue pre-fill to carry across — the user picks instance
   * inside the dialog.
   */
  initialNode: MibTreeNodeData | null
  onClose: () => void
}

/**
 * Multi-node GET dialog. Replaces the earlier single-node GET modal.
 * Lifecycle:
 *  - `initialNode` flips from null -> node: open dialog, seed first row.
 *  - User can drag additional tree nodes into the drop zone to append rows.
 *  - Per-row: edit Instance, run "获取实例" (walk for suffix options),
 *    reorder, or delete.
 *  - "执行 GET" composes a single multi-OID `snmp.get` and writes the result
 *    to the main result panel. The dialog stays open afterwards so the user
 *    can adjust instance / add or remove rows and fire again (PRD R15).
 */
export function GetMultiNodeDialog({ initialNode, onClose }: GetMultiNodeDialogProps): React.ReactElement {
  const { message: appMessage } = App.useApp()
  const snmpConfig = useAppStore((s) => s.snmpConfig)
  const mibTree = useAppStore((s) => s.mibTree)
  const setResult = useAppStore((s) => s.setResult)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  // antd Tree's draggable callback does not expose native DataTransfer
  // (rc-tree wraps it), so the MIB tree routes the dragged node through
  // the app store and we read it back here. Same bridge SetMultiNodeDialog
  // uses — see MibTreePanel.handleTreeDragStart for the producer side.
  const pendingDragNode = useAppStore((s) => s.pendingDragNode)
  const setPendingDragNode = useAppStore((s) => s.setPendingDragNode)

  const { rows, append, remove, patch, move, reset } = useGetRows()
  const [isDragOver, setIsDragOver] = useState(false)
  const [instanceFetchingId, setInstanceFetchingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const open = initialNode !== null

  // Seed the first row when the dialog opens. Clear rows when it closes so
  // re-opening starts fresh (matches the old modal's destroyOnClose).
  // Depends only on initialNode — reset/append are stable refs.
  useEffect(() => {
    if (initialNode) {
      reset()
      append(initialNode)
    } else {
      reset()
    }
  }, [initialNode, reset, append])

  // If the user deletes the very last row the dialog has nothing to act on.
  // Close so they're not stuck staring at an empty modal.
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
  const errorsByRow = useMemo<Record<string, GetRowError>>(() => {
    const map: Record<string, GetRowError> = {}
    for (const r of rows) {
      const err = validateGetRow(r)
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

  // ── submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (rows.length === 0) return
    const firstErr = Object.values(errorsByRow)[0]
    if (firstErr) {
      appMessage.warning(`第 ${rows.findIndex((r) => r.rowId === firstErr.rowId) + 1} 行：${firstErr.message}`)
      return
    }
    const oids = rows.map((r) => buildFullOid(r.node.oid, r.instance))

    setSubmitting(true)
    setIsQuerying(true)
    setResult(null)
    setConnectionStatus('connecting')
    setStatusMessage(`Executing GET on ${oids.length} OID(s)...`)
    try {
      const result = await window.api.snmp.get(snmpConfig, oids)
      if (result.success) {
        if (result.aborted) {
          // User-cancelled path. GET is single-shot but close() may still
          // race the callback; if so, keep whatever varbinds came back and
          // surface "aborted at N rows" on the status bar. No
          // connectionStatus mutation (D5), no message toast (D4), and no
          // onClose() — the dialog stays open the same way the success path
          // does so the user can retry.
          const session: ResultSession = buildResultSession('GET', oids[0], result, mibTree)
          setResult(session)
          setStatusMessage(
            `GET: aborted at ${session.rows.length} row(s), ${result.responseTime}ms`
          )
        } else {
          setConnectionStatus('connected')
          // First OID is the "primary" — buildResultSession uses it for the
          // session title only; all varbinds in the response are still rendered.
          const session: ResultSession = buildResultSession('GET', oids[0], result, mibTree)
          setResult(session)
          const baseMsg = `GET: ${session.rows.length} result(s), ${result.responseTime}ms`
          setStatusMessage(
            session.rows.length === 0 ? `${baseMsg} — 本次操作结果为空` : baseMsg
          )
          appMessage.success(`GET succeeded (${oids.length} OID${oids.length > 1 ? 's' : ''})`)
          // Intentionally NOT calling onClose() — keep the dialog open so the
          // user can tweak instance / add or remove rows and fire again
          // without re-opening (PRD D7 / R15).
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
    appMessage
  ])

  return (
    <Modal
      title={
        <Space>
          <span>GET 多节点</span>
          <Tag color="blue">共 {rows.length} 行</Tag>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnClose
      // No mask — coexist with the MIB tree underneath so the user can keep
      // dragging more nodes into the drop zone while the dialog is open.
      // Same pattern as SetMultiNodeDialog.
      mask={false}
      maskClosable={false}
      wrapClassName="get-multi-node-dialog-wrap"
      style={{ top: 80 }}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>取消</Button>,
        <Button
          key="ok"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          loading={submitting}
          disabled={rows.length === 0}
        >
          执行 GET ({rows.length})
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
                <th style={{ padding: '6px 4px', textAlign: 'right', fontSize: 12, color: '#666' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <GetRow
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
