import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Input, Button, Tooltip, message, Tree, Dropdown, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  SearchOutlined,
  FolderOpenOutlined,
  FolderAddOutlined,
  FileOutlined,
  TableOutlined,
  ClusterOutlined,
  AlertOutlined,
  CopyOutlined,
  ExpandOutlined,
  CompressOutlined,
  AimOutlined,
  SendOutlined,
  ScissorOutlined,
  NodeIndexOutlined,
  SwapOutlined,
  ReloadOutlined,
  DatabaseOutlined
} from '@ant-design/icons'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import { useAppStore } from '../stores/appStore'
import type { MibTreeNodeData } from '../types'
import type { ResultRow } from '../types'
import { buildTreeFromNodes } from '../utils/mibTreeUtils'
import { formatBytesToString } from '../utils/formatBytes'

const ACCESS_COLOR_MAP: Record<string, string> = {
  'read-only': 'blue',
  'read-write': 'green',
  'read-create': 'orange',
  'not-accessible': 'default',
  'accessible-for-notify': 'purple'
}

interface MibTreePanelProps {
  width: number
}

export function MibTreePanel({ width }: MibTreePanelProps): React.ReactElement {
  const mibTree = useAppStore((s) => s.mibTree)
  const setMibTree = useAppStore((s) => s.setMibTree)
  const selectedNode = useAppStore((s) => s.selectedMibNode)
  const setSelectedNode = useAppStore((s) => s.setSelectedMibNode)
  const setQueryOid = useAppStore((s) => s.setQueryOid)
  const addLoadedModule = useAppStore((s) => s.addLoadedModule)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const snmpConfig = useAppStore((s) => s.snmpConfig)
  const addResults = useAppStore((s) => s.addResults)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)

  const [searchText, setSearchText] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [detailHeight, setDetailHeight] = useState(180)
  const treeRef = useRef<{ scrollTo: (info: { key: string }) => void } | null>(null)
  const isDetailDragging = useRef(false)
  const detailStartY = useRef(0)
  const detailStartHeight = useRef(0)

  // Debounced search: avoid expensive tree walk on every keystroke / paste
  useEffect(() => {
    const timerId = setTimeout(() => {
      const lowerSearch = searchText.trim().toLowerCase()
      if (!lowerSearch) {
        setSearchMatchIds([])
        setCurrentMatchIndex(0)
        return
      }

      const matchIds: string[] = []
      const ancestorIds = new Set<string>()

      function collectMatches(nodes: MibTreeNodeData[], ancestors: string[]) {
        for (const node of nodes) {
          const isMatch = node.name.toLowerCase().includes(lowerSearch) ||
            node.oid.toLowerCase().includes(lowerSearch)
          if (isMatch) {
            matchIds.push(node.id)
            for (const a of ancestors) ancestorIds.add(a)
          }
          collectMatches(node.children, [...ancestors, node.id])
        }
      }
      collectMatches(mibTree, [])

      setSearchMatchIds(matchIds)
      setCurrentMatchIndex(0)

      // Expand ancestors of all matches and auto-select the first match
      if (matchIds.length > 0) {
        setExpandedKeys(prev => [...new Set([...prev, ...ancestorIds])])
        const firstMatch = findNodeById(mibTree, matchIds[0])
        if (firstMatch) {
          setSelectedNode(firstMatch)
          setQueryOid(firstMatch.oid)
        }
      }
    }, 150)

    return () => clearTimeout(timerId)
  }, [searchText, mibTree])

  // Scroll to current match when cycling through results
  useEffect(() => {
    if (searchMatchIds.length === 0) return
    const matchId = searchMatchIds[currentMatchIndex]
    if (!matchId) return

    // Expand ancestors of the current match
    const ancestors = findAncestorIds(mibTree, matchId)
    if (ancestors.length > 0) {
      setExpandedKeys(prev => [...new Set([...prev, ...ancestors])])
    }

    // Scroll to the match node after a delay to let tree expand and render
    const timerId = setTimeout(() => {
      // Use DOM-based scrollIntoView as it's more reliable than antd Tree's scrollTo
      const treeContent = document.querySelector('.mib-tree-content')
      if (!treeContent) return
      const nodeEl = treeContent.querySelector(`[data-node-id="${matchId}"]`)
      if (nodeEl) {
        nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        // Fallback: try antd Tree's scrollTo
        try {
          treeRef.current?.scrollTo({ key: matchId })
        } catch {
          // Ignore scroll errors
        }
      }
    }, 150)
    return () => clearTimeout(timerId)
  }, [currentMatchIndex, searchMatchIds, mibTree])

  // Vertical resize handle for node detail panel
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDetailDragging.current) return
      const delta = detailStartY.current - e.clientY
      const newHeight = Math.min(400, Math.max(80, detailStartHeight.current + delta))
      setDetailHeight(newHeight)
    }
    const handleMouseUp = () => {
      isDetailDragging.current = false
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleDetailResizeMouseDown = useCallback((e: React.MouseEvent) => {
    isDetailDragging.current = true
    detailStartY.current = e.clientY
    detailStartHeight.current = detailHeight
    e.preventDefault()
  }, [detailHeight])

  // Handle Enter key in search input to cycle through matches
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (searchMatchIds.length === 0) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        // Previous match
        setCurrentMatchIndex(prev => (prev - 1 + searchMatchIds.length) % searchMatchIds.length)
      } else {
        // Next match
        setCurrentMatchIndex(prev => (prev + 1) % searchMatchIds.length)
      }
    }
  }, [searchMatchIds.length])

  // Always convert the full mibTree to DataNode format (no filtering)
  const searchMatchSet = useMemo(() => new Set(searchMatchIds), [searchMatchIds])
  const filteredTreeData = useMemo(() => {
    return mibTree.map((node) => convertToDataNode(node, searchMatchSet))
  }, [mibTree, searchMatchSet])

  // Collect all valid node IDs from the current tree for validation
  const validNodeIds = useMemo(() => {
    const ids = new Set<string>()
    function collect(nodes: MibTreeNodeData[]) {
      for (const node of nodes) {
        ids.add(node.id)
        collect(node.children)
      }
    }
    collect(mibTree)
    return ids
  }, [mibTree])

  // Clean up stale expandedKeys when tree data changes
  useEffect(() => {
    setExpandedKeys(prev => {
      const valid = prev.filter(k => validNodeIds.has(k))
      if (valid.length === prev.length) return prev // No change
      return valid
    })
  }, [validNodeIds])

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

  const handleSelectCacheDir = useCallback(async () => {
    const cacheDir = await window.api.mib.selectCacheDir()
    if (cacheDir) {
      // Refresh tree from newly loaded cache files
      const nodes = await window.api.mib.getTree()
      const tree = buildTreeFromNodes(nodes)
      setMibTree(tree)
      message.success(`Cache directory set: ${cacheDir}`)
      setStatusMessage(`Cache directory: ${cacheDir}`)
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

  const [contextMenuNode, setContextMenuNode] = useState<MibTreeNodeData | null>(null)

  const collectSubtreeKeys = useCallback((node: MibTreeNodeData): string[] => {
    const keys = [node.id]
    for (const child of node.children) {
      keys.push(...collectSubtreeKeys(child))
    }
    return keys
  }, [])

  const handleRightClick = useCallback(({ node }: { node: EventDataNode<DataNode> }) => {
    const found = findNodeById(mibTree, node.key as string)
    if (found) {
      setContextMenuNode(found)
    }
  }, [mibTree])

  const executeSnmpOperation = useCallback(async (
    operation: 'GET' | 'GETNEXT' | 'GETBULK' | 'WALK' | 'BULK_WALK',
    node: MibTreeNodeData
  ) => {
    const oid = node.oid
    if (!oid) {
      message.warning('No OID available for this node')
      return
    }

    setIsQuerying(true)
    setConnectionStatus('connecting')
    setStatusMessage(`Executing ${operation} on ${oid}...`)

    try {
      let result: {
        success: boolean
        varbinds: Array<{ oid: string; name?: string; value: string | number | Buffer | null; type: string; isError: boolean; error?: string }>
        error?: string
        responseTime: number
        timestamp: number
      }

      switch (operation) {
        case 'GET':
          result = await window.api.snmp.get(snmpConfig, [oid])
          break
        case 'GETNEXT':
          result = await window.api.snmp.getNext(snmpConfig, [oid])
          break
        case 'GETBULK': {
          // Smart multi-column GETBULK: on a table/entry node, fan out across
          // every column OID under the entry so a single getBulk returns
          // rows from all columns. Falls back to single OID for leaves.
          const oids = resolveBulkOids(node)
          result = await window.api.snmp.getBulk(snmpConfig, oids, 10)
          break
        }
        case 'WALK':
          result = await window.api.snmp.walk(snmpConfig, oid)
          break
        case 'BULK_WALK':
          result = await window.api.snmp.bulkWalk(snmpConfig, oid, 10)
          break
      }

      if (result.success) {
        setConnectionStatus('connected')
        const rows: ResultRow[] = result.varbinds.map((vb, idx) => ({
          key: `${result.timestamp}-${idx}`,
          oid: vb.oid,
          name: vb.name || '',
          value: formatVarbindValue(vb.value, vb.type),
          type: vb.type,
          status: vb.isError ? 'error' as const : 'success' as const,
          timestamp: new Date(result.timestamp).toLocaleTimeString(),
          responseTime: result.responseTime
        }))
        addResults(rows)
        setStatusMessage(`${operation}: ${rows.length} result(s), ${result.responseTime}ms`)
      } else {
        setConnectionStatus('error')
        message.error(`SNMP error: ${result.error}`)
        setStatusMessage(`Error: ${result.error}`)
      }
    } catch (err) {
      setConnectionStatus('error')
      const errMsg = err instanceof Error ? err.message : String(err)
      message.error(`Request failed: ${errMsg}`)
      setStatusMessage(`Error: ${errMsg}`)
    } finally {
      setIsQuerying(false)
    }
  }, [snmpConfig, addResults, setConnectionStatus, setStatusMessage, setIsQuerying])

  const contextMenuItems: MenuProps['items'] = useMemo(() => {
    if (!contextMenuNode) return []

    const hasOid = !!contextMenuNode.oid

    return [
      {
        key: 'snmp-ops',
        type: 'group' as const,
        label: 'SNMP Operations',
        children: [
          {
            key: 'snmp-get',
            icon: <SendOutlined />,
            label: 'GET',
            disabled: !hasOid,
            onClick: () => executeSnmpOperation('GET', contextMenuNode)
          },
          {
            key: 'snmp-getnext',
            icon: <SwapOutlined />,
            label: 'GETNEXT',
            disabled: !hasOid,
            onClick: () => executeSnmpOperation('GETNEXT', contextMenuNode)
          },
          {
            key: 'snmp-getbulk',
            icon: <NodeIndexOutlined />,
            label: 'GETBULK',
            disabled: !hasOid,
            onClick: () => executeSnmpOperation('GETBULK', contextMenuNode)
          },
          {
            key: 'snmp-walk',
            icon: <ReloadOutlined />,
            label: 'WALK',
            disabled: !hasOid,
            onClick: () => executeSnmpOperation('WALK', contextMenuNode)
          },
          {
            key: 'snmp-bulkwalk',
            icon: <ScissorOutlined />,
            label: 'BULK WALK',
            disabled: !hasOid,
            onClick: () => executeSnmpOperation('BULK_WALK', contextMenuNode)
          }
        ]
      },
      { type: 'divider' as const },
      {
        key: 'copy-oid',
        icon: <CopyOutlined />,
        label: 'Copy OID',
        onClick: () => {
          navigator.clipboard.writeText(contextMenuNode.oid).catch(() => {})
          message.success('OID copied')
        }
      },
      {
        key: 'copy-name',
        icon: <CopyOutlined />,
        label: 'Copy Name',
        onClick: () => {
          navigator.clipboard.writeText(contextMenuNode.name).catch(() => {})
          message.success('Name copied')
        }
      },
      {
        key: 'set-query-oid',
        icon: <AimOutlined />,
        label: 'Set as Query OID',
        onClick: () => {
          setQueryOid(contextMenuNode.oid)
          setSelectedNode(contextMenuNode)
        }
      },
      { type: 'divider' as const },
      {
        key: 'expand-all',
        icon: <ExpandOutlined />,
        label: 'Expand All',
        onClick: () => {
          const allKeys = collectSubtreeKeys(contextMenuNode)
          setExpandedKeys((prev) => [...new Set([...prev, ...allKeys])])
        }
      },
      {
        key: 'collapse-all',
        icon: <CompressOutlined />,
        label: 'Collapse All',
        onClick: () => {
          const subtreeKeys = new Set(collectSubtreeKeys(contextMenuNode))
          setExpandedKeys((prev) => prev.filter((k) => !subtreeKeys.has(k)))
        }
      }
    ]
  }, [contextMenuNode, collectSubtreeKeys, setQueryOid, setSelectedNode, executeSnmpOperation])

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
      style={{
        width: `${width}px`,
        minWidth: '200px',
        ...(isDragOver ? { borderRight: '2px solid #1890ff', background: '#e6f7ff' } : {})
      }}
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
          <Tooltip title="Select Cache Directory">
            <Button
              icon={<DatabaseOutlined />}
              size="small"
              onClick={handleSelectCacheDir}
            >
              Cache
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="mib-tree-search">
        <Input
          placeholder="Search by name or OID (Enter=next, Shift+Enter=prev)"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          size="small"
          allowClear
        />
        {searchMatchIds.length > 0 && (
          <span style={{ fontSize: 11, color: '#666', marginTop: 2, display: 'block' }}>
            {currentMatchIndex + 1} / {searchMatchIds.length} matches
          </span>
        )}
      </div>

      <div className="mib-tree-content">
        {filteredTreeData.length > 0 ? (
          <Dropdown
            menu={{ items: contextMenuItems }}
            trigger={['contextMenu']}
          >
            <div>
              <Tree
                ref={treeRef as never}
                treeData={filteredTreeData}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys as string[])}
                selectedKeys={selectedNode ? [selectedNode.id] : []}
                onSelect={(keys) => handleSelect(keys)}
                onRightClick={handleRightClick}
                showIcon
                blockNode
                autoExpandParent={false}
                style={{ background: 'transparent' }}
              />
            </div>
          </Dropdown>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
            <ClusterOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
            <p>No MIB files loaded</p>
            <p style={{ fontSize: 12 }}>Click "Files" or "Directory" to load MIB definitions</p>
            <p style={{ fontSize: 12 }}>or drag and drop .my/.mib files here</p>
          </div>
        )}
      </div>

      {/* Node detail section with vertical resize handle */}
      {selectedNode && (
        <>
          <div
            className="detail-resize-handle"
            onMouseDown={handleDetailResizeMouseDown}
          />
          <div className="node-detail" style={{ height: `${detailHeight}px` }}>
            <div className="node-detail-header">
              <span className="node-detail-icon">{getNodeIcon(selectedNode.kind)}</span>
              <span className="node-detail-title">{selectedNode.name}</span>
              <Tag
                color={ACCESS_COLOR_MAP[selectedNode.access] || 'default'}
                style={{ marginLeft: 'auto', fontSize: 11 }}
              >
                {selectedNode.access}
              </Tag>
            </div>
            <div className="node-detail-body">
              <div className="node-detail-row">
                <span className="node-detail-label">OID</span>
                <span className="node-detail-value node-detail-oid">{selectedNode.oid || '—'}</span>
              </div>
              <div className="node-detail-row">
                <span className="node-detail-label">Syntax</span>
                <span className="node-detail-value">{selectedNode.syntax || '—'}</span>
              </div>
              <div className="node-detail-row">
                <span className="node-detail-label">Kind</span>
                <span className="node-detail-value">{selectedNode.kind || '—'}</span>
              </div>
              <div className="node-detail-row">
                <span className="node-detail-label">Module</span>
                <span className="node-detail-value">{selectedNode.module || '—'}</span>
              </div>
              {selectedNode.description && (
                <div className="node-detail-row node-detail-desc">
                  <span className="node-detail-label">Description</span>
                  <span className="node-detail-value">{selectedNode.description}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Convert MibTreeNodeData to antd DataNode
 */
function convertToDataNode(node: MibTreeNodeData, searchMatchSet: Set<string>): DataNode {
  const icon = getNodeIcon(node.kind)
  const isMatch = searchMatchSet.has(node.id)

  return {
    key: node.id,
    title: (
      <span
        className="mib-node-title"
        data-node-id={node.id}
        onDoubleClick={() => useAppStore.getState().setQueryOid(node.oid)}
        style={isMatch ? { background: '#fff3cd', padding: '0 2px', borderRadius: 2 } : undefined}
      >
        {node.name}
      </span>
    ),
    icon: <span className={`mib-node-icon mib-node-${node.kind}`}>{icon}</span>,
    children: node.children.map((child) => convertToDataNode(child, searchMatchSet)),
    isLeaf: node.children.length === 0
  }
}

/**
 * Get icon component for node kind - matching MG-SOFT style with distinct icons per type
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
    case 'module': return <FolderOpenOutlined />
    default: return <FileOutlined />
  }
}

/**
 * Find ancestor IDs of a node by its ID, used to expand tree to reveal a match
 */
function findAncestorIds(nodes: MibTreeNodeData[], targetId: string, ancestors: string[] = []): string[] {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors
    const found = findAncestorIds(node.children, targetId, [...ancestors, node.id])
    if (found.length > 0) return found
  }
  return []
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

/**
 * Resolve the list of OIDs to send in a GETBULK request for the given node.
 *
 * For a table node, expand to every column OID under the (single) entry child.
 * For an entry node, return every column OID directly under it.
 * For any leaf / scalar / column / unrecognized node, fall back to the node's
 * own OID. The fallback also covers tables/entries without column children so
 * the caller always gets at least one OID to send.
 */
function resolveBulkOids(node: MibTreeNodeData): string[] {
  if (node.kind === 'table') {
    const entry = node.children.find((child) => child.kind === 'entry')
    if (entry) {
      const columnOids = entry.children
        .filter((child) => child.kind === 'column' && !!child.oid)
        .map((child) => child.oid)
      if (columnOids.length > 0) return columnOids
    }
  } else if (node.kind === 'entry') {
    const columnOids = node.children
      .filter((child) => child.kind === 'column' && !!child.oid)
      .map((child) => child.oid)
    if (columnOids.length > 0) return columnOids
  }

  return [node.oid]
}

/**
 * Format a varbind value for display in results
 */
function formatVarbindValue(value: string | number | Buffer | null, type: string): string {
  if (value === null || value === undefined) return ''

  // Handle serialized Buffer from IPC: { type: 'Buffer', data: number[] }
  // Electron IPC may serialize Buffer to a plain object in the renderer context
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as unknown as Record<string, unknown>
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      const bytes = obj.data as number[]
      return formatBytesToString(bytes, type)
    }
    // Plain Buffer object (from structured clone)
    if (typeof (value as Buffer).length === 'number' && typeof (value as Buffer)[0] !== 'undefined') {
      const bytes = Array.from(value as Buffer)
      return formatBytesToString(bytes, type)
    }
    // Fallback: try JSON serialization for unknown objects
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  if (type === 'TimeTicks') {
    const ticks = Number(value)
    const days = Math.floor(ticks / 8640000)
    const hours = Math.floor((ticks % 8640000) / 360000)
    const minutes = Math.floor((ticks % 360000) / 6000)
    const seconds = Math.floor((ticks % 6000) / 100)
    const hundredths = ticks % 100
    return `${days}d ${hours}h ${minutes}m ${seconds}.${hundredths}s`
  }

  return String(value)
}

