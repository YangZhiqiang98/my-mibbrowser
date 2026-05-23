import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Empty, Space, Tag } from 'antd'
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
import { PlusOutlined, SendOutlined } from '@ant-design/icons'
import type { SnmpSetValue } from '../../../../main/snmp/types'
import type { SnmpToolWindowContext, ToolWindowSetSeed } from '../../../../shared/toolWindowTypes'
import type { MibTreeNodeData, ResultSession } from '../../types'
import { buildResultSession } from '../../utils/resultColumns'
import {
  consumeToolWindowDragNode,
  publishResultToMain,
  publishStatusToMain,
  publishToastToMain
} from '../toolWindowHelpers'
import { SetRow } from './SetRow'
import { validateGetRow } from '../GetMultiNodeDialog/rowUtils'
import { buildFullOid, isDuplicate, stripBaseOid, validateRow } from './rowUtils'
import { useSetRows } from './useSetRows'
import type { SetRowError, SetRowPatch } from './types'

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

interface SetToolWindowContentProps {
  context: SnmpToolWindowContext
}

export function SetToolWindowContent({ context }: SetToolWindowContentProps): React.ReactElement {
  const { message: appMessage } = App.useApp()
  const { rows, append, remove, patch, moveTo, reset } = useSetRows()
  const [isDragOver, setIsDragOver] = useState(false)
  const [instanceFetchingId, setInstanceFetchingId] = useState<string | null>(null)
  const [submittingOperation, setSubmittingOperation] = useState<'GET' | 'SET' | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const seed = useMemo<ToolWindowSetSeed>(() => (
    context.kind === 'set'
      ? context.seed as ToolWindowSetSeed
      : { node: context.seed as MibTreeNodeData }
  ), [context.kind, context.seed])

  useEffect(() => {
    reset()
    const row = append(seed.node as MibTreeNodeData)
    const overrides: SetRowPatch = {}
    if (seed.instance !== undefined) overrides.instance = seed.instance
    if (seed.targetValue !== undefined) overrides.targetValue = seed.targetValue
    if (Object.keys(overrides).length > 0) {
      patch(row.rowId, overrides)
    }
  }, [append, patch, reset, seed])

  const errorsByRow = useMemo<Record<string, SetRowError>>(() => {
    const map: Record<string, SetRowError> = {}
    for (const row of rows) {
      const error = validateRow(row)
      if (error) map[row.rowId] = error
    }
    return map
  }, [rows])

  const handleAppend = useCallback((node: MibTreeNodeData) => {
    if (isDuplicate(rows, node)) {
      appMessage.info(`节点已在列表中：${node.name}`)
      return
    }
    append(node)
  }, [appMessage, append, rows])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handlePanelDragLeave = useCallback((event: React.DragEvent) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
    consumeToolWindowDragNode(appMessage).then((node) => {
      if (node) handleAppend(node)
    }).catch(() => {})
  }, [appMessage, handleAppend])

  const fetchInstances = useCallback(async (rowId: string) => {
    const row = rows.find((item) => item.rowId === rowId)
    if (!row) return
    setInstanceFetchingId(rowId)
    try {
      const result = await window.api.snmp.walk(context.snmpConfig, row.node.oid)
      if (!result.success) {
        appMessage.error(`获取实例失败：${result.error}`)
        return
      }
      const suffixes = (result.varbinds || [])
        .map((varbind) => stripBaseOid(varbind.oid, row.node.oid))
        .filter((suffix) => suffix.length > 0)
      const dedup = Array.from(new Set(suffixes))
      if (dedup.length === 0) {
        appMessage.info('未发现实例，请手动输入')
      }
      patch(rowId, { instanceOptions: dedup })
    } catch (error) {
      appMessage.error(`请求失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setInstanceFetchingId(null)
    }
  }, [appMessage, context.snmpConfig, patch, rows])

  const fetchCurrentValue = useCallback(async (
    rowId: string,
    options: { instanceOverride?: string; applyToTarget?: boolean } = {}
  ) => {
    const row = rows.find((item) => item.rowId === rowId)
    if (!row) return
    const effectiveInstance = options.instanceOverride ?? row.instance
    const fullOid = buildFullOid(row.node.oid, effectiveInstance)
    patch(rowId, { currentValue: { state: 'loading' } })
    try {
      const result = await window.api.snmp.get(context.snmpConfig, [fullOid])
      if (!result.success) {
        patch(rowId, { currentValue: { state: 'err', error: result.error || 'unknown' } })
        appMessage.error(`GET 失败：${result.error}`)
        return
      }
      const varbind = result.varbinds?.[0]
      if (!varbind) {
        patch(rowId, { currentValue: { state: 'err', error: 'empty varbind' } })
        return
      }
      const text = formatCurrentValue(varbind.value)
      const next: SetRowPatch = { currentValue: { state: 'ok', text } }
      if (options.applyToTarget) next.targetValue = text
      patch(rowId, next)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patch(rowId, { currentValue: { state: 'err', error: message } })
      appMessage.error(`请求失败：${message}`)
    }
  }, [appMessage, context.snmpConfig, patch, rows])

  const handleSortEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    moveTo(String(active.id), String(over.id))
  }, [moveTo])

  const handleGetSubmit = useCallback(async () => {
    if (rows.length === 0) return
    const firstError = rows.map((row) => validateGetRow(row)).find((error) => error !== null)
    if (firstError) {
      appMessage.warning(`第 ${rows.findIndex((row) => row.rowId === firstError.rowId) + 1} 行：${firstError.message}`)
      return
    }

    const oids = rows.map((row) => buildFullOid(row.node.oid, row.instance))

    setSubmittingOperation('GET')
    publishResultToMain(null, {
      connectionStatus: 'connecting',
      statusMessage: `Executing GET on ${oids.length} OID(s)...`,
      isQuerying: true
    })

    try {
      const result = await window.api.snmp.get(context.snmpConfig, oids)
      if (result.success) {
        const session: ResultSession = buildResultSession('GET', oids[0], result, context.mibTree as MibTreeNodeData[])
        if (result.aborted) {
          publishResultToMain(session, {
            statusMessage: `GET: aborted at ${session.rows.length} row(s), ${result.responseTime}ms`
          })
        } else {
          const baseMessage = `GET: ${session.rows.length} result(s), ${result.responseTime}ms`
          publishResultToMain(session, {
            connectionStatus: 'connected',
            statusMessage: session.rows.length === 0 ? `${baseMessage} — 本次操作结果为空` : baseMessage
          })
          publishToastToMain('success', `GET succeeded (${oids.length} OID${oids.length > 1 ? 's' : ''})`)
        }
      } else {
        publishStatusToMain({
          connectionStatus: 'error',
          statusMessage: `Error: ${result.error}`
        })
        publishToastToMain('error', `SNMP error: ${result.error}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      publishStatusToMain({
        connectionStatus: 'error',
        statusMessage: `Error: ${message}`
      })
      publishToastToMain('error', `Request failed: ${message}`)
    } finally {
      setSubmittingOperation(null)
      publishStatusToMain({ isQuerying: false })
    }
  }, [appMessage, context.mibTree, context.snmpConfig, rows])

  const handleSetSubmit = useCallback(async () => {
    if (rows.length === 0) return
    const firstError = Object.values(errorsByRow)[0]
    if (firstError) {
      appMessage.warning(`第 ${rows.findIndex((row) => row.rowId === firstError.rowId) + 1} 行：${firstError.message}`)
      return
    }

    const values: SnmpSetValue[] = rows.map((row) => ({
      oid: buildFullOid(row.node.oid, row.instance),
      value: row.targetValue,
      type: row.type
    }))

    setSubmittingOperation('SET')
    publishResultToMain(null, {
      connectionStatus: 'connecting',
      statusMessage: `Executing SET on ${values.length} varbind(s)...`,
      isQuerying: true
    })

    try {
      const result = await window.api.snmp.set(context.snmpConfig, values)
      if (result.success) {
        const session: ResultSession = buildResultSession('SET', values[0].oid, result, context.mibTree as MibTreeNodeData[])
        if (result.aborted) {
          publishResultToMain(session, {
            statusMessage: `SET: aborted at ${session.rows.length} row(s), ${result.responseTime}ms`
          })
        } else {
          const baseMessage = `SET: ${session.rows.length} result(s), ${result.responseTime}ms`
          publishResultToMain(session, {
            connectionStatus: 'connected',
            statusMessage: session.rows.length === 0 ? `${baseMessage} — 本次操作结果为空` : baseMessage
          })
          publishToastToMain('success', `SET succeeded (${values.length} varbind${values.length > 1 ? 's' : ''})`)
        }
      } else {
        publishStatusToMain({
          connectionStatus: 'error',
          statusMessage: `Error: ${result.error}`
        })
        publishToastToMain('error', `SNMP error: ${result.error}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      publishStatusToMain({
        connectionStatus: 'error',
        statusMessage: `Error: ${message}`
      })
      publishToastToMain('error', `Request failed: ${message}`)
    } finally {
      setSubmittingOperation(null)
      publishStatusToMain({ isQuerying: false })
    }
  }, [appMessage, context.mibTree, context.snmpConfig, errorsByRow, rows])

  const submitting = submittingOperation !== null

  return (
    <div
      className="tool-window-panel"
      onDragOver={handleDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handleDrop}
    >
      <div className="tool-window-header">
        <Space>
          <span className="tool-window-title">GET / SET 多节点</span>
          <Tag color="blue">共 {rows.length} 行</Tag>
        </Space>
        <Space>
          <Button
            icon={<SendOutlined />}
            onClick={handleGetSubmit}
            loading={submittingOperation === 'GET'}
            disabled={rows.length === 0 || submittingOperation === 'SET'}
          >
            执行 GET ({rows.length})
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleSetSubmit}
            loading={submittingOperation === 'SET'}
            disabled={rows.length === 0 || submittingOperation === 'GET'}
          >
            执行 SET ({rows.length})
          </Button>
        </Space>
      </div>

      <div
        className={isDragOver ? 'tool-window-drop-zone is-over' : 'tool-window-drop-zone'}
      >
        {isDragOver ? '松开以追加节点' : '从主窗口 MIB 树拖拽节点到此窗口任意位置可追加为新行'}
      </div>

      {rows.length === 0 ? (
        <Empty description="尚无节点" />
      ) : (
        <div className="tool-window-table-wrap">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
            <SortableContext items={rows.map((row) => row.rowId)} strategy={verticalListSortingStrategy}>
              <table className="tool-window-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} />
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ textAlign: 'left' }}>节点</th>
                    <th style={{ textAlign: 'left' }}>Instance</th>
                    <th style={{ textAlign: 'left', width: 140 }}>类型</th>
                    <th style={{ textAlign: 'left', width: 240 }}>目标值</th>
                    <th style={{ textAlign: 'right', width: 120 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <SetRow
                      key={row.rowId}
                      index={index}
                      row={row}
                      rowError={errorsByRow[row.rowId]}
                      disabled={submitting}
                      onPatch={(patchValue) => patch(row.rowId, patchValue)}
                      onRemove={() => remove(row.rowId)}
                      onFetchInstances={() => fetchInstances(row.rowId)}
                      onFetchCurrentValue={(options) => fetchCurrentValue(row.rowId, options)}
                      instanceFetching={instanceFetchingId === row.rowId}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}
