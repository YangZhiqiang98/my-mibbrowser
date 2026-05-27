import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Input, Button, Tooltip, message, Tree, Dropdown, Tag, App, Modal, Switch, Empty } from 'antd'
import type { MenuProps, TreeProps } from 'antd'
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
  ReloadOutlined,
  DatabaseOutlined,
  EditOutlined,
  ProfileOutlined,
  DeleteOutlined,
  PlusOutlined
} from '@ant-design/icons'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import { useAppStore } from '../stores/appStore'
import type { MibTreeNodeData } from '../types'
import type { SnmpResult } from '../../../main/snmp/types'
import { buildTreeFromNodes } from '../utils/mibTreeUtils'
import { buildMibTreeIndex } from '../utils/mibTreeIndex'
import { createMibTreeDataNodeBuilder } from '../utils/mibTreeDataNodes'
import { toSlimToolWindowMibNode, toToolWindowMibSubtree } from '../utils/toolWindowMibContext'
import { buildResultSession, initResolveContext, resolveVarbind } from '../utils/resultColumns'
import { createStreamingResultBatcher } from '../utils/streamingResultBatcher'
import { isTableColumnChild } from '../utils/tableSession'
import type { MibNode, MibParseResult } from '../../../main/mib/types'
import type { CacheDirectoryOperationResult, CacheDirectorySource } from '../../../shared/cacheDirectoryTypes'

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

interface MibDiagnosticsState {
  parseErrors: string[]
  dependencyWarnings: string[]
  warnings: string[]
}

export function MibTreePanel({ width }: MibTreePanelProps): React.ReactElement {
  // Tool-window launch errors use the App-bound message API. The legacy
  // static `message` import is still used by parse / load paths in this panel.
  const { message: appMessage, modal, notification } = App.useApp()
  const mibTree = useAppStore((s) => s.mibTree)
  const setMibTree = useAppStore((s) => s.setMibTree)
  const selectedNode = useAppStore((s) => s.selectedMibNode)
  const setSelectedNode = useAppStore((s) => s.setSelectedMibNode)
  const setQueryOid = useAppStore((s) => s.setQueryOid)
  const setLoadedModules = useAppStore((s) => s.setLoadedModules)
  const addLoadedModule = useAppStore((s) => s.addLoadedModule)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const snmpConfig = useAppStore((s) => s.snmpConfig)
  const setResult = useAppStore((s) => s.setResult)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  const initResultSession = useAppStore((s) => s.initResultSession)
  const appendResultVarbinds = useAppStore((s) => s.appendResultVarbinds)

  const [searchText, setSearchText] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [detailHeight, setDetailHeight] = useState(180)
  const [mibDiagnostics, setMibDiagnostics] = useState<MibDiagnosticsState | null>(null)
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false)
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false)
  const [cacheDirectories, setCacheDirectories] = useState<CacheDirectorySource[]>([])
  const [isCacheDirectoriesLoading, setIsCacheDirectoriesLoading] = useState(false)
  const [cacheDirectoryBusyId, setCacheDirectoryBusyId] = useState<string | null>(null)
  const treeRef = useRef<{ scrollTo: (info: { key: string }) => void } | null>(null)
  const isDetailDragging = useRef(false)
  const detailStartY = useRef(0)
  const detailStartHeight = useRef(0)
  const dragSequence = useRef(0)
  const dataNodeBuilder = useMemo(() => createMibTreeDataNodeBuilder(), [])
  const treeIndex = useMemo(() => buildMibTreeIndex(mibTree), [mibTree])

  // Perform MIB tree search: find matching nodes, expand ancestors, and select first match
  const performSearch = useCallback((query: string) => {
    const searchResult = treeIndex.search(query)
    if (searchResult.matchIds.length === 0) {
      setSearchMatchIds([])
      setCurrentMatchIndex(0)
      return
    }

    setSearchMatchIds(searchResult.matchIds)
    setCurrentMatchIndex(0)

    // Expand ancestors of all matches and auto-select the first match
    setExpandedKeys(prev => [...new Set([...prev, ...searchResult.ancestorIds])])
    const firstMatch = treeIndex.nodeById.get(searchResult.matchIds[0])
    if (firstMatch) {
      setSelectedNode(firstMatch)
      setQueryOid(firstMatch.oid)
    }
  }, [treeIndex, setSelectedNode, setQueryOid])

  // Scroll to current match when cycling through results
  useEffect(() => {
    if (searchMatchIds.length === 0) return
    const matchId = searchMatchIds[currentMatchIndex]
    if (!matchId) return

    // Expand ancestors of the current match
    const ancestors = treeIndex.getAncestorIds(matchId)
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
  }, [currentMatchIndex, searchMatchIds, treeIndex])

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

  // Handle Enter key: trigger search on first press, cycle matches on subsequent presses
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchMatchIds.length === 0) {
        // No matches yet — perform initial search
        performSearch(searchText)
      } else if (e.shiftKey) {
        // Previous match
        setCurrentMatchIndex(prev => (prev - 1 + searchMatchIds.length) % searchMatchIds.length)
      } else {
        // Next match
        setCurrentMatchIndex(prev => (prev + 1) % searchMatchIds.length)
      }
    }
  }, [searchText, searchMatchIds.length, performSearch])

  const handleNodeTitleDoubleClick = useCallback((oid: string): void => {
    setQueryOid(oid)
  }, [setQueryOid])

  // Always display the full mibTree, reusing DataNode objects for unchanged branches.
  const searchMatchSet = useMemo(() => new Set(searchMatchIds), [searchMatchIds])
  const filteredTreeData = useMemo(() => {
    return dataNodeBuilder.build(mibTree, {
      searchMatchIds: searchMatchSet,
      getNodeIcon,
      onNodeDoubleClick: handleNodeTitleDoubleClick
    })
  }, [dataNodeBuilder, mibTree, searchMatchSet, handleNodeTitleDoubleClick])

  // Clean up stale expandedKeys when tree data changes
  useEffect(() => {
    setExpandedKeys(prev => {
      const valid = prev.filter(k => treeIndex.validNodeIds.has(k))
      if (valid.length === prev.length) return prev // No change
      return valid
    })
  }, [treeIndex])

  // Clean up stale search matches when cache refresh removes tree nodes.
  useEffect(() => {
    const valid = searchMatchIds.filter(k => treeIndex.validNodeIds.has(k))
    if (valid.length === searchMatchIds.length) return

    setSearchMatchIds(valid)
    setCurrentMatchIndex(current => valid.length === 0 ? 0 : Math.min(current, valid.length - 1))
  }, [searchMatchIds, treeIndex])

  const showMibParseDiagnostics = useCallback((result: MibParseResult): void => {
    const diagnostics = buildMibDiagnostics(result)
    const totalCount = diagnostics.parseErrors.length + diagnostics.dependencyWarnings.length + diagnostics.warnings.length
    if (totalCount === 0) return

    setMibDiagnostics(diagnostics)

    const firstMessage =
      diagnostics.parseErrors[0] ??
      diagnostics.dependencyWarnings[0] ??
      diagnostics.warnings[0] ??
      ''
    const summaryParts = [
      diagnostics.parseErrors.length > 0 ? `${diagnostics.parseErrors.length} parse error(s)` : '',
      diagnostics.dependencyWarnings.length > 0 ? `${diagnostics.dependencyWarnings.length} dependency warning(s)` : '',
      diagnostics.warnings.length > 0 ? `${diagnostics.warnings.length} warning(s)` : ''
    ].filter(Boolean)

    notification.warning({
      message: 'MIB diagnostics',
      description: (
        <div className="mib-diagnostics-notice">
          <div>{summaryParts.join(', ')}</div>
          {firstMessage && <div className="mib-diagnostics-preview">{truncateText(firstMessage, 160)}</div>}
        </div>
      ),
      btn: (
        <Button size="small" type="link" onClick={() => setIsDiagnosticsModalOpen(true)}>
          View details
        </Button>
      ),
      duration: 8,
      placement: 'topRight'
    })
  }, [notification])

  const syncTreeFromBackend = useCallback(async (): Promise<number> => {
    const nodes = await window.api.mib.getTree()
    const tree = buildTreeFromNodes(nodes)
    setMibTree(tree)

    const moduleNames = getUniqueModuleNames(nodes)
    setLoadedModules(moduleNames)
    if (selectedNode && !nodes.some((node) => node.id === selectedNode.id)) {
      setSelectedNode(null)
    }
    return moduleNames.length
  }, [selectedNode, setLoadedModules, setMibTree, setSelectedNode])

  const loadCacheDirectories = useCallback(async (): Promise<void> => {
    setIsCacheDirectoriesLoading(true)
    try {
      const directories = await window.api.mib.listCacheDirs()
      setCacheDirectories(directories)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      appMessage.error(`Failed to load cache directories: ${errMsg}`)
    } finally {
      setIsCacheDirectoriesLoading(false)
    }
  }, [appMessage])

  const openCacheDirectoryModal = useCallback((): void => {
    setIsCacheModalOpen(true)
    void loadCacheDirectories()
  }, [loadCacheDirectories])

  const applyCacheDirectoryResult = useCallback(async (
    result: CacheDirectoryOperationResult | null,
    successMessage: string
  ): Promise<void> => {
    if (!result) return
    setCacheDirectories(result.directories)
    if (result.error) {
      appMessage.error(result.error)
      return
    }

    const moduleCount = await syncTreeFromBackend()
    appMessage.success(successMessage)
    setStatusMessage(`Loaded ${moduleCount} cached module(s) from enabled cache directories`)
  }, [appMessage, setStatusMessage, syncTreeFromBackend])

  const handleAddCacheDir = useCallback(async (): Promise<void> => {
    setIsCacheDirectoriesLoading(true)
    try {
      const result = await window.api.mib.addCacheDir()
      await applyCacheDirectoryResult(result, 'Cache directory added and loaded')
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      appMessage.error(`Failed to add cache directory: ${errMsg}`)
    } finally {
      setIsCacheDirectoriesLoading(false)
    }
  }, [appMessage, applyCacheDirectoryResult])

  const handleCacheDirectoryEnabledChange = useCallback(async (
    source: CacheDirectorySource,
    enabled: boolean
  ): Promise<void> => {
    setCacheDirectoryBusyId(source.id)
    try {
      const result = await window.api.mib.setCacheDirEnabled(source.id, enabled)
      await applyCacheDirectoryResult(
        result,
        enabled ? 'Cache directory enabled and loaded' : 'Cache directory disabled'
      )
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      appMessage.error(`Failed to update cache directory: ${errMsg}`)
    } finally {
      setCacheDirectoryBusyId(null)
    }
  }, [appMessage, applyCacheDirectoryResult])

  const removeCacheDirectory = useCallback(async (
    source: CacheDirectorySource,
    deleteFromDisk: boolean
  ): Promise<void> => {
    setCacheDirectoryBusyId(source.id)
    try {
      const result = await window.api.mib.removeCacheDir(source.id, { deleteFromDisk })
      const messageText = deleteFromDisk
        ? `Cache directory removed; deleted ${result.deletedFileCount ?? 0} cache file(s)`
        : 'Cache directory removed from list'
      await applyCacheDirectoryResult(result, messageText)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      appMessage.error(`Failed to remove cache directory: ${errMsg}`)
    } finally {
      setCacheDirectoryBusyId(null)
    }
  }, [appMessage, applyCacheDirectoryResult])

  const confirmRemoveCacheDirectory = useCallback((source: CacheDirectorySource): void => {
    modal.confirm({
      title: 'Remove cache directory?',
      content: (
        <div className="cache-directory-confirm">
          <p>Remove this directory from the cache source list?</p>
          <code>{source.path}</code>
        </div>
      ),
      okText: 'Remove from list',
      cancelText: 'Cancel',
      onOk: () => removeCacheDirectory(source, false)
    })
  }, [modal, removeCacheDirectory])

  const confirmDeleteCacheDirectoryFromDisk = useCallback((source: CacheDirectorySource): void => {
    modal.confirm({
      title: 'Delete cache files from disk?',
      content: (
        <div className="cache-directory-confirm">
          <p>This removes the source from the list and deletes its cache files from disk.</p>
          <code>{source.path}</code>
        </div>
      ),
      okText: 'Delete from disk',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => removeCacheDirectory(source, true)
    })
  }, [modal, removeCacheDirectory])

  const handleOpenFiles = useCallback(async () => {
    setStatusMessage('Loading MIB files...')
    const result = await window.api.mib.openFiles()
    showMibParseDiagnostics(result)
    if (result.modules.length > 0) {
      const nodes = await getLoadedMibTreeNodes(result)
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
    showMibParseDiagnostics(result)
    if (result.modules.length > 0) {
      const nodes = await getLoadedMibTreeNodes(result)
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
    const node = treeIndex.nodeById.get(nodeId)
    if (node) {
      setSelectedNode(node)
      setQueryOid(node.oid)
    }
  }, [treeIndex])

  const [contextMenuNode, setContextMenuNode] = useState<MibTreeNodeData | null>(null)

  const handleRightClick = useCallback(({ node }: { node: EventDataNode<DataNode> }) => {
    const found = treeIndex.nodeById.get(node.key as string)
    if (found) {
      setContextMenuNode(found)
    }
  }, [treeIndex])

  const executeSnmpOperation = useCallback(async (
    operation: 'GETBULK' | 'WALK' | 'BULK_WALK',
    node: MibTreeNodeData
  ) => {
    const oid = node.oid
    if (!oid) {
      message.warning('No OID available for this node')
      return
    }

    // Overwrite semantics (PR2): clear any previous session and flip the
    // loading flag synchronously so the user never sees stale rows merge
    // with new rows.
    const isStreaming = operation === 'WALK' || operation === 'BULK_WALK'
    setResult(null)
    setIsQuerying(true)
    setConnectionStatus('connecting')
    setStatusMessage(`Executing ${operation} on ${oid}...`)

    let removeProgressListener: (() => void) | null = null
    let resolveCtx: ReturnType<typeof initResolveContext> | null = null
    let streamBatcher: ReturnType<typeof createStreamingResultBatcher> | null = null
    let streamedRowCount = 0

    if (isStreaming) {
      initResultSession(operation, oid)
      resolveCtx = initResolveContext(mibTree)
      streamBatcher = createStreamingResultBatcher(appendResultVarbinds)

      removeProgressListener = window.api.snmp.onWalkProgress((rawVarbinds) => {
        const ctx = resolveCtx
        if (!ctx) return
        const resolved = rawVarbinds.map((vb) => resolveVarbind(vb, ctx, 0))
        streamedRowCount += resolved.length
        streamBatcher?.push(resolved)
        setStatusMessage(`${operation}: ${streamedRowCount} result(s)...`)
      })
    }

    try {
      let result: SnmpResult

      switch (operation) {
        case 'GETBULK': {
          // Column nodes: GETBULK semantics = iterate across all instances of
          // that column (equivalent to BULK_WALK), since a single getBulk only
          // returns up to maxRepetitions consecutive rows. Reuse the existing
          // snmpBulkWalk IPC instead of introducing a new endpoint.
          if (node.kind === 'column') {
            result = await window.api.snmp.bulkWalk(snmpConfig, oid, snmpConfig.bulkMaxRepetitions)
          } else {
            // Smart multi-column GETBULK: on a table/entry node, fan out across
            // every column OID under the entry so a single getBulk returns
            // rows from all columns. Falls back to single OID for leaves.
            const oids = resolveBulkOids(node)
            result = await window.api.snmp.getBulk(
              snmpConfig,
              oids,
              snmpConfig.bulkMaxRepetitions,
              snmpConfig.bulkNonRepeaters
            )
          }
          break
        }
        case 'WALK':
          result = await window.api.snmp.walk(snmpConfig, oid, { omitFinalVarbinds: true })
          break
        case 'BULK_WALK':
          result = await window.api.snmp.bulkWalk(snmpConfig, oid, snmpConfig.bulkMaxRepetitions, {
            omitFinalVarbinds: true
          })
          break
      }

      if (result.success) {
        streamBatcher?.flush()
        if (result.aborted) {
          // User-cancelled path: keep the collected varbinds (WALK / BULK_WALK
          // partial results) and surface "aborted at N rows" on the status
          // bar. No connectionStatus mutation (D5), no message toast (D4).
          const streamedSession = isStreaming
            ? useAppStore.getState().currentResult
            : null
          const session = streamedSession ?? buildResultSession(operation, oid, result, mibTree)
          setResult(session)
          setStatusMessage(
            `${operation}: aborted at ${session.varbinds.length} row(s), ${result.responseTime}ms`
          )
        } else if (isStreaming) {
          const currentSession = useAppStore.getState().currentResult
          if (currentSession) {
            setResult({
              ...currentSession,
              responseTime: result.responseTime,
              timestamp: result.timestamp
            })
          }
          setConnectionStatus('connected')
          const finalCount = currentSession?.varbinds.length ?? 0
          const baseMsg = `${operation}: ${finalCount} result(s), ${result.responseTime}ms`
          setStatusMessage(
            finalCount === 0 ? `${baseMsg} — 本次操作结果为空` : baseMsg
          )
        } else {
          setConnectionStatus('connected')
          const session = buildResultSession(operation, oid, result, mibTree)
          setResult(session)
          // PR3 — append "本次操作结果为空" when the response carried zero rows so
          // the status bar / message line surfaces the empty case without a popup.
          const baseMsg = `${operation}: ${session.varbinds.length} result(s), ${result.responseTime}ms`
          setStatusMessage(
            session.varbinds.length === 0 ? `${baseMsg} — 本次操作结果为空` : baseMsg
          )
        }
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
      streamBatcher?.flush()
      streamBatcher?.dispose()
      setIsQuerying(false)
      if (removeProgressListener) {
        removeProgressListener()
      }
      window.api.snmp.removeWalkListeners()
    }
  }, [snmpConfig, mibTree, setResult, setConnectionStatus, setStatusMessage, setIsQuerying, initResultSession, appendResultVarbinds])

  /**
   * Open the independent GET / SET tool window seeded for SET. The tool
   * window handles adding more rows by drag-and-drop and the actual SET call.
   */
  const openSetDialog = useCallback((node: MibTreeNodeData) => {
    if (!node.oid) {
      appMessage.warning('No OID available for this node')
      return
    }
    window.api.snmpTool.open({
      kind: 'set',
      seed: { node: toSlimToolWindowMibNode(node) },
      snmpConfig
    }).catch((error) => {
      appMessage.error(`打开 SET 窗口失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }, [appMessage, snmpConfig])

  /**
   * Open the independent GET / SET tool window seeded for GET. Right-click
   * GET goes through this instead of firing directly so the user can pick an
   * instance suffix before the request is sent.
   */
  const openGetDialog = useCallback((node: MibTreeNodeData) => {
    if (!node.oid) {
      appMessage.warning('No OID available for this node')
      return
    }
    window.api.snmpTool.open({
      kind: 'get',
      seed: toSlimToolWindowMibNode(node),
      snmpConfig
    }).catch((error) => {
      appMessage.error(`打开 GET 窗口失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }, [appMessage, snmpConfig])

  const openTableViewer = useCallback((node: MibTreeNodeData) => {
    if (!node.oid) {
      appMessage.warning('No OID available for this node')
      return
    }
    if (node.kind !== 'table' && node.kind !== 'entry') {
      appMessage.warning('Only table or entry nodes can open Table Viewer')
      return
    }
    window.api.snmpTool.open({
      kind: 'table',
      seed: toToolWindowMibSubtree(node),
      snmpConfig
    }).catch((error) => {
      appMessage.error(`打开 Table Viewer 失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }, [appMessage, snmpConfig])

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
            onClick: () => openGetDialog(contextMenuNode)
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
          },
          {
            // Right-click SET opens the GET / SET tool window. Enabled when
            // the node has any OID; the device rejects illegal writes through
            // the tool window's error path.
            key: 'snmp-set',
            icon: <EditOutlined />,
            label: 'SET',
            disabled: !hasOid,
            onClick: () => openSetDialog(contextMenuNode)
          },
          {
            key: 'snmp-table-viewer',
            icon: <ProfileOutlined />,
            label: 'Table Viewer',
            disabled: !hasOid || (contextMenuNode.kind !== 'table' && contextMenuNode.kind !== 'entry'),
            onClick: () => openTableViewer(contextMenuNode)
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
          const allKeys = treeIndex.getSubtreeKeys(contextMenuNode.id)
          setExpandedKeys((prev) => [...new Set([...prev, ...allKeys])])
        }
      },
      {
        key: 'collapse-all',
        icon: <CompressOutlined />,
        label: 'Collapse All',
        onClick: () => {
          const subtreeKeys = new Set(treeIndex.getSubtreeKeys(contextMenuNode.id))
          setExpandedKeys((prev) => prev.filter((k) => !subtreeKeys.has(k)))
        }
      }
    ]
  }, [contextMenuNode, treeIndex, setQueryOid, setSelectedNode, executeSnmpOperation, openGetDialog, openSetDialog, openTableViewer])

  // Drag a tree node into a GET / SET tool window drop zone. AntD Tree's
  // wrapped drag event is not reliable enough as the sole data channel across
  // BrowserWindows, so the selected node is also published through main-process
  // IPC and consumed by the receiving tool window on drop.
  const handleTreeDragStart: NonNullable<TreeProps['onDragStart']> = useCallback((info) => {
    const node = treeIndex.nodeById.get(info.node.key as string)
    if (node) {
      dragSequence.current += 1
      info.event.dataTransfer?.setData('text/plain', node.id)
      window.api.snmpTool.setDragNode(toSlimToolWindowMibNode(node)).catch(() => {})
    }
  }, [treeIndex])

  const handleTreeDragEnd: NonNullable<TreeProps['onDragEnd']> = useCallback(() => {
    const finishedSequence = dragSequence.current
    window.setTimeout(() => {
      if (dragSequence.current === finishedSequence) {
        window.api.snmpTool.setDragNode(null).catch(() => {})
      }
    }, 500)
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

      showMibParseDiagnostics(result)
      if (result.modules.length > 0) {
        const nodes = await getLoadedMibTreeNodes(result)
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
  }, [setMibTree, addLoadedModule, setStatusMessage, showMibParseDiagnostics])

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
          <Tooltip title="Manage Cache Directories">
            <Button
              icon={<DatabaseOutlined />}
              size="small"
              onClick={openCacheDirectoryModal}
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
                draggable={{ icon: false, nodeDraggable: () => true }}
                onDragStart={handleTreeDragStart}
                onDragEnd={handleTreeDragEnd}
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

      <Modal
        title="Cache Directories"
        open={isCacheModalOpen}
        onCancel={() => setIsCacheModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsCacheModalOpen(false)}>
            Close
          </Button>
        ]}
        width={760}
      >
        <CacheDirectoriesModalContent
          directories={cacheDirectories}
          busyId={cacheDirectoryBusyId}
          loading={isCacheDirectoriesLoading}
          onAdd={handleAddCacheDir}
          onDeleteFromDisk={confirmDeleteCacheDirectoryFromDisk}
          onEnabledChange={handleCacheDirectoryEnabledChange}
          onRemove={confirmRemoveCacheDirectory}
        />
      </Modal>

      <Modal
        title="MIB diagnostics"
        open={isDiagnosticsModalOpen}
        onCancel={() => setIsDiagnosticsModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDiagnosticsModalOpen(false)}>
            Close
          </Button>
        ]}
        width={820}
      >
        {mibDiagnostics && <MibDiagnosticsDetails diagnostics={mibDiagnostics} />}
      </Modal>

    </div>
  )
}

function buildMibDiagnostics(result: MibParseResult): MibDiagnosticsState {
  return {
    parseErrors: result.errors.map((error) => error.message),
    dependencyWarnings: result.dependencyWarnings.map((warning) => warning.message),
    warnings: result.warnings
  }
}

function getLoadedMibTreeNodes(result: MibParseResult): Promise<MibNode[]> | MibNode[] {
  return result.tree ?? window.api.mib.getTree()
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function getUniqueModuleNames(nodes: MibNode[]): string[] {
  return [...new Set(nodes.map((node) => node.module).filter(Boolean))]
}

function CacheDirectoriesModalContent({
  directories,
  busyId,
  loading,
  onAdd,
  onDeleteFromDisk,
  onEnabledChange,
  onRemove
}: {
  directories: CacheDirectorySource[]
  busyId: string | null
  loading: boolean
  onAdd: () => void
  onDeleteFromDisk: (source: CacheDirectorySource) => void
  onEnabledChange: (source: CacheDirectorySource, enabled: boolean) => void
  onRemove: (source: CacheDirectorySource) => void
}): React.ReactElement {
  const enabledCount = directories.filter((source) => source.enabled).length

  return (
    <div className="cache-directories-modal">
      <div className="cache-directories-toolbar">
        <div className="cache-directories-summary">
          {enabledCount} / {directories.length} enabled
        </div>
        <Button
          icon={<PlusOutlined />}
          loading={loading}
          onClick={onAdd}
          size="small"
        >
          Add Directory
        </Button>
      </div>

      {directories.length === 0 ? (
        <Empty
          description="No cache directories configured"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button icon={<PlusOutlined />} onClick={onAdd} size="small">
            Add Directory
          </Button>
        </Empty>
      ) : (
        <div className="cache-directory-list">
          {directories.map((source) => (
            <CacheDirectoryRow
              key={source.id}
              busy={busyId === source.id}
              source={source}
              onDeleteFromDisk={onDeleteFromDisk}
              onEnabledChange={onEnabledChange}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CacheDirectoryRow({
  busy,
  source,
  onDeleteFromDisk,
  onEnabledChange,
  onRemove
}: {
  busy: boolean
  source: CacheDirectorySource
  onDeleteFromDisk: (source: CacheDirectorySource) => void
  onEnabledChange: (source: CacheDirectorySource, enabled: boolean) => void
  onRemove: (source: CacheDirectorySource) => void
}): React.ReactElement {
  return (
    <div className={`cache-directory-row ${source.enabled ? 'is-enabled' : 'is-disabled'}`}>
      <div className="cache-directory-main">
        <div className="cache-directory-path-line">
          <code className="cache-directory-path">{source.path}</code>
          <div className="cache-directory-tags">
            {source.isPrimary && <Tag color="blue">Primary</Tag>}
            {source.isDefault && <Tag>Default</Tag>}
            {!source.exists && <Tag color="red">Missing</Tag>}
          </div>
        </div>
        <div className="cache-directory-meta">
          {source.enabled ? 'Loaded on startup and cache refresh' : 'Disabled; not loaded'}
        </div>
      </div>
      <div className="cache-directory-actions">
        <Switch
          checked={source.enabled}
          disabled={busy}
          loading={busy}
          size="small"
          onChange={(enabled) => onEnabledChange(source, enabled)}
        />
        <Tooltip title="Remove from list">
          <Button
            aria-label="Remove cache directory from list"
            icon={<DeleteOutlined />}
            loading={busy}
            onClick={() => onRemove(source)}
            size="small"
          />
        </Tooltip>
        <Tooltip title="Remove and delete files from disk">
          <Button
            aria-label="Remove cache directory and delete cache files"
            danger
            icon={<DeleteOutlined />}
            loading={busy}
            onClick={() => onDeleteFromDisk(source)}
            size="small"
          />
        </Tooltip>
      </div>
    </div>
  )
}

function MibDiagnosticsDetails({ diagnostics }: { diagnostics: MibDiagnosticsState }): React.ReactElement {
  return (
    <div className="mib-diagnostics-modal-body">
      <DiagnosticSection title="Parse errors" items={diagnostics.parseErrors} tone="error" />
      <DiagnosticSection title="Dependency warnings" items={diagnostics.dependencyWarnings} tone="warning" />
      <DiagnosticSection title="Warnings" items={diagnostics.warnings} tone="warning" />
    </div>
  )
}

function DiagnosticSection({
  title,
  items,
  tone
}: {
  title: string
  items: string[]
  tone: 'error' | 'warning'
}): React.ReactElement | null {
  if (items.length === 0) return null

  return (
    <section className={`mib-diagnostics-section mib-diagnostics-section-${tone}`}>
      <h4>{title} ({items.length})</h4>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
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
 * Resolve the list of OIDs to send in a GETBULK request for the given node.
 *
 * For a table node, expand to every column OID under the (single) entry child.
 * For an entry node, return every column OID directly under it.
 * For any leaf / scalar / column / unrecognized node, fall back to the node's
 * own OID. The fallback also covers tables/entries without column children so
 * the caller always gets at least one OID to send.
 *
 * "Column child" here uses the shared `isTableColumnChild` predicate so the
 * GETBULK fan-out and the Table Viewer agree on what counts as a column —
 * both accept `kind === 'column'` (INDEX / not-accessible) and
 * `kind === 'scalar'` (read-* data columns) with a non-empty OID.
 */
export function resolveBulkOids(node: MibTreeNodeData): string[] {
  if (node.kind === 'table') {
    const entry = node.children.find((child) => child.kind === 'entry')
    if (entry) {
      const columnOids = entry.children
        .filter(isTableColumnChild)
        .map((child) => child.oid)
      if (columnOids.length > 0) return columnOids
    }
  } else if (node.kind === 'entry') {
    const columnOids = node.children
      .filter(isTableColumnChild)
      .map((child) => child.oid)
    if (columnOids.length > 0) return columnOids
  }

  return [node.oid]
}
