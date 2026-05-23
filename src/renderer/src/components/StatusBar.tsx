import React from 'react'
import { Button, Tooltip } from 'antd'
import { StopOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'

export function StatusBar(): React.ReactElement {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const statusMessage = useAppStore((s) => s.statusMessage)
  const config = useAppStore((s) => s.snmpConfig)
  // PR3: results count now derives from the current dynamic-column session so
  // it matches what ResultsPanel actually renders. The legacy `s.results`
  // array is a permanent empty shim (PR2 deferred its removal) so it cannot
  // surface zero-vs-N truth.
  const currentResult = useAppStore((s) => s.currentResult)
  const loadedModules = useAppStore((s) => s.loadedModules)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const resultsCount = currentResult?.rows.length ?? 0
  const isEmptyResultSession = currentResult !== null && currentResult.rows.length === 0

  const handleAbort = async (): Promise<void> => {
    const cancelled = await window.api.snmp.cancel()
    if (cancelled) {
      setStatusMessage('Abort requested...')
    }
  }

  const statusLabel = {
    disconnected: 'Ready',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Connection Error'
  }

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span>
          <span className={`status-indicator ${connectionStatus}`} />
          {statusLabel[connectionStatus]}
        </span>
        <span>{statusMessage}</span>
        {isEmptyResultSession && (
          <span style={{ color: '#fa8c16' }}>本次操作结果为空</span>
        )}
        <Tooltip title={isQuerying ? '中止当前 SNMP 操作' : '当前无运行中的操作'}>
          {/* span wrapper keeps the Tooltip working when the Button is disabled */}
          <span>
            <Button
              type="text"
              danger
              size="small"
              icon={<StopOutlined />}
              onClick={handleAbort}
              disabled={!isQuerying}
              style={{ marginLeft: 8 }}
            >
              取消
            </Button>
          </span>
        </Tooltip>
      </div>
      <div className="status-bar-right">
        <span>Host: {config.host}:{config.port}</span>
        <span>Version: {config.version}</span>
        <span>Results: {resultsCount}</span>
        <span>MIB Modules: {loadedModules.length}</span>
      </div>
    </div>
  )
}
