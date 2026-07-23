import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined
} from '@ant-design/icons'
import type { SnmpToolWindowContext } from '../../../../shared/toolWindowTypes'
import type { MibTreeNodeData } from '../../types'
import {
  buildTableSession,
  buildAddRowSetValues,
  buildDeleteRowSetValue,
  buildTableSetValue,
  getTableRowLifecycle,
  isEditableColumn,
  resolveTableTarget,
  validateTableInstanceSuffix,
  type TableCellData,
  type TableColumnMeta,
  type TableRowData,
  type TableSession
} from '../../utils/tableSession'
import {
  publishStatusToMain,
  publishToastToMain
} from '../toolWindowHelpers'
import { toHexDisplay } from '../../utils/hexDisplay'

interface TableViewerContentProps {
  context: SnmpToolWindowContext
}

interface EditingCell {
  row: TableRowData
  column: TableColumnMeta
  value: string
}

const TABLE_VIEWER_MIN_BODY_HEIGHT = 240
const TABLE_VIEWER_FALLBACK_BODY_HEIGHT = 560
const TABLE_VIEWER_SCROLLBAR_RESERVE = 18

export function TableViewerContent({ context }: TableViewerContentProps): React.ReactElement {
  const { message: appMessage, modal } = App.useApp()
  const target = useMemo(() => resolveTableTarget(context.seed as MibTreeNodeData), [context.seed])
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<TableSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [savingCell, setSavingCell] = useState(false)
  const [addRowOpen, setAddRowOpen] = useState(false)
  const [newRowInstance, setNewRowInstance] = useState('')
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({})
  const [savingRowLifecycle, setSavingRowLifecycle] = useState(false)
  const [showHex, setShowHex] = useState<Record<string, boolean>>({})
  const [tableBodyHeight, setTableBodyHeight] = useState(TABLE_VIEWER_FALLBACK_BODY_HEIGHT)

  useEffect(() => {
    setSession(null)
    setFilterText('')
    setSelectedRowKeys([])
    setAddRowOpen(false)
    setNewRowInstance('')
    setNewRowValues({})
    setShowHex({})
    if (target) {
      setVisibleColumnKeys(target.columns.map((column) => column.oid))
    }
  }, [target])

  const fetchTable = useCallback(async () => {
    if (!target) return
    setLoading(true)
    publishStatusToMain({
      connectionStatus: 'connecting',
      statusMessage: `Loading table ${target.tableNode.name}...`,
      isQuerying: true
    })

    try {
      let result = await window.api.snmp.bulkWalk(context.snmpConfig, target.entryNode.oid, context.snmpConfig.bulkMaxRepetitions)
      if (!result.success) {
        result = await window.api.snmp.walk(context.snmpConfig, target.entryNode.oid)
      }

      if (!result.success) {
        publishStatusToMain({
          connectionStatus: 'error',
          statusMessage: `Error: ${result.error}`
        })
        publishToastToMain('error', `Table load failed: ${result.error}`)
        return
      }

      const next = buildTableSession(target, result.varbinds)
      setSession(next)
      setSelectedRowKeys((keys) => keys.filter((key) => next.rows.some((row) => row.key === key)))
      publishStatusToMain({
        connectionStatus: result.aborted ? undefined : 'connected',
        statusMessage: result.aborted
          ? `Table ${target.tableNode.name}: aborted at ${next.rows.length} row(s), ${result.responseTime}ms`
          : `Table ${target.tableNode.name}: ${next.rows.length} row(s), ${result.responseTime}ms`
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      publishStatusToMain({
        connectionStatus: 'error',
        statusMessage: `Error: ${message}`
      })
      publishToastToMain('error', `Table load failed: ${message}`)
    } finally {
      setLoading(false)
      publishStatusToMain({ isQuerying: false })
    }
  }, [context.snmpConfig, target])

  useEffect(() => {
    fetchTable().catch(() => {})
  }, [fetchTable])

  const lifecycle = useMemo(() => {
    if (!session) return null
    return getTableRowLifecycle(session.columns)
  }, [session])

  const selectedRow = useMemo(() => {
    const selectedKey = selectedRowKeys[0]
    if (!session || selectedKey === undefined) return null
    return session.rows.find((row) => row.key === selectedKey) ?? null
  }, [selectedRowKeys, session])

  const visibleColumns = useMemo(() => {
    if (!session) return []
    const visible = new Set(visibleColumnKeys)
    return session.columns.filter((column) => visible.has(column.key))
  }, [session, visibleColumnKeys])

  const filteredRows = useMemo(() => {
    const rows = session?.rows ?? []
    const query = filterText.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((row) => {
      if (row.instance.toLowerCase().includes(query)) return true
      return Object.values(row.cells).some((cell) => cell.value.toLowerCase().includes(query))
    })
  }, [filterText, session])

  useEffect(() => {
    const wrapper = tableWrapRef.current
    if (!wrapper) return

    let animationFrameId: number | null = null

    const measure = (): void => {
      const header = wrapper.querySelector<HTMLElement>('.ant-table-thead')
      const pagination = wrapper.querySelector<HTMLElement>('.ant-pagination')
      const headerHeight = header?.getBoundingClientRect().height ?? 56
      const paginationHeight = pagination?.getBoundingClientRect().height ?? 48
      const nextHeight = Math.max(
        TABLE_VIEWER_MIN_BODY_HEIGHT,
        Math.floor(wrapper.clientHeight - headerHeight - paginationHeight - TABLE_VIEWER_SCROLLBAR_RESERVE)
      )
      setTableBodyHeight((current) => (current === nextHeight ? current : nextHeight))
    }

    const scheduleMeasure = (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null
        measure()
      })
    }

    scheduleMeasure()
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(wrapper)

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      observer.disconnect()
    }
  }, [filteredRows.length, visibleColumns.length])

  const columns: ColumnsType<TableRowData> = useMemo(() => {
    const cols: ColumnsType<TableRowData> = [
      {
        title: 'Instance',
        dataIndex: 'instance',
        key: '__instance',
        width: 160,
        fixed: 'left',
        sorter: (a, b) => a.instance.localeCompare(b.instance, undefined, { numeric: true }),
        render: (instance: string) => <span className="table-viewer-instance">{instance}</span>
      }
    ]

    for (const column of visibleColumns) {
      cols.push({
        title: (
          <Tooltip title={`${column.syntax || column.type} / ${column.oid}`}>
            <span>{column.name}</span>
            <span className="table-viewer-column-subtitle">{column.access}</span>
          </Tooltip>
        ),
        key: column.key,
        dataIndex: ['cells', column.key],
        width: 180,
        ellipsis: true,
        sorter: (a, b) => getCellValue(a.cells[column.key]).localeCompare(getCellValue(b.cells[column.key]), undefined, { numeric: true }),
        render: (cell: TableCellData | undefined, row) => (
            <TableCellView
            cell={cell}
            column={column}
            rowKey={row.key}
            showHex={showHex}
            onToggleHex={(cellKey) => setShowHex((prev) => ({ ...prev, [cellKey]: !prev[cellKey] }))}
            onEdit={() => setEditingCell({ row, column, value: cell?.isError ? '' : cell?.value ?? '' })}
          />
        )
      })
    }

    return cols
  }, [visibleColumns, showHex])

  const handleCopyRows = useCallback(() => {
    if (!session || filteredRows.length === 0) {
      appMessage.info('No rows to copy')
      return
    }
    const tsv = buildDelimitedRows(filteredRows, visibleColumns, '\t')
    navigator.clipboard.writeText(tsv).catch(() => {})
    appMessage.success(`Copied ${filteredRows.length} row(s)`)
  }, [appMessage, filteredRows, session, visibleColumns])

  const handleExportCsv = useCallback(async () => {
    if (!session || filteredRows.length === 0) {
      appMessage.info('No rows to export')
      return
    }
    const success = await window.api.export.csv(buildExportRows(filteredRows, visibleColumns))
    if (success) {
      appMessage.success('Exported to CSV')
    }
  }, [appMessage, filteredRows, session, visibleColumns])

  const handleAbort = useCallback(async () => {
    const cancelled = await window.api.snmp.cancel()
    if (cancelled) {
      publishStatusToMain({ statusMessage: 'Abort requested...' })
    } else {
      appMessage.info('No SNMP request is running')
    }
  }, [appMessage])

  const handleSaveCell = useCallback(async () => {
    if (!editingCell) return
    setSavingCell(true)
    try {
      const value = buildTableSetValue(editingCell.column, editingCell.row.instance, editingCell.value)
      const result = await window.api.snmp.set(context.snmpConfig, [value])
      if (!result.success) {
        publishToastToMain('error', `SET failed: ${result.error}`)
        publishStatusToMain({
          connectionStatus: 'error',
          statusMessage: `SET ${editingCell.column.name}.${editingCell.row.instance}: ${result.error}`
        })
        return
      }

      setSession((current) => {
        if (!current) return current
        return {
          ...current,
          rows: current.rows.map((row) => {
            if (row.key !== editingCell.row.key) return row
            return {
              ...row,
              cells: {
                ...row.cells,
                [editingCell.column.key]: {
                  value: editingCell.value,
                  rawType: editingCell.column.type,
                  isError: false
                }
              }
            }
          })
        }
      })
      publishStatusToMain({
        connectionStatus: 'connected',
        statusMessage: `SET ${editingCell.column.name}.${editingCell.row.instance}: ok`
      })
      publishToastToMain('success', `SET ${editingCell.column.name}.${editingCell.row.instance} succeeded`)
      setEditingCell(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      publishToastToMain('error', `SET failed: ${message}`)
    } finally {
      setSavingCell(false)
    }
  }, [context.snmpConfig, editingCell])

  const openAddRow = useCallback(() => {
    if (!lifecycle?.canCreate) return
    setNewRowInstance('')
    setNewRowValues({})
    setAddRowOpen(true)
  }, [lifecycle])

  const handleAddRow = useCallback(async () => {
    if (!lifecycle?.canCreate) return

    const instanceError = validateTableInstanceSuffix(newRowInstance)
    if (instanceError) {
      appMessage.error(instanceError)
      return
    }

    let values
    try {
      values = buildAddRowSetValues(lifecycle, newRowInstance, newRowValues)
    } catch (error) {
      appMessage.error(error instanceof Error ? error.message : String(error))
      return
    }

    setSavingRowLifecycle(true)
    try {
      const result = await window.api.snmp.set(context.snmpConfig, values)
      if (!result.success) {
        publishToastToMain('error', `Add row failed: ${result.error}`)
        publishStatusToMain({
          connectionStatus: 'error',
          statusMessage: `Add row ${newRowInstance}: ${result.error}`
        })
        return
      }

      publishStatusToMain({
        connectionStatus: 'connected',
        statusMessage: `Add row ${newRowInstance}: ok`
      })
      publishToastToMain('success', `Add row ${newRowInstance} succeeded`)
      setAddRowOpen(false)
      setNewRowInstance('')
      setNewRowValues({})
      await fetchTable()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      publishToastToMain('error', `Add row failed: ${message}`)
      publishStatusToMain({
        connectionStatus: 'error',
        statusMessage: `Add row ${newRowInstance}: ${message}`
      })
    } finally {
      setSavingRowLifecycle(false)
    }
  }, [appMessage, context.snmpConfig, fetchTable, lifecycle, newRowInstance, newRowValues])

  const handleDeleteRow = useCallback(() => {
    if (!lifecycle?.canDelete || !selectedRow) return

    modal.confirm({
      title: `Delete row ${selectedRow.instance}`,
      content: `SET ${lifecycle.rowStatusColumn?.name}.${selectedRow.instance} = destroy(6)`,
      okText: 'Delete',
      okButtonProps: { danger: true, icon: <DeleteOutlined /> },
      onOk: async () => {
        setSavingRowLifecycle(true)
        try {
          const value = buildDeleteRowSetValue(lifecycle, selectedRow.instance)
          const result = await window.api.snmp.set(context.snmpConfig, [value])
          if (!result.success) {
            publishToastToMain('error', `Delete row failed: ${result.error}`)
            publishStatusToMain({
              connectionStatus: 'error',
              statusMessage: `Delete row ${selectedRow.instance}: ${result.error}`
            })
            return
          }

          publishStatusToMain({
            connectionStatus: 'connected',
            statusMessage: `Delete row ${selectedRow.instance}: ok`
          })
          publishToastToMain('success', `Delete row ${selectedRow.instance} succeeded`)
          setSelectedRowKeys([])
          await fetchTable()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          publishToastToMain('error', `Delete row failed: ${message}`)
          publishStatusToMain({
            connectionStatus: 'error',
            statusMessage: `Delete row ${selectedRow.instance}: ${message}`
          })
        } finally {
          setSavingRowLifecycle(false)
        }
      }
    })
  }, [context.snmpConfig, fetchTable, lifecycle, modal, selectedRow])

  if (!target) {
    return (
      <div className="tool-window-panel">
        <Empty description="Selected node is not a table or entry" />
      </div>
    )
  }

  return (
    <div className="tool-window-panel table-viewer-panel">
      <div className="tool-window-header">
        <Space>
          <span className="tool-window-title">{target.tableNode.name}</span>
          <Tag color="blue">{session?.rows.length ?? 0} rows</Tag>
          <Tag color="default">{target.columns.length} columns</Tag>
        </Space>
        <Space>
          <Input.Search
            allowClear
            placeholder="Filter rows"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            style={{ width: 220 }}
          />
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div className="table-viewer-column-menu">
                <Checkbox.Group
                  value={visibleColumnKeys}
                  onChange={(values) => setVisibleColumnKeys(values.map(String))}
                  options={session?.columns.map((column) => ({ label: column.name, value: column.key })) ?? []}
                />
              </div>
            )}
          >
            <Button icon={<EyeOutlined />}>Columns</Button>
          </Dropdown>
          {lifecycle?.canCreate && (
            <Button icon={<PlusOutlined />} onClick={openAddRow} disabled={loading || savingRowLifecycle}>
              Add Row
            </Button>
          )}
          {lifecycle?.canDelete && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteRow}
              disabled={loading || savingRowLifecycle || !selectedRow}
            >
              Delete Row
            </Button>
          )}
          <Button icon={<CopyOutlined />} onClick={handleCopyRows} disabled={!session || filteredRows.length === 0}>
            Copy
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportCsv} disabled={!session || filteredRows.length === 0}>
            CSV
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchTable} loading={loading}>
            Refresh
          </Button>
          {loading && (
            <Button danger icon={<StopOutlined />} onClick={handleAbort}>
              Stop
            </Button>
          )}
        </Space>
      </div>

      <div className="table-viewer-meta">
        <span>Entry: <code>{target.entryNode.name}</code></span>
        <span>OID: <code>{target.entryNode.oid}</code></span>
      </div>

      <div className="tool-window-table-wrap table-viewer-wrap" ref={tableWrapRef}>
        <Table<TableRowData>
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={filteredRows}
          loading={loading}
          rowSelection={lifecycle?.canDelete ? {
            type: 'radio',
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys)
          } : undefined}
          pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [50, 100, 200] }}
          scroll={{ x: 'max-content', y: tableBodyHeight }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No table rows loaded" /> }}
        />
      </div>

      <Modal
        title={editingCell ? `Edit ${editingCell.column.name}.${editingCell.row.instance}` : 'Edit cell'}
        open={!!editingCell}
        onOk={handleSaveCell}
        okText="SET"
        okButtonProps={{ icon: <SaveOutlined />, loading: savingCell }}
        onCancel={() => setEditingCell(null)}
      >
        {editingCell && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div className="table-viewer-edit-meta">
              <div>OID: <code>{buildTableSetValue(editingCell.column, editingCell.row.instance, editingCell.value).oid}</code></div>
              <div>Type: <code>{editingCell.column.type}</code></div>
            </div>
            {getEnumOptions(editingCell.column).length > 0 ? (
              <Select
                value={editingCell.value}
                onChange={(value) => setEditingCell({ ...editingCell, value })}
                style={{ width: '100%' }}
                options={getEnumOptions(editingCell.column)}
              />
            ) : (
              <Input
                value={editingCell.value}
                onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
              />
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title={`Add row${lifecycle?.rowStatusColumn ? ` via ${lifecycle.rowStatusColumn.name}` : ''}`}
        open={addRowOpen}
        onOk={handleAddRow}
        okText="Add Row"
        okButtonProps={{ icon: <PlusOutlined />, loading: savingRowLifecycle }}
        onCancel={() => setAddRowOpen(false)}
      >
        {lifecycle && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div className="table-viewer-edit-meta">
              <div>Entry: <code>{target.entryNode.name}</code></div>
              {lifecycle.rowStatusColumn && (
                <div>RowStatus: <code>{lifecycle.rowStatusColumn.oid}.&lt;instance&gt; = createAndGo(4)</code></div>
              )}
            </div>
            <Input
              placeholder="Instance suffix"
              value={newRowInstance}
              status={validateTableInstanceSuffix(newRowInstance) && newRowInstance ? 'error' : undefined}
              onChange={(event) => setNewRowInstance(event.target.value)}
            />
            {lifecycle.initialValueColumns.map((column) => (
              <Space key={column.key} direction="vertical" size={4} style={{ width: '100%' }}>
                <span className="table-viewer-add-row-label">
                  {column.name}
                  <code>{column.type}</code>
                </span>
                {getEnumOptions(column).length > 0 ? (
                  <Select
                    allowClear
                    placeholder={`${column.name} value`}
                    value={newRowValues[column.key] || undefined}
                    onChange={(value) => setNewRowValues((current) => ({
                      ...current,
                      [column.key]: value ?? ''
                    }))}
                    style={{ width: '100%' }}
                    options={getEnumOptions(column)}
                  />
                ) : (
                  <Input
                    placeholder={`${column.name} value`}
                    value={newRowValues[column.key] ?? ''}
                    onChange={(event) => setNewRowValues((current) => ({
                      ...current,
                      [column.key]: event.target.value
                    }))}
                  />
                )}
              </Space>
            ))}
          </Space>
        )}
      </Modal>
    </div>
  )
}

function TableCellView({
  cell,
  column,
  rowKey,
  showHex,
  onToggleHex,
  onEdit
}: {
  cell?: TableCellData
  column: TableColumnMeta
  rowKey: string
  showHex: Record<string, boolean>
  onToggleHex: (cellKey: string) => void
  onEdit: () => void
}): React.ReactElement {
  const editable = isEditableColumn(column)
  if (!cell) return <span className="table-viewer-empty">-</span>
  if (cell.isError) return <Tag color="red">{cell.errorTag || 'error'}</Tag>

  const isOctet = cell.rawType === 'OCTET STRING'
  if (isOctet && cell.value.length > 0) {
    const cellKey = `${rowKey}|${column.key}`
    const isHexMode = showHex[cellKey]
    return (
      <Space size="small">
        <span className="table-viewer-cell-value">
          {isHexMode ? toHexDisplay(cell.value) : cell.value}
        </span>
        <Tooltip title={isHexMode ? 'Show ASCII' : 'Show Hex'}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0, fontSize: 11 }}
            onClick={() => onToggleHex(cellKey)}
          >
            {isHexMode ? 'ASCII' : 'HEX'}
          </Button>
        </Tooltip>
        {editable && (
          <Button type="link" size="small" onClick={onEdit}>
            Edit
          </Button>
        )}
      </Space>
    )
  }

  return (
    <Space size="small">
      <span className="table-viewer-cell-value">{cell.value}</span>
      {editable && (
        <Button type="link" size="small" onClick={onEdit}>
          Edit
        </Button>
      )}
    </Space>
  )
}

function getCellValue(cell?: TableCellData): string {
  if (!cell) return ''
  return cell.isError ? cell.errorTag || 'error' : cell.value
}

function buildDelimitedRows(rows: TableRowData[], columns: TableColumnMeta[], delimiter: ',' | '\t'): string {
  const escape = (value: string): string => {
    if (delimiter === '\t') return value
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }
  const header = ['Instance', ...columns.map((column) => column.name)].map(escape).join(delimiter)
  const lines = rows.map((row) => [
    row.instance,
    ...columns.map((column) => getCellValue(row.cells[column.key]))
  ].map(escape).join(delimiter))
  return [header, ...lines].join('\n')
}

function buildExportRows(rows: TableRowData[], columns: TableColumnMeta[]): Array<Record<string, string>> {
  return rows.map((row) => {
    const out: Record<string, string> = { Instance: row.instance }
    for (const column of columns) {
      out[`${column.name} [${column.type}]`] = getCellValue(row.cells[column.key])
    }
    return out
  })
}

function getEnumOptions(column: TableColumnMeta): Array<{ label: string; value: string }> {
  if (column.enumValues && column.enumValues.length > 0) {
    return column.enumValues.map((item) => ({ label: `${item.name} (${item.value})`, value: String(item.value) }))
  }
  const block = column.syntax.match(/\{([\s\S]*?)\}/)?.[1] ?? ''
  const options: Array<{ label: string; value: string }> = []
  const regex = /([A-Za-z][A-Za-z0-9-]*)\s*\(\s*(-?\d+)\s*\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(block)) !== null) {
    options.push({ label: `${match[1]} (${match[2]})`, value: match[2] })
  }
  return options
}
