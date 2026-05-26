import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CopyOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined
} from '@ant-design/icons'
import type { SnmpToolWindowContext } from '../../../../shared/toolWindowTypes'
import type { MibTreeNodeData } from '../../types'
import {
  buildTableSession,
  buildTableSetValue,
  isEditableColumn,
  resolveTableTarget,
  type TableCellData,
  type TableColumnMeta,
  type TableRowData,
  type TableSession
} from '../../utils/tableSession'
import {
  publishStatusToMain,
  publishToastToMain
} from '../toolWindowHelpers'

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
  const { message: appMessage } = App.useApp()
  const target = useMemo(() => resolveTableTarget(context.seed as MibTreeNodeData), [context.seed])
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<TableSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([])
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [savingCell, setSavingCell] = useState(false)
  const [showHex, setShowHex] = useState<Record<string, boolean>>({})
  const [tableBodyHeight, setTableBodyHeight] = useState(TABLE_VIEWER_FALLBACK_BODY_HEIGHT)

  useEffect(() => {
    setSession(null)
    setFilterText('')
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
          pagination={{ pageSize: 50, showSizeChanger: true }}
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

/**
 * Convert a string to a space-separated hex display for OCTET STRING toggle.
 */
function toHexDisplay(str: string): string {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join(' ')
}
