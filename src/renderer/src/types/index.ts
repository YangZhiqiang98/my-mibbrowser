import type { MibParseResult, MibNode } from '../../../main/mib/types'
import type { MibNamedValue } from '../../../main/mib/types'
import type {
  SnmpConfig,
  SnmpResult,
  SnmpSetValue,
  SnmpOperation,
  SnmpVarbind,
  SnmpWalkRequestOptions
} from '../../../main/snmp/types'
import type {
  SnmpToolWindowContext,
  SnmpToolWindowOpenRequest,
  SnmpToolWindowResultUpdate,
  SnmpToolWindowStatusUpdate,
  SnmpToolWindowToast,
  ToolWindowMibNode
} from '../../../shared/toolWindowTypes'
import type { DebugLogEntry } from '../../../shared/debugLogTypes'
import type { TrapNotificationEvent, TrapReceiverConfig, TrapReceiverStatus } from '../../../shared/trapTypes'
import type {
  CacheDirectoryOperationResult,
  CacheDirectorySource,
  RemoveCacheDirectoryOptions
} from '../../../shared/cacheDirectoryTypes'

declare global {
  interface Window {
    api: {
      mib: {
        openFiles: () => Promise<MibParseResult>
        openDirectory: () => Promise<MibParseResult>
        getTree: () => Promise<MibNode[]>
        loadContent: (contents: Array<{ name: string; content: string }>) => Promise<MibParseResult>
        selectCacheDir: () => Promise<string | null>
        getCacheDir: () => Promise<string>
        listCacheDirs: () => Promise<CacheDirectorySource[]>
        addCacheDir: () => Promise<CacheDirectoryOperationResult | null>
        setCacheDirEnabled: (id: string, enabled: boolean) => Promise<CacheDirectoryOperationResult>
        removeCacheDir: (
          id: string,
          options?: RemoveCacheDirectoryOptions
        ) => Promise<CacheDirectoryOperationResult>
      }
      snmp: {
        get: (config: SnmpConfig, oids: string[]) => Promise<SnmpResult>
        getNext: (config: SnmpConfig, oids: string[]) => Promise<SnmpResult>
        getBulk: (config: SnmpConfig, oids: string[], maxReps?: number, nonRepeaters?: number) => Promise<SnmpResult>
        set: (config: SnmpConfig, values: SnmpSetValue[]) => Promise<SnmpResult>
        walk: (config: SnmpConfig, oid: string, options?: SnmpWalkRequestOptions) => Promise<SnmpResult>
        bulkWalk: (
          config: SnmpConfig,
          oid: string,
          maxReps?: number,
          options?: SnmpWalkRequestOptions
        ) => Promise<SnmpResult>
        cancel: () => Promise<boolean>
        onWalkProgress: (callback: (varbinds: SnmpVarbind[]) => void) => () => void
        removeWalkListeners: () => void
      }
      trap: {
        start: (config: TrapReceiverConfig) => Promise<TrapReceiverStatus>
        stop: () => Promise<TrapReceiverStatus>
        getStatus: () => Promise<TrapReceiverStatus>
        onEvent: (callback: (event: TrapNotificationEvent) => void) => () => void
        onStatus: (callback: (status: TrapReceiverStatus) => void) => () => void
      }
      profile: {
        save: (profile: { id: string; name: string; config: SnmpConfig }) => Promise<void>
        load: () => Promise<Array<{ id: string; name: string; config: SnmpConfig }>>
        delete: (profileId: string) => Promise<void>
      }
      settings: {
        getLastSnmpConfig: () => Promise<Partial<SnmpConfig> | null>
        setLastSnmpConfig: (config: SnmpConfig) => Promise<Partial<SnmpConfig> | null>
      }
      debug: {
        getEnabled: () => Promise<boolean>
        setEnabled: (enabled: boolean) => Promise<boolean>
        onEntry: (callback: (entry: DebugLogEntry) => void) => () => void
      }
      export: {
        csv: (data: Array<Record<string, unknown>>) => Promise<boolean>
        xml: (data: Array<Record<string, unknown>>) => Promise<boolean>
      }
      snmpTool: {
        open: (request: SnmpToolWindowOpenRequest) => Promise<void>
        getContext: () => Promise<SnmpToolWindowContext | null>
        updateMainResult: (update: SnmpToolWindowResultUpdate) => Promise<void>
        updateMainStatus: (update: SnmpToolWindowStatusUpdate) => Promise<void>
        showMainToast: (toast: SnmpToolWindowToast) => Promise<void>
        setDragNode: (node: ToolWindowMibNode | null) => Promise<void>
        consumeDragNode: () => Promise<ToolWindowMibNode | null>
        onContextUpdated: (callback: (context: SnmpToolWindowContext) => void) => () => void
        onMainResultUpdate: (callback: (update: SnmpToolWindowResultUpdate) => void) => () => void
        onMainStatusUpdate: (callback: (update: SnmpToolWindowStatusUpdate) => void) => () => void
        onMainToast: (callback: (toast: SnmpToolWindowToast) => void) => () => void
      }
    }
  }
}

/**
 * A single varbind row in the flat-list results display.
 *
 * Each row represents one variable binding from an SNMP response, displayed
 * as a flat sequential list (one row per varbind).
 */
export interface ResultVarbind {
  /** Unique key (typically the OID string) */
  key: string
  /** Sequential 1-based index */
  index: number
  /** Full OID of this varbind */
  oid: string
  /** Resolved MIB node name (e.g., 'sysDescr') */
  columnName: string
  /** Instance suffix after the MIB node OID (e.g., '0' or '1.2') */
  instance: string
  /** SNMP type display label (e.g., 'OCTET STRING', 'TimeTicks') */
  type: string
  /** Formatted display value */
  value: string
  /** Raw SNMP type tag for HEX toggle detection */
  rawType: string
  /** True for error varbinds (noSuchObject, noSuchInstance, endOfMibView) */
  isError: boolean
  /** Error name when isError is true */
  errorTag?: string
}

/**
 * A complete SNMP operation result, structured as a flat varbind list.
 *
 * Each varbind from the response becomes one row in the display, preserving
 * the original ordering from the SNMP response.
 */
export interface ResultSession {
  operation: SnmpOperation
  rootOid: string
  timestamp: number
  responseTime: number
  varbinds: ResultVarbind[]
  error?: string
}

/**
 * Connection profile for display
 */
export interface ProfileItem {
  id: string
  name: string
  config: SnmpConfig
}

/**
 * MIB tree node for display in the tree component
 */
export interface MibTreeNodeData {
  id: string
  name: string
  oid: string
  kind: string
  access: string
  syntax: string
  module: string
  description?: string
  enumValues?: MibNamedValue[]
  bits?: MibNamedValue[]
  textualConvention?: string
  displayHint?: string
  children: MibTreeNodeData[]
}
