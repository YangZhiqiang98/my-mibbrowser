import React, { useState, useCallback, useMemo } from 'react'
import { Input, Button, Tooltip, message, Tree } from 'antd'
import {
  SearchOutlined,
  FolderOpenOutlined,
  FolderAddOutlined,
  FileOutlined,
  TableOutlined,
  ClusterOutlined,
  AlertOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import { useAppStore } from '../stores/appStore'
import type { MibTreeNodeData } from '../types'
import { buildTreeFromNodes } from '../utils/mibTreeUtils'

export function MibTreePanel(): React.ReactElement {
  const mibTree = useAppStore((s) => s.mibTree)
  const setMibTree = useAppStore((s) => s.setMibTree)
  const selectedNode = useAppStore((s) => s.selectedMibNode)
  const setSelectedNode = useAppStore((s) => s.setSelectedMibNode)
  const setQueryOid = useAppStore((s) => s.setQueryOid)
  const addLoadedModule = useAppStore((s) => s.addLoadedModule)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  const [searchText, setSearchText] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // Filter MIB tree based on search, then convert to antd DataNode format
  const filteredTreeData = useMemo(() => {
    const lowerSearch = searchText.trim().toLowerCase()
    const filtered = lowerSearch
      ? filterMibTree(mibTree, lowerSearch)
      : mibTree
    return filtered.map((node) => convertToDataNode(node, searchText))
  }, [mibTree, searchText])

  const handleOpenFiles = useCallback(async () => {
    setStatusMessage('Loading MIB files...')
    const result = await window.api.mib.openFiles()
    if (result.errors.length > 0) {
      message.error(`Parse errors: ${result.errors.map((e: { message: string }) => e.message).join('; ')}`)
    }
    if (result.modules.length > 0) {
      const nodes = await window.api.mib.getTree()
      const tree = buildTreeFromNodes(nodes)
      setMibTree(tree)
      for (const mod of result.modules) {
        addLoadedModule(mod.name)
      }
      message.success(`Loaded ${result.modules.length} MIB module(s)`)
      setStatusMessage(`Loaded ${result.modules.length} module(s)`)
    } else if (result.errors.length === 0) {
      setStatusMessage('Ready')
    }
  }, [])

  const handleOpenDirectory = useCallback(async () => {
    setStatusMessage('Loading MIB directory...')
    const result = await window.api.mib.openDirectory()
    if (result.errors.length > 0) {
      message.error(`Parse errors: ${result.errors.map((e: { message: string }) => e.message).join('; ')}`)
    }
    if (result.modules.length > 0) {
      const nodes = await window.api.mib.getTree()
      const tree = buildTreeFromNodes(nodes)
      setMibTree(tree)
      for (const mod of result.modules) {
        addLoadedModule(mod.name)
      }
      message.success(`Loaded ${result.modules.length} MIB module(s)`)
      setStatusMessage(`Loaded ${result.modules.length} module(s)`)
    } else if (result.errors.length === 0) {
      setStatusMessage('Ready')
    }
  }, [])

  const handleSelect = useCallback((selectedKeys: React.Key[]) => {
    if (selectedKeys.length === 0) {
      setSelectedNode(null)
      return
    }
    const nodeId = selectedKeys[0] as string
    const node = findNodeById(mibTree, nodeId)
    if (node) {
      setSelectedNode(node)
      setQueryOid(node.oid)
    }
  }, [mibTree])

  const handleDoubleClick = useCallback((node: MibTreeNodeData) => {
    setQueryOid(node.oid)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter(
      (f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
        return ['my', 'mib', 'txt'].includes(ext)
      }
    )

    if (files.length === 0) {
      message.warning('No valid MIB files found. Supported extensions: .my, .mib, .txt')
      return
    }

    setStatusMessage(`Loading ${files.length} dropped MIB file(s)...`)

    // Read file contents in the renderer via FileReader, then send to main process
    const readPromises = files.map(
      (file) =>
        new Promise<{ name: string; content: string }>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            resolve({ name: file.name, content: reader.result as string })
          }
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
          reader.readAsText(file)
        })
    )

    try {
      const fileContents = await Promise.all(readPromises)
      const result = await window.api.mib.loadContent(fileContents)

      if (result.errors.length > 0) {
        message.error(`Parse errors: ${result.errors.map((e: { message: string }) => e.message).join('; ')}`)
      }
      if (result.modules.length > 0) {
        const nodes = await window.api.mib.getTree()
        const tree = buildTreeFromNodes(nodes)
        setMibTree(tree)
        for (const mod of result.modules) {
          addLoadedModule(mod.name)
        }
        message.success(`Loaded ${result.modules.length} MIB module(s) from dropped files`)
        setStatusMessage(`Loaded ${result.modules.length} module(s)`)
      } else if (result.errors.length === 0) {
        setStatusMessage('Ready')
      }
    } catch {
      message.error('Failed to read dropped files')
      setStatusMessage('Ready')
    }
  }, [setMibTree, addLoadedModule, setStatusMessage])

  return (
    <div
      className="mib-tree-panel"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={isDragOver ? { borderRight: '2px solid #1890ff', background: '#e6f7ff' } : undefined}
    >
      <div className="mib-tree-header">
        <h3>
          <ClusterOutlined /> MIB Tree
        </h3>
        <div className="mib-tree-actions">
          <Tooltip title="Open MIB Files">
            <Button
              icon={<FolderOpenOutlined />}
              size="small"
              onClick={handleOpenFiles}
            >
              Files
            </Button>
          </Tooltip>
          <Tooltip title="Open MIB Directory">
            <Button
              icon={<FolderAddOutlined />}
              size="small"
              onClick={handleOpenDirectory}
            >
              Directory
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="mib-tree-search">
        <Input
          placeholder="Search by name or OID"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="small"
          allowClear
        />
      </div>

      <div className="mib-tree-content">
        {filteredTreeData.length > 0 ? (
          <Tree
            treeData={filteredTreeData}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            selectedKeys={selectedNode ? [selectedNode.id] : []}
            onSelect={(keys) => handleSelect(keys)}
            showIcon
            blockNode
            style={{ background: 'transparent' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
            <ClusterOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
            <p>No MIB files loaded</p>
            <p style={{ fontSize: 12 }}>Click "Files" or "Directory" to load MIB definitions</p>
            <p style={{ fontSize: 12 }}>or drag and drop .my/.mib files here</p>
          </div>
        )}
      </div>

      {/* Node detail section */}
      {selectedNode && (
        <div className="node-detail">
          <h4>
            <InfoCircleOutlined /> {selectedNode.name}
          </h4>
          <div className="node-detail-row">
            <span className="node-detail-label">OID:</span>
            <span className="node-detail-value">{selectedNode.oid}</span>
          </div>
          <div className="node-detail-row">
            <span className="node-detail-label">Type:</span>
            <span className="node-detail-value">{selectedNode.syntax}</span>
          </div>
          <div className="node-detail-row">
            <span className="node-detail-label">Access:</span>
            <span className="node-detail-value">{selectedNode.access}</span>
          </div>
          <div className="node-detail-row">
            <span className="node-detail-label">Module:</span>
            <span className="node-detail-value">{selectedNode.module}</span>
          </div>
          {selectedNode.description && (
            <div className="node-detail-row">
              <span className="node-detail-label">Description:</span>
              <span className="node-detail-value">{selectedNode.description}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Convert MibTreeNodeData to antd DataNode
 */
function convertToDataNode(node: MibTreeNodeData, searchText: string): DataNode {
  const icon = getNodeIcon(node.kind)
  const isMatch = searchText && (
    node.name.toLowerCase().includes(searchText.toLowerCase()) ||
    node.oid.includes(searchText)
  )

  return {
    key: node.id,
    title: (
      <span
        onDoubleClick={() => useAppStore.getState().setQueryOid(node.oid)}
        style={isMatch ? { background: '#fff3cd', padding: '0 2px', borderRadius: 2 } : undefined}
      >
        <span className={`mib-node-icon ${node.kind}`}>{icon}</span>
        <span className="mib-node-name">{node.name}</span>
        <span className="mib-node-oid">{node.oid}</span>
      </span>
    ),
    icon,
    children: node.children.map((child) => convertToDataNode(child, searchText)),
    isLeaf: node.children.length === 0
  }
}

/**
 * Get icon for node kind
 */
function getNodeIcon(kind: string): React.ReactNode {
  switch (kind) {
    case 'scalar': return <FileOutlined />
    case 'table': return <TableOutlined />
    case 'entry': return <FolderOpenOutlined />
    case 'column': return <FileOutlined />
    case 'notification': return <AlertOutlined />
    case 'group': return <ClusterOutlined />
    case 'root': return <ClusterOutlined />
    default: return <FileOutlined />
  }
}

/**
 * Filter MIB tree nodes by search text (operates on raw data, not JSX)
 */
function filterMibTree(nodes: MibTreeNodeData[], searchText: string): MibTreeNodeData[] {
  const result: MibTreeNodeData[] = []
  for (const node of nodes) {
    const matchesSelf = node.name.toLowerCase().includes(searchText) ||
      node.oid.includes(searchText)
    const filteredChildren = filterMibTree(node.children, searchText)

    if (matchesSelf || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren
      })
    }
  }
  return result
}

/**
 * Find a node by ID in the tree
 */
function findNodeById(nodes: MibTreeNodeData[], id: string): MibTreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found) return found
  }
  return null
}
