import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { App, Button, Empty, Space, Switch, Tooltip } from 'antd'
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { DebugLogEntry } from '../../../shared/debugLogTypes'

export function DebugLogsPanel(): React.ReactElement | null {
  const { message } = App.useApp()
  const logs = useAppStore((s) => s.debugLogs)
  const panelOpen = useAppStore((s) => s.debugLogPanelOpen)
  const autoScroll = useAppStore((s) => s.debugLogAutoScroll)
  const debugMode = useAppStore((s) => s.debugMode)
  const clearDebugLogs = useAppStore((s) => s.clearDebugLogs)
  const setDebugLogPanelOpen = useAppStore((s) => s.setDebugLogPanelOpen)
  const setDebugLogAutoScroll = useAppStore((s) => s.setDebugLogAutoScroll)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panelOpen || !autoScroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [autoScroll, logs.length, panelOpen])

  const copyText = useMemo(() => logs.map(formatDebugLogLine).join('\n'), [logs])

  const handleCopy = useCallback(() => {
    if (logs.length === 0) {
      message.info('No debug logs to copy')
      return
    }
    navigator.clipboard.writeText(copyText).then(
      () => message.success(`Copied ${logs.length} debug log(s)`),
      () => message.error('Copy debug logs failed')
    )
  }, [copyText, logs.length, message])

  const handleClear = useCallback(() => {
    clearDebugLogs()
    message.success('Debug logs cleared')
  }, [clearDebugLogs, message])

  if (!panelOpen) return null

  return (
    <section className="debug-logs-panel" aria-label="Debug logs">
      <div className="debug-logs-header">
        <h3>
          <FileTextOutlined /> Debug Logs ({logs.length})
        </h3>
        <div className="debug-logs-actions">
          <span className={`debug-logs-mode ${debugMode ? 'is-on' : 'is-off'}`}>
            Debug Mode {debugMode ? 'On' : 'Off'}
          </span>
          <Tooltip title="Auto-scroll to newest log">
            <Switch
              size="small"
              checked={autoScroll}
              checkedChildren={<DownOutlined />}
              unCheckedChildren={<DownOutlined />}
              onChange={setDebugLogAutoScroll}
            />
          </Tooltip>
          <Space size="small">
            <Tooltip title="Copy debug logs">
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={handleCopy}
                disabled={logs.length === 0}
              >
                Copy
              </Button>
            </Tooltip>
            <Tooltip title="Clear debug logs">
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                onClick={handleClear}
                disabled={logs.length === 0}
              >
                Clear
              </Button>
            </Tooltip>
            <Tooltip title="Close debug logs">
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={() => setDebugLogPanelOpen(false)}
              />
            </Tooltip>
          </Space>
        </div>
      </div>
      <div className="debug-logs-body" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="debug-logs-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No debug logs" />
          </div>
        ) : (
          logs.map((entry) => <DebugLogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  )
}

interface DebugLogRowProps {
  entry: DebugLogEntry
}

function DebugLogRow({ entry }: DebugLogRowProps): React.ReactElement {
  return (
    <article className={`debug-log-entry debug-log-entry-${entry.level}`}>
      <div className="debug-log-line">
        <span className="debug-log-time">{formatTime(entry.timestamp)}</span>
        <span className={`debug-log-level debug-log-level-${entry.level}`}>{entry.level}</span>
        <span className="debug-log-scope">[{entry.scope}]</span>
        <span className="debug-log-message">{entry.message}</span>
      </div>
      {entry.payload !== undefined && (
        <pre className="debug-log-payload">{formatPayload(entry.payload)}</pre>
      )}
    </article>
  )
}

function formatDebugLogLine(entry: DebugLogEntry): string {
  const base = `${new Date(entry.timestamp).toISOString()} ${entry.level.toUpperCase()} [${entry.scope}] ${entry.message}`
  if (entry.payload === undefined) return base
  return `${base}\n${formatPayload(entry.payload)}`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + `.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}
