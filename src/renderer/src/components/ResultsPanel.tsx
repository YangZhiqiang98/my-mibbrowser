import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Space, Tooltip, message, Empty, Spin } from 'antd'
import {
  DownloadOutlined,
  FileExcelOutlined,
  DeleteOutlined,
  CopyOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { ResultVarbind } from '../types'

const LINE_HEIGHT = 22 // approximate px per log row (font-size 13px, line-height 1.6, + 1px padding)
const OVERSCAN = 10 // rows rendered above/below the visible viewport
const HEADER_HEIGHT = 23 // approximate height of the log header line (font 12px * 1.6 + 4px padding)

/**
 * ResultsPanel renders SNMP operation output as a monospace log-style display.
 * Each varbind is shown as one line: `序号: 列名称.instance (类型) 值`.
 * Row click toggles selection. Toolbar buttons for copy/export remain.
 */
export function ResultsPanel(): React.ReactElement {
  const session = useAppStore((s) => s.currentResult)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setResult = useAppStore((s) => s.setResult)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [showHex, setShowHex] = useState<Record<string, boolean>>({})

  // Virtual scroll state
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Reset selection and hex state whenever a new session arrives.
  useEffect(() => {
    setSelectedKeys(new Set())
    setShowHex({})
  }, [session])

  // Track scroll container dimensions and scroll position.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const handleScroll = (): void => {
      setScrollTop(el.scrollTop)
    }

    const handleResize = (): void => {
      setViewportHeight(el.clientHeight)
    }

    handleResize()
    el.addEventListener('scroll', handleScroll, { passive: true })

    const observer = new ResizeObserver(handleResize)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [])

  const varbinds = session?.varbinds ?? []
  const rowCount = varbinds.length

  // Virtual windowing: compute which rows are visible.
  // Rows start after the header, so we offset the scroll position by HEADER_HEIGHT.
  const [startIndex, endIndex, totalHeight, offsetY] = useMemo(() => {
    const total = rowCount * LINE_HEIGHT
    const adjustedScroll = Math.max(0, scrollTop - HEADER_HEIGHT)
    const start = Math.max(0, Math.floor(adjustedScroll / LINE_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(viewportHeight / LINE_HEIGHT) + OVERSCAN * 2
    const end = Math.min(rowCount, start + visibleCount)
    return [start, end, total, start * LINE_HEIGHT]
  }, [scrollTop, viewportHeight, rowCount])

  const visibleVarbinds = useMemo(
    () => varbinds.slice(startIndex, endIndex),
    [varbinds, startIndex, endIndex]
  )

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(varbinds.map((vb) => vb.key)))
  }, [varbinds])

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
    if (selectedKeys.size === 0) {
      message.info('Select rows to copy')
      return
    }
    const subset = varbinds.filter((vb) => selectedKeys.has(vb.key))
    navigator.clipboard.writeText(buildTsv(subset)).catch(() => {})
    message.success(`Copied ${subset.length} row(s)`)
  }, [selectedKeys, varbinds, buildTsv])

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
                disabled={selectedKeys.size === 0}
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

      <div className="results-log" ref={scrollContainerRef}>
        {isQuerying && (
          <div className="results-log-loading">
            <Spin size="small" />
          </div>
        )}

        {!isQuerying && rowCount === 0 && (
          <div className="results-log-empty">
            {session ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`本次 ${session.operation} 操作没有返回任何数据（${session.rootOid}）`}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="执行 SNMP 操作后结果在此处显示"
              />
            )}
          </div>
        )}

        {!isQuerying && rowCount > 0 && (
          <>
            <div className="results-log-header" onClick={selectAll} title="Click to select all rows">
              <span className="log-header-text">***** SNMP QUERY STARTED *****</span>
            </div>
            <div style={{ position: 'relative', height: totalHeight }}>
              <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
                {visibleVarbinds.map((vb) => (
                  <div
                    key={vb.key}
                    className={`results-log-row ${selectedKeys.has(vb.key) ? 'selected' : ''} ${vb.isError ? 'error-row' : ''}`}
                    onClick={() => toggleSelect(vb.key)}
                  >
                    <span className="log-index">{vb.index}:</span>{' '}
                    <span className="log-oid">{vb.columnName}.{vb.instance}</span>{' '}
                    <span className="log-type">({vb.type.toLowerCase()})</span>{' '}
                    <span className="log-value">
                      {vb.isError ? (
                        <span className="log-error">{vb.errorTag || 'error'}</span>
                      ) : vb.rawType === 'OCTET STRING' && vb.value.length > 0 ? (
                        <OCTETSTRINGCell
                          value={vb.value}
                          isHex={!!showHex[vb.key]}
                          onToggle={() =>
                            setShowHex((prev) => ({
                              ...prev,
                              [vb.key]: !prev[vb.key]
                            }))
                          }
                        />
                      ) : (
                        vb.value
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface OCTETSTRINGCellProps {
  value: string
  isHex: boolean
  onToggle: () => void
}

/**
 * Inline OCTET STRING value cell with HEX/ASCII toggle button.
 */
function OCTETSTRINGCell({ value, isHex, onToggle }: OCTETSTRINGCellProps): React.ReactElement {
  return (
    <>
      {isHex ? toHexDisplay(value) : value}
      <button
        type="button"
        className="log-hex-toggle"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        title={isHex ? 'Show ASCII' : 'Show Hex'}
      >
        {isHex ? 'ASCII' : 'HEX'}
      </button>
    </>
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
