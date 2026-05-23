import { create } from 'zustand'
import type { ResultRow, ProfileItem, MibTreeNodeData, ResultSession } from '../types'
import type { SnmpConfig, SnmpOperation } from '../../../main/snmp/types'

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
  /**
   * Current dynamic-column result session (PR2 — single-session overwrite
   * semantics). Cleared to null when a new operation starts.
   */
  currentResult: ResultSession | null
  /**
   * Legacy result rows. Kept as an empty stub so any downstream consumers
   * that still read this field don't crash. PR2 stops writing to it; full
   * removal is deferred to a later cleanup PR.
   */
  results: ResultRow[]
  isQuerying: boolean

  // Profiles
  profiles: ProfileItem[]

  // Status
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMessage: string

  /**
   * Transient: the MibTreeNodeData picked up by an in-flight drag from the
   * MIB tree. Set on Tree onDragStart, cleared on drop / dragend.
   * SetMultiNodeDialog and GetMultiNodeDialog drop zones both read this
   * because antd Tree's `draggable` callback does not expose the native
   * DataTransfer payload.
   */
  pendingDragNode: MibTreeNodeData | null

  // Actions
  setMibTree: (tree: MibTreeNodeData[]) => void
  setSelectedMibNode: (node: MibTreeNodeData | null) => void
  setMibSearchResults: (results: MibTreeNodeData[]) => void
  addLoadedModule: (name: string) => void

  setSnmpConfig: (config: Partial<SnmpConfig>) => void
  setQueryOid: (oid: string) => void
  setQueryOperation: (op: SnmpOperation) => void

  setResult: (session: ResultSession | null) => void
  // Legacy result actions — retained as no-op-friendly stubs so callers
  // outside the PR2 scope continue to type-check. The new write path is
  // setResult only.
  addResult: (row: ResultRow) => void
  addResults: (rows: ResultRow[]) => void
  clearResults: () => void
  setIsQuerying: (v: boolean) => void

  setProfiles: (profiles: ProfileItem[]) => void
  addProfile: (profile: ProfileItem) => void

  setConnectionStatus: (status: AppState['connectionStatus']) => void
  setStatusMessage: (msg: string) => void
  setPendingDragNode: (node: MibTreeNodeData | null) => void
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
  mibSearchResults: [],
  loadedModules: [],
  snmpConfig: normalizeSnmpConfig(defaultConfig),
  queryOid: '',
  queryOperation: 'GET',
  currentResult: null,
  results: [],
  isQuerying: false,
  profiles: [],
  connectionStatus: 'disconnected',
  statusMessage: 'Ready',
  pendingDragNode: null,

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
    set((state) => ({ snmpConfig: normalizeSnmpConfig({ ...state.snmpConfig, ...config }) })),
  setQueryOid: (oid) => set({ queryOid: oid }),
  setQueryOperation: (op) => set({ queryOperation: op }),

  // Results actions — PR2 unified write path
  setResult: (session) => set({ currentResult: session }),
  // Legacy result actions — preserved as no-op shims so any out-of-scope
  // callers continue to compile. New code must use setResult instead.
  addResult: (row) =>
    set((state) => ({ results: [...state.results, row] })),
  addResults: (rows) =>
    set((state) => ({ results: [...state.results, ...rows] })),
  clearResults: () => set({ results: [], currentResult: null }),
  setIsQuerying: (v) => set({ isQuerying: v }),

  // Profile actions
  setProfiles: (profiles) => set({ profiles }),
  addProfile: (profile) =>
    set((state) => ({ profiles: [...state.profiles, profile] })),

  // Status actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setPendingDragNode: (node) => set({ pendingDragNode: node })
}))
