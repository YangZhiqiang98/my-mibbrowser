import React from 'react'
import { useAppStore } from '../stores/appStore'

export function StatusBar(): React.ReactElement {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const statusMessage = useAppStore((s) => s.statusMessage)
  const config = useAppStore((s) => s.snmpConfig)
  const resultsCount = useAppStore((s) => s.results.length)
  const loadedModules = useAppStore((s) => s.loadedModules)

  const statusLabel = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Error'
  }

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span>
          <span className={`status-indicator ${connectionStatus}`} />
          {statusLabel[connectionStatus]}
        </span>
        <span>{statusMessage}</span>
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
