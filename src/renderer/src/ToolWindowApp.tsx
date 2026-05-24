import React, { useEffect, useState } from 'react'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { SnmpToolWindowContext } from '../../shared/toolWindowTypes'
import { SetToolWindowContent } from './components/SetMultiNodeDialog/SetToolWindowContent'
import { TableViewerContent } from './components/TableViewer/TableViewerContent'

export function ToolWindowApp(): React.ReactElement {
  const [context, setContext] = useState<SnmpToolWindowContext | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.snmpTool.getContext().then((next) => {
      if (mounted) setContext(next)
    }).catch(() => {
      if (mounted) setContext(null)
    })

    const cleanup = window.api.snmpTool.onContextUpdated((next) => {
      setContext(next)
    })

    return () => {
      mounted = false
      cleanup()
    }
  }, [])

  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1890ff' } }}>
      <AntApp>
        <div className="tool-window-container">
          {!context ? (
            <div className="tool-window-loading">
              <Spin />
            </div>
          ) : (
            context.kind === 'table'
              ? <TableViewerContent context={context} />
              : <SetToolWindowContent context={context} />
          )}
        </div>
      </AntApp>
    </ConfigProvider>
  )
}
