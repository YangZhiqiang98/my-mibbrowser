import { create } from 'zustand'
import type { ProfileItem, MibTreeNodeData, ResultSession, ResultVarbind } from '../types'
import type { SnmpConfig, SnmpOperation } from '../../../main/snmp/types'
import type { DebugLogEntry } from '../../../shared/debugLogTypes'
import type { TrapNotificationEvent, TrapReceiverStatus } from '../../../shared/trapTypes'

export const DEBUG_LOG_ENTRY_LIMIT = 500
export const TRAP_EVENT_LIMIT = 1000

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
  debugMode: boolean
  debugLogs: DebugLogEntry[]
  debugLogPanelOpen: boolean
  debugLogAutoScroll: boolean
  trapEvents: TrapNotificationEvent[]
  trapReceiverStatus: TrapReceiverStatus
  trapConsoleOpen: boolean
  trapConsoleAutoScroll: boolean

  // Actions
  setMibTree: (tree: MibTreeNodeData[]) => void
  setSelectedMibNode: (node: MibTreeNodeData | null) => void
  addLoadedModule: (name: string) => void

  setSnmpConfig: (config: Partial<SnmpConfig>) => void
  setQueryOid: (oid: string) => void
  setQueryOperation: (op: SnmpOperation) => void

  setResult: (session: ResultSession | null) => void
  setIsQuerying: (v: boolean) => void
  initResultSession: (operation: SnmpOperation, rootOid: string) => void
  appendResultVarbinds: (varbinds: ResultVarbind[]) => void

  setProfiles: (profiles: ProfileItem[]) => void

  setConnectionStatus: (status: AppState['connectionStatus']) => void
  setStatusMessage: (msg: string) => void
  setDebugMode: (enabled: boolean) => void
  appendDebugLog: (entry: DebugLogEntry) => void
  clearDebugLogs: () => void
  setDebugLogPanelOpen: (open: boolean) => void
  setDebugLogAutoScroll: (enabled: boolean) => void
  appendTrapEvent: (event: TrapNotificationEvent) => void
  clearTrapEvents: () => void
  setTrapReceiverStatus: (status: TrapReceiverStatus) => void
  setTrapConsoleOpen: (open: boolean) => void
  setTrapConsoleAutoScroll: (enabled: boolean) => void
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
  transport: 'udp4',
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
    transport: config.transport ?? defaultConfig.transport,
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
  debugMode: false,
  debugLogs: [],
  debugLogPanelOpen: false,
  debugLogAutoScroll: true,
  trapEvents: [],
  trapReceiverStatus: {
    listening: false,
    port: 9162,
    transport: 'udp4',
    message: 'Trap receiver stopped'
  },
  trapConsoleOpen: false,
  trapConsoleAutoScroll: true,

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

  // Streaming actions for incremental WALK/BULK_WALK results
  initResultSession: (operation, rootOid) =>
    set({
      currentResult: {
        operation,
        rootOid,
        timestamp: Date.now(),
        responseTime: 0,
        varbinds: []
      }
    }),
  appendResultVarbinds: (newVarbinds) =>
    set((state) => {
      const session = state.currentResult
      if (!session) return state
      const existingCount = session.varbinds.length
      const varbinds = [
        ...session.varbinds,
        ...newVarbinds.map((vb, i) => ({
          ...vb,
          index: existingCount + i + 1
        }))
      ]
      return { currentResult: { ...session, varbinds } }
    }),

  // Profile actions
  setProfiles: (profiles) => set({ profiles }),

  // Status actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setDebugMode: (enabled) => set({ debugMode: enabled }),
  appendDebugLog: (entry) =>
    set((state) => {
      const debugLogs = [...state.debugLogs, entry]
      if (debugLogs.length <= DEBUG_LOG_ENTRY_LIMIT) return { debugLogs }
      return { debugLogs: debugLogs.slice(debugLogs.length - DEBUG_LOG_ENTRY_LIMIT) }
    }),
  clearDebugLogs: () => set({ debugLogs: [] }),
  setDebugLogPanelOpen: (open) => set({ debugLogPanelOpen: open }),
  setDebugLogAutoScroll: (enabled) => set({ debugLogAutoScroll: enabled }),
  appendTrapEvent: (event) =>
    set((state) => {
      const trapEvents = [...state.trapEvents, event]
      if (trapEvents.length <= TRAP_EVENT_LIMIT) return { trapEvents }
      return { trapEvents: trapEvents.slice(trapEvents.length - TRAP_EVENT_LIMIT) }
    }),
  clearTrapEvents: () => set({ trapEvents: [] }),
  setTrapReceiverStatus: (status) => set({ trapReceiverStatus: status }),
  setTrapConsoleOpen: (open) => set({ trapConsoleOpen: open }),
  setTrapConsoleAutoScroll: (enabled) => set({ trapConsoleAutoScroll: enabled })
}))
