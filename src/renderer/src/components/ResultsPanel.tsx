import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Table, Button, Space, Tooltip, Tag, message, Empty } from 'antd'
import {
  DownloadOutlined,
  FileExcelOutlined,
  DeleteOutlined,
  CopyOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { ColumnsType, ColumnType } from 'antd/es/table'
import { useAppStore } from '../stores/appStore'
import type { ResultColumn, ResultRowData } from '../types'
import { ResizableHeaderCell } from './ResizableHeaderCell'

const INSTANCE_COLUMN_KEY = '__instance'
const DEFAULT_COLUMN_WIDTH = 160
const INSTANCE_COLUMN_WIDTH = 140

/**
 * ResultsPanel renders the SNMP operation output as a dynamic table whose
 * columns are derived from the MIB-tree-resolved (column, instance) split
 * of each varbind. Layout features (column width, column order) are local
 * UI state and intentionally not persisted across sessions.
 */
export function ResultsPanel(): React.ReactElement {
  const session = useAppStore((s) => s.currentResult)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setResult = useAppStore((s) => s.setResult)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [showHex, setShowHex] = useState<Record<string, boolean>>({})
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [columnOrder, setColumnOrder] = useState<string[]>([])

  // Reset layout state whenever a new session arrives. We key on the
  // session timestamp + length signature so identity-only changes (which
  // shouldn't happen given immutable state, but defensive) still reset
  // cleanly.
  useEffect(() => {
    if (!session) {
      setColumnOrder([])
      setSelectedRowKeys([])
      setShowHex({})
      return
    }
    setColumnOrder(session.columns.map((c) => c.key))
    setSelectedRowKeys([])
    setShowHex({})
  }, [session])

  const sessionColumns = session?.columns ?? []
  const sessionRows = session?.rows ?? []

  // Ordered columns honor user reordering; columns not yet in the order
  // array (defensive — new session resets order in effect above) append.
  const orderedColumns: ResultColumn[] = useMemo(() => {
    if (sessionColumns.length === 0) return []
    const byKey = new Map(sessionColumns.map((c) => [c.key, c]))
    const ordered: ResultColumn[] = []
    const seen = new Set<string>()
    for (const k of columnOrder) {
      const c = byKey.get(k)
      if (c) {
        ordered.push(c)
        seen.add(k)
      }
    }
    for (const c of sessionColumns) {
      if (!seen.has(c.key)) ordered.push(c)
    }
    return ordered
  }, [sessionColumns, columnOrder])

  const handleColumnDrop = useCallback(
    (sourceKey: string, targetKey: string) => {
      setColumnOrder((prev) => {
        const order = prev.length > 0 ? prev : sessionColumns.map((c) => c.key)
        const sourceIdx = order.indexOf(sourceKey)
        const targetIdx = order.indexOf(targetKey)
        if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return order
        const next = [...order]
        const [moved] = next.splice(sourceIdx, 1)
        next.splice(targetIdx, 0, moved)
        return next
      })
    },
    [sessionColumns]
  )

  const handleResize = useCallback((key: string, newWidth: number) => {
    setColumnWidths((prev) => ({ ...prev, [key]: newWidth }))
  }, [])

  const columns: ColumnsType<ResultRowData> = useMemo(() => {
    const cols: ColumnsType<ResultRowData> = [
      {
        title: 'Instance',
        dataIndex: 'instance',
        key: INSTANCE_COLUMN_KEY,
        width: columnWidths[INSTANCE_COLUMN_KEY] ?? INSTANCE_COLUMN_WIDTH,
        ellipsis: true,
        render: (instance: string) => (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{instance}</span>
        ),
        onHeaderCell: () => ({
          columnKey: INSTANCE_COLUMN_KEY,
          width: columnWidths[INSTANCE_COLUMN_KEY] ?? INSTANCE_COLUMN_WIDTH,
          onResize: handleResize,
          draggable: false
        // antd's onHeaderCell typing predates our extra props; cast through
        // unknown so the custom header cell receives them verbatim.
        }) as unknown as React.HTMLAttributes<HTMLElement>
      }
    ]

    for (const col of orderedColumns) {
      const width = columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH
      const column: ColumnType<ResultRowData> = {
        title: `${col.name} (${col.type})`,
        key: col.key,
        dataIndex: ['cells', col.key],
        width,
        ellipsis: true,
        render: (_value, record) => {
          const cell = record.cells[col.key]
          if (!cell) return <span style={{ color: '#bbb' }}>—</span>
          if (cell.isError) {
            return <Tag color="red">{cell.errorTag || 'error'}</Tag>
          }
          const cellKey = `${record.key}|${col.key}`
          const isOctet = cell.rawType === 'OCTET STRING'
          if (isOctet && cell.value.length > 0) {
            const isHexMode = showHex[cellKey]
            return (
              <Space size="small">
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {isHexMode ? toHexDisplay(cell.value) : cell.value}
                </span>
                <Tooltip title={isHexMode ? 'Show ASCII' : 'Show Hex'}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: 11 }}
                    onClick={() =>
                      setShowHex((prev) => ({ ...prev, [cellKey]: !prev[cellKey] }))
                    }
                  >
                    {isHexMode ? 'ASCII' : 'HEX'}
                  </Button>
                </Tooltip>
              </Space>
            )
          }
          return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{cell.value}</span>
        },
        onHeaderCell: () => ({
          columnKey: col.key,
          width,
          draggable: true,
          onResize: handleResize,
          onColumnDrop: handleColumnDrop
        }) as unknown as React.HTMLAttributes<HTMLElement>
      }
      cols.push(column)
    }

    return cols
  }, [orderedColumns, columnWidths, showHex, handleResize, handleColumnDrop])

  const tableComponents = useMemo(
    () => ({
      header: {
        cell: ResizableHeaderCell as unknown as React.ComponentType<
          React.HTMLAttributes<HTMLElement>
        >
      }
    }),
    []
  )

  /**
   * Build a row-by-row export view (tab-separated by default) ordered by
   * the user's current column order so Copy / CSV / XML stay consistent
   * with what the user sees on screen.
   */
  const buildExportRows = useCallback((): Array<Record<string, string>> => {
    return sessionRows.map((row) => {
      const out: Record<string, string> = { Instance: row.instance }
      for (const col of orderedColumns) {
        const header = `${col.name} (${col.type})`
        const cell = row.cells[col.key]
        out[header] = cell ? (cell.isError ? cell.errorTag || 'error' : cell.value) : ''
      }
      return out
    })
  }, [sessionRows, orderedColumns])

  const buildTsv = useCallback(
    (rowsSubset: ResultRowData[]): string => {
      const header = ['Instance', ...orderedColumns.map((c) => `${c.name} (${c.type})`)].join('\t')
      const lines = rowsSubset.map((row) => {
        const cells = [row.instance, ...orderedColumns.map((c) => {
          const cell = row.cells[c.key]
          if (!cell) return ''
          return cell.isError ? cell.errorTag || 'error' : cell.value
        })]
        return cells.join('\t')
      })
      return [header, ...lines].join('\n')
    },
    [orderedColumns]
  )

  const handleCopySelected = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.info('Select rows to copy')
      return
    }
    const keySet = new Set(selectedRowKeys.map(String))
    const subset = sessionRows.filter((r) => keySet.has(r.key))
    navigator.clipboard.writeText(buildTsv(subset)).catch(() => {})
    message.success(`Copied ${subset.length} row(s)`)
  }, [selectedRowKeys, sessionRows, buildTsv])

  const handleCopyAll = useCallback(() => {
    if (sessionRows.length === 0) {
      message.info('No results to copy')
      return
    }
    navigator.clipboard.writeText(buildTsv(sessionRows)).catch(() => {})
    message.success(`Copied ${sessionRows.length} row(s)`)
  }, [sessionRows, buildTsv])

  const handleExportCsv = useCallback(async () => {
    if (sessionRows.length === 0) {
      message.info('No results to export')
      return
    }
    const success = await window.api.export.csv(buildExportRows())
    if (success) {
      message.success('Exported to CSV')
    }
  }, [sessionRows, buildExportRows])

  const handleExportXml = useCallback(async () => {
    if (sessionRows.length === 0) {
      message.info('No results to export')
      return
    }
    const success = await window.api.export.xml(buildExportRows())
    if (success) {
      message.success('Exported to XML')
    }
  }, [sessionRows, buildExportRows])

  const handleClear = useCallback(() => {
    setResult(null)
    setStatusMessage('Results cleared')
  }, [setResult, setStatusMessage])

  const rowCount = sessionRows.length

  return (
    <div className="results-panel">
      <div className="results-header">
        <h3>
          <FileTextOutlined /> Results ({rowCount})
        </h3>
        <div className="results-actions">
          <Space size="small">
            <Tooltip title="Copy selected rows">
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={handleCopySelected}
                disabled={selectedRowKeys.length === 0}
              >
                Copy
              </Button>
            </Tooltip>
            <Tooltip title="Copy all rows">
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={handleCopyAll}
                disabled={rowCount === 0}
              >
                Copy All
              </Button>
            </Tooltip>
            <Tooltip title="Export to CSV">
              <Button
                icon={<FileExcelOutlined />}
                size="small"
                onClick={handleExportCsv}
                disabled={rowCount === 0}
              >
                CSV
              </Button>
            </Tooltip>
            <Tooltip title="Export to XML">
              <Button
                icon={<DownloadOutlined />}
                size="small"
                onClick={handleExportXml}
                disabled={rowCount === 0}
              >
                XML
              </Button>
            </Tooltip>
            <Tooltip title="Clear results">
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                onClick={handleClear}
                disabled={!session && rowCount === 0}
              >
                Clear
              </Button>
            </Tooltip>
          </Space>
        </div>
      </div>

      <div className="results-table-container">
        <Table<ResultRowData>
          columns={columns}
          dataSource={sessionRows}
          rowKey="key"
          size="small"
          pagination={false}
          loading={isQuerying}
          components={tableComponents}
          scroll={{ y: 'calc(100vh - 380px)', x: 'max-content' }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys
          }}
          locale={{
            // PR3 — two empty-state messages:
            //  - no session yet (initial or post-clear) → generic prompt
            //  - completed session that returned zero rows → operation-aware
            //    "本次 <op> 操作没有返回任何数据（<oid>）"
            emptyText: session ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`本次 ${session.operation} 操作没有返回任何数据（${session.rootOid}）`}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="执行 SNMP 操作后结果在此处显示"
              />
            )
          }}
        />
      </div>
    </div>
  )
}

/**
 * Convert a string to a space-separated hex display for OCTET STRING toggle.
 */
function toHexDisplay(str: string): string {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join(' ')
}
