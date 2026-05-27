import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type {
  SnmpToolWindowContext,
  SnmpToolWindowOpenRequest,
  SnmpToolWindowResultUpdate,
  SnmpToolWindowStatusUpdate,
  SnmpToolWindowToast,
  ToolWindowMibNode
} from '../shared/toolWindowTypes'
import { debugLog } from './debugLogger'

interface ToolWindowEntry {
  window: BrowserWindow
  context: SnmpToolWindowContext
}

let toolWindowEntry: ToolWindowEntry | null = null
const toolWindowWebContentsIds = new Set<number>()
let mainWindowRef: BrowserWindow | null = null
let pendingDragNode: ToolWindowMibNode | null = null
let handlersRegistered = false

export function registerToolWindowHandlers(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow

  if (handlersRegistered) return
  handlersRegistered = true

  ipcMain.handle('snmp-tool:open', handleOpenToolWindow)
  ipcMain.handle('snmp-tool:get-context', handleGetToolWindowContext)
  ipcMain.handle('snmp-tool:update-main-result', handleUpdateMainResult)
  ipcMain.handle('snmp-tool:update-main-status', handleUpdateMainStatus)
  ipcMain.handle('snmp-tool:show-main-toast', handleShowMainToast)
  ipcMain.handle('snmp-tool:set-drag-node', (_event, node: ToolWindowMibNode | null) => {
    pendingDragNode = node
  })
  ipcMain.handle('snmp-tool:consume-drag-node', () => {
    const node = pendingDragNode
    pendingDragNode = null
    return node
  })
}

function handleOpenToolWindow(_event: IpcMainInvokeEvent, request: SnmpToolWindowOpenRequest): void {
  debugLog('tool-window', 'open request', {
    kind: request.kind,
    seed: describeToolWindowSeed(request.seed),
    snmpHost: request.snmpConfig.host,
    snmpPort: request.snmpConfig.port,
    snmpVersion: request.snmpConfig.version
  })

  const context: SnmpToolWindowContext = {
    kind: request.kind,
    seed: request.seed,
    snmpConfig: request.snmpConfig
  }

  if (toolWindowEntry && !toolWindowEntry.window.isDestroyed()) {
    debugLog('tool-window', 'reuse existing window', { kind: request.kind })
    toolWindowEntry.context = context
    safeShow(toolWindowEntry.window)
    safeFocus(toolWindowEntry.window)
    safeSend(toolWindowEntry.window, 'snmp-tool:context-updated', context)
    return
  }

  const parent = mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : undefined
  debugLog('tool-window', 'create window', { kind: request.kind, hasParent: parent !== undefined })
  const toolWindow = new BrowserWindow({
    width: request.kind === 'table' ? 1180 : 980,
    height: request.kind === 'table' ? 720 : 640,
    minWidth: 780,
    minHeight: 460,
    show: false,
    autoHideMenuBar: true,
    title: request.kind === 'table' ? 'SNMP Table Viewer' : 'GET / SET 多节点',
    parent,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  toolWindowEntry = { window: toolWindow, context }
  const toolWindowWebContentsId = toolWindow.webContents.id
  toolWindowWebContentsIds.add(toolWindowWebContentsId)

  toolWindow.on('ready-to-show', () => {
    safeShow(toolWindow)
  })

  toolWindow.on('closed', () => {
    debugLog('tool-window', 'window closed', { kind: context.kind })
    if (toolWindowEntry?.window === toolWindow) toolWindowEntry = null
    toolWindowWebContentsIds.delete(toolWindowWebContentsId)
  })

  toolWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const route = 'tool=snmp'
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    toolWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${route}`)
  } else {
    toolWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { tool: 'snmp' } })
  }
}

function describeToolWindowSeed(seed: SnmpToolWindowOpenRequest['seed']): Record<string, unknown> {
  if ('node' in seed) {
    return {
      nodeId: seed.node.id,
      nodeName: seed.node.name,
      nodeKind: seed.node.kind,
      nodeOid: seed.node.oid,
      hasInstance: seed.instance !== undefined,
      hasTargetValue: seed.targetValue !== undefined
    }
  }

  return {
    nodeId: seed.id,
    nodeName: seed.name,
    nodeKind: seed.kind,
    nodeOid: seed.oid
  }
}

function handleGetToolWindowContext(event: IpcMainInvokeEvent): SnmpToolWindowContext | null {
  debugLog('tool-window', 'get context', { senderId: event.sender.id, isToolWindow: toolWindowWebContentsIds.has(event.sender.id) })
  if (!toolWindowWebContentsIds.has(event.sender.id)) return null
  return toolWindowEntry?.context ?? null
}

function handleUpdateMainResult(_event: IpcMainInvokeEvent, update: SnmpToolWindowResultUpdate): void {
  debugLog('tool-window', 'update main result', {
    operation: update.session?.operation,
    rowCount: update.session?.varbinds.length ?? 0,
    connectionStatus: update.connectionStatus,
    statusMessage: update.statusMessage,
    isQuerying: update.isQuerying
  })
  sendToMainWindow('snmp-tool:main-result-update', update)
}

function handleUpdateMainStatus(_event: IpcMainInvokeEvent, update: SnmpToolWindowStatusUpdate): void {
  debugLog('tool-window', 'update main status', update)
  sendToMainWindow('snmp-tool:main-status-update', update)
}

function handleShowMainToast(_event: IpcMainInvokeEvent, toast: SnmpToolWindowToast): void {
  debugLog('tool-window', 'show main toast', toast)
  sendToMainWindow('snmp-tool:main-toast', toast)
}

function sendToMainWindow(channel: string, payload: unknown): void {
  if (!mainWindowRef) return
  safeSend(mainWindowRef, channel, payload)
}

function safeShow(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  try {
    if (!window.isVisible()) window.show()
  } catch {
    // Window may be destroyed between the guard and Electron's native call.
  }
}

function safeFocus(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  try {
    window.focus()
  } catch {
    // Window may be destroyed between the guard and Electron's native call.
  }
}

function safeSend(window: BrowserWindow, channel: string, payload: unknown): void {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return
  try {
    window.webContents.send(channel, payload)
  } catch {
    // Closing a tool window can race with async IPC replies.
  }
}
