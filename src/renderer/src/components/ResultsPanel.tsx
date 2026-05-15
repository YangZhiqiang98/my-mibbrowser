import React, { useState, useCallback, useMemo } from 'react'
import { Table, Button, Space, Tooltip, Tag, message } from 'antd'
import {
  DownloadOutlined,
  FileExcelOutlined,
  DeleteOutlined,
  CopyOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAppStore } from '../stores/appStore'
import type { ResultRow } from '../types'

export function ResultsPanel(): React.ReactElement {
  const results = useAppStore((s) => s.results)
  const clearResults = useAppStore((s) => s.clearResults)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [showHex, setShowHex] = useState<Record<string, boolean>>({})

  const columns: ColumnsType<ResultRow> = useMemo(() => [
    {
      title: 'OID',
      dataIndex: 'oid',
      key: 'oid',
      width: 250,
      ellipsis: true,
      sorter: (a, b) => a.oid.localeCompare(b.oid)
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name)
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: 300,
      render: (value: string, record: ResultRow) => {
        const isHexMode = showHex[record.key]
        if (record.type === 'OCTET STRING' && value.length > 0) {
          return (
            <Space size="small">
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {isHexMode ? toHexDisplay(value) : value}
              </span>
              <Tooltip title={isHexMode ? 'Show ASCII' : 'Show Hex'}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, fontSize: 11 }}
                  onClick={() => setShowHex(prev => ({ ...prev, [record.key]: !prev[record.key] }))}
                >
                  {isHexMode ? 'ASCII' : 'HEX'}
                </Button>
              </Tooltip>
            </Space>
          )
        }
        return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{value}</span>
      }
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => <Tag>{type}</Tag>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : status === 'error' ? 'red' : 'orange'}>
          {status}
        </Tag>
      )
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 100
    }
  ], [showHex])

  const handleCopySelected = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.info('Select rows to copy')
      return
    }

    const selectedRows = results.filter(r => selectedRowKeys.includes(r.key))
    const text = selectedRows
      .map(r => `${r.oid}\t${r.value}\t${r.type}\t${r.status}`)
      .join('\n')

    navigator.clipboard.writeText(text)
    message.success(`Copied ${selectedRowKeys.length} row(s)`)
  }, [results, selectedRowKeys])

  const handleCopyAll = useCallback(() => {
    const text = results
      .map(r => `${r.oid}\t${r.value}\t${r.type}\t${r.status}`)
      .join('\n')

    navigator.clipboard.writeText(text)
    message.success(`Copied ${results.length} row(s)`)
  }, [results])

  const handleExportCsv = useCallback(async () => {
    if (results.length === 0) {
      message.info('No results to export')
      return
    }
    const data = results.map(r => ({
      OID: r.oid,
      Name: r.name,
      Value: r.value,
      Type: r.type,
      Status: r.status,
      Timestamp: r.timestamp
    }))
    const success = await window.api.export.csv(data)
    if (success) {
      message.success('Exported to CSV')
    }
  }, [results])

  const handleExportXml = useCallback(async () => {
    if (results.length === 0) {
      message.info('No results to export')
      return
    }
    const data = results.map(r => ({
      OID: r.oid,
      Name: r.name,
      Value: r.value,
      Type: r.type,
      Status: r.status,
      Timestamp: r.timestamp
    }))
    const success = await window.api.export.xml(data)
    if (success) {
      message.success('Exported to XML')
    }
  }, [results])

  return (
    <div className="results-panel">
      <div className="results-header">
        <h3>
          <FileTextOutlined /> Results ({results.length})
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
                disabled={results.length === 0}
              >
                Copy All
              </Button>
            </Tooltip>
            <Tooltip title="Export to CSV">
              <Button
                icon={<FileExcelOutlined />}
                size="small"
                onClick={handleExportCsv}
                disabled={results.length === 0}
              >
                CSV
              </Button>
            </Tooltip>
            <Tooltip title="Export to XML">
              <Button
                icon={<DownloadOutlined />}
                size="small"
                onClick={handleExportXml}
                disabled={results.length === 0}
              >
                XML
              </Button>
            </Tooltip>
            <Tooltip title="Clear results">
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                onClick={clearResults}
                disabled={results.length === 0}
              >
                Clear
              </Button>
            </Tooltip>
          </Space>
        </div>
      </div>

      <div className="results-table-container">
        <Table<ResultRow>
          columns={columns}
          dataSource={results}
          size="small"
          pagination={false}
          scroll={{ y: 'calc(100vh - 380px)' }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys
          }}
          rowClassName={(record) =>
            record.status === 'error' ? 'ant-table-row-error' : ''
          }
        />
      </div>
    </div>
  )
}

/**
 * Convert a string to hex display
 */
function toHexDisplay(str: string): string {
  return Array.from(str)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join(' ')
}
