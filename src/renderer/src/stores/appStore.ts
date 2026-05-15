import { create } from 'zustand'
import type { ResultRow, ProfileItem, MibTreeNodeData } from '../types'
import type { SnmpConfig, SnmpOperation, SecurityLevel, AuthProtocol, PrivProtocol } from '../../../main/snmp/types'

interface AppState {
  // MIB tree
  mibTree: MibTreeNodeData[]
  selectedMibNode: MibTreeNodeData | null
  mibSearchResults: MibTreeNodeData[]
  loadedModules: string[]

  // SNMP configuration
  snmpConfig: SnmpConfig

  // Query
  queryOid: string
  queryOperation: SnmpOperation

  // Results
  results: ResultRow[]
  isQuerying: boolean

  // Profiles
  profiles: ProfileItem[]

  // Status
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMessage: string

  // Actions
  setMibTree: (tree: MibTreeNodeData[]) => void
  setSelectedMibNode: (node: MibTreeNodeData | null) => void
  setMibSearchResults: (results: MibTreeNodeData[]) => void
  addLoadedModule: (name: string) => void

  setSnmpConfig: (config: Partial<SnmpConfig>) => void
  setQueryOid: (oid: string) => void
  setQueryOperation: (op: SnmpOperation) => void

  addResult: (row: ResultRow) => void
  addResults: (rows: ResultRow[]) => void
  clearResults: () => void
  setIsQuerying: (v: boolean) => void

  setProfiles: (profiles: ProfileItem[]) => void
  addProfile: (profile: ProfileItem) => void

  setConnectionStatus: (status: AppState['connectionStatus']) => void
  setStatusMessage: (msg: string) => void
}

const defaultConfig: SnmpConfig = {
  host: '127.0.0.1',
  port: 161,
  version: 'v2c',
  community: 'public',
  securityLevel: 'noAuthNoPriv',
  username: '',
  authProtocol: 'md5',
  authPassword: '',
  privProtocol: 'des',
  privPassword: '',
  timeout: 5000,
  retries: 1
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  mibTree: [],
  selectedMibNode: null,
  mibSearchResults: [],
  loadedModules: [],
  snmpConfig: { ...defaultConfig },
  queryOid: '',
  queryOperation: 'GET',
  results: [],
  isQuerying: false,
  profiles: [],
  connectionStatus: 'disconnected',
  statusMessage: 'Ready',

  // MIB actions
  setMibTree: (tree) => set({ mibTree: tree }),
  setSelectedMibNode: (node) => set({ selectedMibNode: node }),
  setMibSearchResults: (results) => set({ mibSearchResults: results }),
  addLoadedModule: (name) =>
    set((state) => ({
      loadedModules: state.loadedModules.includes(name)
        ? state.loadedModules
        : [...state.loadedModules, name]
    })),

  // SNMP config actions
  setSnmpConfig: (config) =>
    set((state) => ({ snmpConfig: { ...state.snmpConfig, ...config } })),
  setQueryOid: (oid) => set({ queryOid: oid }),
  setQueryOperation: (op) => set({ queryOperation: op }),

  // Results actions
  addResult: (row) =>
    set((state) => ({ results: [...state.results, row] })),
  addResults: (rows) =>
    set((state) => ({ results: [...state.results, ...rows] })),
  clearResults: () => set({ results: [] }),
  setIsQuerying: (v) => set({ isQuerying: v }),

  // Profile actions
  setProfiles: (profiles) => set({ profiles }),
  addProfile: (profile) =>
    set((state) => ({ profiles: [...state.profiles, profile] })),

  // Status actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setStatusMessage: (msg) => set({ statusMessage: msg })
}))
