import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Table, Button, Space, Tooltip, Tag, message, Empty } from 'antd'
import {
  DownloadOutlined,
  FileExcelOutlined,
  DeleteOutlined,
  CopyOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAppStore } from '../stores/appStore'
import type { ResultVarbind } from '../types'
import { ResizableHeaderCell } from './ResizableHeaderCell'

const INDEX_COL_KEY = '#'
const NAME_COL_KEY = 'name'
const INSTANCE_COL_KEY = 'instance'
const TYPE_COL_KEY = 'type'
const VALUE_COL_KEY = 'value'

const DEFAULT_WIDTHS: Record<string, number> = {
  [INDEX_COL_KEY]: 60,
  [NAME_COL_KEY]: 200,
  [INSTANCE_COL_KEY]: 100,
  [TYPE_COL_KEY]: 120,
  [VALUE_COL_KEY]: 300
}

const VIRTUAL_SCROLL_THRESHOLD = 500

/**
 * ResultsPanel renders the SNMP operation output as a flat list with one row
 * per varbind. Columns are fixed: #, Name, Instance, Type, Value.
 * Layout features (column width) are local UI state and not persisted.
 */
export function ResultsPanel(): React.ReactElement {
  const session = useAppStore((s) => s.currentResult)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setResult = useAppStore((s) => s.setResult)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [showHex, setShowHex] = useState<Record<string, boolean>>({})
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

  // Reset selection and hex state whenever a new session arrives.
  useEffect(() => {
    setSelectedRowKeys([])
    setShowHex({})
  }, [session])

  const varbinds = session?.varbinds ?? []
  const rowCount = varbinds.length

  const handleResize = useCallback((key: string, newWidth: number) => {
    setColumnWidths((prev) => ({ ...prev, [key]: newWidth }))
  }, [])

  const getWidth = useCallback((key: string): number => {
    return columnWidths[key] ?? DEFAULT_WIDTHS[key] ?? 160
  }, [columnWidths])

  const columns: ColumnsType<ResultVarbind> = useMemo(() => {
    const cols: ColumnsType<ResultVarbind> = [
      {
        title: '#',
        dataIndex: 'index',
        key: INDEX_COL_KEY,
        width: getWidth(INDEX_COL_KEY),
        align: 'right',
        render: (index: number) => (
          <span style={{ fontSize: 12 }}>{index}</span>
        ),
        onHeaderCell: () => ({
          columnKey: INDEX_COL_KEY,
          width: getWidth(INDEX_COL_KEY),
          onResize: handleResize,
          draggable: false
        }) as unknown as React.HTMLAttributes<HTMLElement>
      },
      {
        title: '列名称',
        dataIndex: 'columnName',
        key: NAME_COL_KEY,
        width: getWidth(NAME_COL_KEY),
        ellipsis: true,
        render: (name: string) => (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{name}</span>
        ),
        onHeaderCell: () => ({
          columnKey: NAME_COL_KEY,
          width: getWidth(NAME_COL_KEY),
          onResize: handleResize,
          draggable: false
        }) as unknown as React.HTMLAttributes<HTMLElement>
      },
      {
        title: 'Instance',
        dataIndex: 'instance',
        key: INSTANCE_COL_KEY,
        width: getWidth(INSTANCE_COL_KEY),
        ellipsis: true,
        render: (instance: string) => (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{instance}</span>
        ),
        onHeaderCell: () => ({
          columnKey: INSTANCE_COL_KEY,
          width: getWidth(INSTANCE_COL_KEY),
          onResize: handleResize,
          draggable: false
        }) as unknown as React.HTMLAttributes<HTMLElement>
      },
      {
        title: '类型',
        dataIndex: 'type',
        key: TYPE_COL_KEY,
        width: getWidth(TYPE_COL_KEY),
        ellipsis: true,
        render: (type: string) => (
          <span style={{ fontSize: 12 }}>{type}</span>
        ),
        onHeaderCell: () => ({
          columnKey: TYPE_COL_KEY,
          width: getWidth(TYPE_COL_KEY),
          onResize: handleResize,
          draggable: false
        }) as unknown as React.HTMLAttributes<HTMLElement>
      },
      {
        title: '值',
        dataIndex: 'value',
        key: VALUE_COL_KEY,
        width: getWidth(VALUE_COL_KEY),
        ellipsis: true,
        render: (_value: string, record) => {
          if (record.isError) {
            return <Tag color="red">{record.errorTag || 'error'}</Tag>
          }
          const isOctet = record.rawType === 'OCTET STRING'
          if (isOctet && record.value.length > 0) {
            const isHexMode = showHex[record.key]
            return (
              <Space size="small">
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {isHexMode ? toHexDisplay(record.value) : record.value}
                </span>
                <Tooltip title={isHexMode ? 'Show ASCII' : 'Show Hex'}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: 11 }}
                    onClick={() =>
                      setShowHex((prev) => ({ ...prev, [record.key]: !prev[record.key] }))
                    }
                  >
                    {isHexMode ? 'ASCII' : 'HEX'}
                  </Button>
                </Tooltip>
              </Space>
            )
          }
          return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{record.value}</span>
        },
        onHeaderCell: () => ({
          columnKey: VALUE_COL_KEY,
          width: getWidth(VALUE_COL_KEY),
          onResize: handleResize,
          draggable: false
        }) as unknown as React.HTMLAttributes<HTMLElement>
      }
    ]

    return cols
  }, [getWidth, handleResize, showHex])

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
   * Build a row-by-row export view with fixed 5-column format for CSV/XML export.
   */
  const buildExportRows = useCallback((): Array<Record<string, string>> => {
    return varbinds.map((vb) => ({
      '#': String(vb.index),
      '列名称': vb.columnName,
      Instance: vb.instance,
      '类型': vb.type,
      '值': vb.isError ? vb.errorTag || 'error' : vb.value
    }))
  }, [varbinds])

  const buildTsv = useCallback(
    (rowsSubset: ResultVarbind[]): string => {
      const header = ['#', '列名称', 'Instance', '类型', '值'].join('\t')
      const lines = rowsSubset.map((vb) =>
        [vb.index, vb.columnName, vb.instance, vb.type, vb.isError ? vb.errorTag || 'error' : vb.value].join('\t')
      )
      return [header, ...lines].join('\n')
    },
    []
  )

  const handleCopySelected = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.info('Select rows to copy')
      return
    }
    const keySet = new Set(selectedRowKeys.map(String))
    const subset = varbinds.filter((vb) => keySet.has(vb.key))
    navigator.clipboard.writeText(buildTsv(subset)).catch(() => {})
    message.success(`Copied ${subset.length} row(s)`)
  }, [selectedRowKeys, varbinds, buildTsv])

  const handleCopyAll = useCallback(() => {
    if (rowCount === 0) {
      message.info('No results to copy')
      return
    }
    navigator.clipboard.writeText(buildTsv(varbinds)).catch(() => {})
    message.success(`Copied ${rowCount} row(s)`)
  }, [varbinds, rowCount, buildTsv])

  const handleExportCsv = useCallback(async () => {
    if (rowCount === 0) {
      message.info('No results to export')
      return
    }
    const success = await window.api.export.csv(buildExportRows())
    if (success) {
      message.success('Exported to CSV')
    }
  }, [rowCount, buildExportRows])

  const handleExportXml = useCallback(async () => {
    if (rowCount === 0) {
      message.info('No results to export')
      return
    }
    const success = await window.api.export.xml(buildExportRows())
    if (success) {
      message.success('Exported to XML')
    }
  }, [rowCount, buildExportRows])

  const handleClear = useCallback(() => {
    setResult(null)
    setStatusMessage('Results cleared')
  }, [setResult, setStatusMessage])

  const enableVirtual = rowCount > VIRTUAL_SCROLL_THRESHOLD

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
        <Table<ResultVarbind>
          columns={columns}
          dataSource={varbinds}
          rowKey="key"
          size="small"
          pagination={false}
          loading={isQuerying}
          components={tableComponents}
          scroll={{ y: 'calc(100vh - 380px)', x: 'max-content' }}
          virtual={enableVirtual}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys
          }}
          locale={{
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
