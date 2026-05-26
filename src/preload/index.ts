import { contextBridge, ipcRenderer } from 'electron'
import type { MibParseResult, MibNode } from '../main/mib/types'
import type { SnmpConfig, SnmpResult, SnmpSetValue } from '../main/snmp/types'
import type {
  SnmpToolWindowContext,
  SnmpToolWindowOpenRequest,
  SnmpToolWindowResultUpdate,
  SnmpToolWindowStatusUpdate,
  SnmpToolWindowToast,
  ToolWindowMibNode
} from '../shared/toolWindowTypes'
import type { DebugLogEntry } from '../shared/debugLogTypes'

/**
 * API exposed to the renderer process via contextBridge
 */
const api = {
  // MIB operations
  mib: {
    openFiles: (): Promise<MibParseResult> => ipcRenderer.invoke('mib:open-files'),
    openDirectory: (): Promise<MibParseResult> => ipcRenderer.invoke('mib:open-directory'),
    getTree: (): Promise<MibNode[]> => ipcRenderer.invoke('mib:get-tree'),
    search: (query: string): Promise<MibNode[]> => ipcRenderer.invoke('mib:search', query),
    loadContent: (contents: Array<{ name: string; content: string }>): Promise<MibParseResult> =>
      ipcRenderer.invoke('mib:load-content', contents),
    selectCacheDir: (): Promise<string | null> => ipcRenderer.invoke('mib:select-cache-dir'),
    getCacheDir: (): Promise<string> => ipcRenderer.invoke('mib:get-cache-dir')
  },

  // SNMP operations
  snmp: {
    get: (config: SnmpConfig, oids: string[]): Promise<SnmpResult> =>
      ipcRenderer.invoke('snmp:get', config, oids),
    getNext: (config: SnmpConfig, oids: string[]): Promise<SnmpResult> =>
      ipcRenderer.invoke('snmp:get-next', config, oids),
    getBulk: (config: SnmpConfig, oids: string[], maxReps?: number, nonRepeaters?: number): Promise<SnmpResult> =>
      ipcRenderer.invoke('snmp:get-bulk', config, oids, maxReps, nonRepeaters),
    set: (config: SnmpConfig, values: SnmpSetValue[]): Promise<SnmpResult> =>
      ipcRenderer.invoke('snmp:set', config, values),
    walk: (config: SnmpConfig, oid: string): Promise<SnmpResult> =>
      ipcRenderer.invoke('snmp:walk', config, oid),
    bulkWalk: (config: SnmpConfig, oid: string, maxReps?: number): Promise<SnmpResult> =>
      ipcRenderer.invoke('snmp:bulk-walk', config, oid, maxReps),
    cancel: (): Promise<boolean> => ipcRenderer.invoke('snmp:cancel'),
    onWalkProgress: (callback: (varbinds: SnmpResult['varbinds']) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, varbinds: SnmpResult['varbinds']) => callback(varbinds)
      ipcRenderer.on('snmp:walk-progress', listener)
      return () => ipcRenderer.removeListener('snmp:walk-progress', listener)
    },
    removeWalkListeners: (): void => {
      ipcRenderer.removeAllListeners('snmp:walk-progress')
    }
  },

  // Connection profiles
  profile: {
    save: (profile: { id: string; name: string; config: SnmpConfig }): Promise<void> =>
      ipcRenderer.invoke('profile:save', profile),
    load: (): Promise<Array<{ id: string; name: string; config: SnmpConfig }>> =>
      ipcRenderer.invoke('profile:load'),
    delete: (profileId: string): Promise<void> =>
      ipcRenderer.invoke('profile:delete', profileId)
  },

  // Debug mode
  debug: {
    getEnabled: (): Promise<boolean> => ipcRenderer.invoke('debug:get-enabled'),
    setEnabled: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('debug:set-enabled', enabled),
    onEntry: (callback: (entry: DebugLogEntry) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, entry: DebugLogEntry) => callback(entry)
      ipcRenderer.on('debug:entry', listener)
      return () => ipcRenderer.removeListener('debug:entry', listener)
    }
  },

  // Export
  export: {
    csv: (data: Array<Record<string, unknown>>): Promise<boolean> =>
      ipcRenderer.invoke('export:csv', data),
    xml: (data: Array<Record<string, unknown>>): Promise<boolean> =>
      ipcRenderer.invoke('export:xml', data)
  },

  // GET / SET tool windows
  snmpTool: {
    open: (request: SnmpToolWindowOpenRequest): Promise<void> =>
      ipcRenderer.invoke('snmp-tool:open', request),
    getContext: (): Promise<SnmpToolWindowContext | null> =>
      ipcRenderer.invoke('snmp-tool:get-context'),
    updateMainResult: (update: SnmpToolWindowResultUpdate): Promise<void> =>
      ipcRenderer.invoke('snmp-tool:update-main-result', update),
    updateMainStatus: (update: SnmpToolWindowStatusUpdate): Promise<void> =>
      ipcRenderer.invoke('snmp-tool:update-main-status', update),
    showMainToast: (toast: SnmpToolWindowToast): Promise<void> =>
      ipcRenderer.invoke('snmp-tool:show-main-toast', toast),
    setDragNode: (node: ToolWindowMibNode | null): Promise<void> =>
      ipcRenderer.invoke('snmp-tool:set-drag-node', node),
    consumeDragNode: (): Promise<ToolWindowMibNode | null> =>
      ipcRenderer.invoke('snmp-tool:consume-drag-node'),
    onContextUpdated: (callback: (context: SnmpToolWindowContext) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, context: SnmpToolWindowContext) => callback(context)
      ipcRenderer.on('snmp-tool:context-updated', listener)
      return () => ipcRenderer.removeListener('snmp-tool:context-updated', listener)
    },
    onMainResultUpdate: (callback: (update: SnmpToolWindowResultUpdate) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: SnmpToolWindowResultUpdate) => callback(update)
      ipcRenderer.on('snmp-tool:main-result-update', listener)
      return () => ipcRenderer.removeListener('snmp-tool:main-result-update', listener)
    },
    onMainStatusUpdate: (callback: (update: SnmpToolWindowStatusUpdate) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: SnmpToolWindowStatusUpdate) => callback(update)
      ipcRenderer.on('snmp-tool:main-status-update', listener)
      return () => ipcRenderer.removeListener('snmp-tool:main-status-update', listener)
    },
    onMainToast: (callback: (toast: SnmpToolWindowToast) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, toast: SnmpToolWindowToast) => callback(toast)
      ipcRenderer.on('snmp-tool:main-toast', listener)
      return () => ipcRenderer.removeListener('snmp-tool:main-toast', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
