import { contextBridge, ipcRenderer } from 'electron'
import type { MibParseResult, MibNode } from '../main/mib/types'
import type { SnmpConfig, SnmpResult, SnmpSetValue } from '../main/snmp/types'

/**
 * API exposed to the renderer process via contextBridge
 */
const api = {
  // MIB operations
  mib: {
    openFiles: (): Promise<MibParseResult> => ipcRenderer.invoke('mib:open-files'),
    openDirectory: (): Promise<MibParseResult> => ipcRenderer.invoke('mib:open-directory'),
    getTree: (): Promise<MibNode[]> => ipcRenderer.invoke('mib:get-tree'),
    search: (query: string): Promise<MibNode[]> => ipcRenderer.invoke('mib:search', query)
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
      ipcRenderer.invoke('snmp:bulk-walk', config, oid, maxReps)
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

  // Export
  export: {
    csv: (data: Array<Record<string, unknown>>): Promise<boolean> =>
      ipcRenderer.invoke('export:csv', data),
    xml: (data: Array<Record<string, unknown>>): Promise<boolean> =>
      ipcRenderer.invoke('export:xml', data)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
