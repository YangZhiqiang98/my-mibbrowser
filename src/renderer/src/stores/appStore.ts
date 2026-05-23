import { create } from 'zustand'
import type { ProfileItem, MibTreeNodeData, ResultSession } from '../types'
import type { SnmpConfig, SnmpOperation } from '../../../main/snmp/types'

interface AppState {
  // MIB tree
  mibTree: MibTreeNodeData[]
  selectedMibNode: MibTreeNodeData | null
  loadedModules: string[]

  // SNMP configuration
  snmpConfig: SnmpConfig

  // Query
  queryOid: string
  queryOperation: SnmpOperation

  // Results
  /**
   * Current dynamic-column result session (PR2 — single-session overwrite
   * semantics). Cleared to null when a new operation starts.
   */
  currentResult: ResultSession | null
  isQuerying: boolean

  // Profiles
  profiles: ProfileItem[]

  // Status
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMessage: string

  // Actions
  setMibTree: (tree: MibTreeNodeData[]) => void
  setSelectedMibNode: (node: MibTreeNodeData | null) => void
  addLoadedModule: (name: string) => void

  setSnmpConfig: (config: Partial<SnmpConfig>) => void
  setQueryOid: (oid: string) => void
  setQueryOperation: (op: SnmpOperation) => void

  setResult: (session: ResultSession | null) => void
  setIsQuerying: (v: boolean) => void

  setProfiles: (profiles: ProfileItem[]) => void

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
  retries: 1,
  bulkMaxRepetitions: 10,
  bulkNonRepeaters: 0
}

export function normalizeSnmpConfig(config: Partial<SnmpConfig>): SnmpConfig {
  return {
    ...defaultConfig,
    ...config,
    host: config.host ?? defaultConfig.host,
    port: config.port ?? defaultConfig.port,
    version: config.version ?? defaultConfig.version,
    community: config.community ?? defaultConfig.community,
    securityLevel: config.securityLevel ?? defaultConfig.securityLevel,
    username: config.username ?? defaultConfig.username,
    authProtocol: config.authProtocol ?? defaultConfig.authProtocol,
    authPassword: config.authPassword ?? defaultConfig.authPassword,
    privProtocol: config.privProtocol ?? defaultConfig.privProtocol,
    privPassword: config.privPassword ?? defaultConfig.privPassword,
    timeout: config.timeout ?? defaultConfig.timeout,
    retries: config.retries ?? defaultConfig.retries,
    bulkMaxRepetitions: config.bulkMaxRepetitions ?? defaultConfig.bulkMaxRepetitions,
    bulkNonRepeaters: config.bulkNonRepeaters ?? defaultConfig.bulkNonRepeaters
  }
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  mibTree: [],
  selectedMibNode: null,
  loadedModules: [],
  snmpConfig: normalizeSnmpConfig(defaultConfig),
  queryOid: '',
  queryOperation: 'GET',
  currentResult: null,
  isQuerying: false,
  profiles: [],
  connectionStatus: 'disconnected',
  statusMessage: 'Ready',

  // MIB actions
  setMibTree: (tree) => set({ mibTree: tree }),
  setSelectedMibNode: (node) => set({ selectedMibNode: node }),
  addLoadedModule: (name) =>
    set((state) => ({
      loadedModules: state.loadedModules.includes(name)
        ? state.loadedModules
        : [...state.loadedModules, name]
    })),

  // SNMP config actions
  setSnmpConfig: (config) =>
    set((state) => ({ snmpConfig: normalizeSnmpConfig({ ...state.snmpConfig, ...config }) })),
  setQueryOid: (oid) => set({ queryOid: oid }),
  setQueryOperation: (op) => set({ queryOperation: op }),

  // Results actions — PR2 unified write path
  setResult: (session) => set({ currentResult: session }),
  setIsQuerying: (v) => set({ isQuerying: v }),

  // Profile actions
  setProfiles: (profiles) => set({ profiles }),

  // Status actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setStatusMessage: (msg) => set({ statusMessage: msg })
}))
