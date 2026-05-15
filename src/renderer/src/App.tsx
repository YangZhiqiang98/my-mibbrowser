import React, { useEffect, useState, useCallback, useRef } from 'react'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Toolbar } from './components/Toolbar'
import { MibTreePanel } from './components/MibTreePanel'
import { QueryPanel } from './components/QueryPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { StatusBar } from './components/StatusBar'
import { useAppStore } from './stores/appStore'
import { buildTreeFromNodes } from './utils/mibTreeUtils'

export default function App(): React.ReactElement {
  const setProfiles = useAppStore((s) => s.setProfiles)
  const setMibTree = useAppStore((s) => s.setMibTree)

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
    window.api.profile.load().then(setProfiles).catch(() => {})
    // Load existing MIB tree if any
    window.api.mib.getTree().then((nodes) => {
      if (nodes.length > 0) {
        const tree = buildTreeFromNodes(nodes)
        setMibTree(tree)
      }
    }).catch(() => {})
  }, [])

  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1890ff' } }}>
      <AntApp>
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
          <StatusBar />
        </div>
      </AntApp>
    </ConfigProvider>
  )
}

