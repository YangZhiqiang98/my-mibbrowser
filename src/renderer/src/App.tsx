import React, { useEffect, useState, useCallback, useRef } from 'react'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Toolbar } from './components/Toolbar'
import { MibTreePanel } from './components/MibTreePanel'
import { QueryPanel } from './components/QueryPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { StatusBar } from './components/StatusBar'
import { DebugLogsPanel } from './components/DebugLogsPanel'
import { TrapConsolePanel } from './components/TrapConsolePanel'
import { normalizeSnmpConfig, useAppStore } from './stores/appStore'
import { buildTreeFromNodes } from './utils/mibTreeUtils'
import type { SnmpToolWindowToast } from '../../shared/toolWindowTypes'

export default function App(): React.ReactElement {
  const setProfiles = useAppStore((s) => s.setProfiles)
  const setMibTree = useAppStore((s) => s.setMibTree)
  const addLoadedModule = useAppStore((s) => s.addLoadedModule)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const [leftPanelWidth, setLeftPanelWidth] = useState(320)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = leftPanelWidth
    e.preventDefault()
  }, [leftPanelWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(600, Math.max(200, startWidth.current + delta))
      setLeftPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    // Load saved profiles on startup
    window.api.profile.load().then((profiles) => {
      setProfiles(profiles.map((profile) => ({
        ...profile,
        config: normalizeSnmpConfig(profile.config)
      })))
    }).catch(() => {})
    // Hydrate MIB tree and loaded modules from cached backend state on startup
    window.api.mib.getTree().then((nodes) => {
      if (nodes.length === 0) return
      const tree = buildTreeFromNodes(nodes)
      setMibTree(tree)
      // Aggregate unique module names from nodes so the status bar / loaded
      // modules list reflects what was restored from cache
      const moduleNames = new Set<string>()
      for (const node of nodes) {
        if (node.module) moduleNames.add(node.module)
      }
      for (const name of moduleNames) {
        addLoadedModule(name)
      }
      if (moduleNames.size > 0) {
        setStatusMessage(`Restored ${moduleNames.size} module(s) from cache`)
      }
    }).catch(() => {})
  }, [])

  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1890ff' } }}>
      <AntApp>
        <MainWindowToolBridge />
        <DebugLogBridge />
        <TrapReceiverBridge />
        <div className="app-container">
          <Toolbar />
          <div className="main-content">
            <MibTreePanel width={leftPanelWidth} />
            <div
              className="resize-handle"
              onMouseDown={handleMouseDown}
            />
            <div className="right-panel">
              <QueryPanel />
              <ResultsPanel />
            </div>
          </div>
          <DebugLogsPanel />
          <TrapConsolePanel />
          <StatusBar />
        </div>
      </AntApp>
    </ConfigProvider>
  )
}

function TrapReceiverBridge(): null {
  const appendTrapEvent = useAppStore((s) => s.appendTrapEvent)
  const setTrapReceiverStatus = useAppStore((s) => s.setTrapReceiverStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  useEffect(() => {
    void window.api.trap.getStatus().then(setTrapReceiverStatus).catch(() => undefined)

    const cleanupEvent = window.api.trap.onEvent((event) => {
      appendTrapEvent(event)
    })
    const cleanupStatus = window.api.trap.onStatus((status) => {
      setTrapReceiverStatus(status)
      setStatusMessage(status.message)
    })

    return () => {
      cleanupEvent()
      cleanupStatus()
    }
  }, [appendTrapEvent, setStatusMessage, setTrapReceiverStatus])

  return null
}

function DebugLogBridge(): null {
  const appendDebugLog = useAppStore((s) => s.appendDebugLog)

  useEffect(() => {
    return window.api.debug.onEntry((entry) => {
      appendDebugLog(entry)
    })
  }, [appendDebugLog])

  return null
}

function MainWindowToolBridge(): null {
  const { message: appMessage } = AntApp.useApp()
  const setResult = useAppStore((s) => s.setResult)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)

  useEffect(() => {
    const cleanupResult = window.api.snmpTool.onMainResultUpdate((update) => {
      setResult(update.session)
      if (update.connectionStatus) setConnectionStatus(update.connectionStatus)
      if (update.statusMessage) setStatusMessage(update.statusMessage)
      if (update.isQuerying !== undefined) setIsQuerying(update.isQuerying)
    })

    const cleanupStatus = window.api.snmpTool.onMainStatusUpdate((update) => {
      if (update.connectionStatus) setConnectionStatus(update.connectionStatus)
      if (update.statusMessage) setStatusMessage(update.statusMessage)
      if (update.isQuerying !== undefined) setIsQuerying(update.isQuerying)
    })

    const cleanupToast = window.api.snmpTool.onMainToast((toast) => {
      showToolToast(appMessage, toast)
    })

    return () => {
      cleanupResult()
      cleanupStatus()
      cleanupToast()
    }
  }, [appMessage, setConnectionStatus, setIsQuerying, setResult, setStatusMessage])

  return null
}

function showToolToast(messageApi: ReturnType<typeof AntApp.useApp>['message'], toast: SnmpToolWindowToast): void {
  switch (toast.kind) {
    case 'success':
      messageApi.success(toast.message)
      break
    case 'error':
      messageApi.error(toast.message)
      break
    case 'warning':
      messageApi.warning(toast.message)
      break
    case 'info':
      messageApi.info(toast.message)
      break
  }
}

