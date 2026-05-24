import type { MibParseResult, MibNode } from '../../../main/mib/types'
import type { MibNamedValue } from '../../../main/mib/types'
import type { SnmpConfig, SnmpResult, SnmpSetValue, SnmpOperation } from '../../../main/snmp/types'
import type {
  SnmpToolWindowContext,
  SnmpToolWindowOpenRequest,
  SnmpToolWindowResultUpdate,
  SnmpToolWindowStatusUpdate,
  SnmpToolWindowToast,
  ToolWindowMibNode
} from '../../../shared/toolWindowTypes'

declare global {
  interface Window {
    api: {
      mib: {
        openFiles: () => Promise<MibParseResult>
        openDirectory: () => Promise<MibParseResult>
        getTree: () => Promise<MibNode[]>
        search: (query: string) => Promise<MibNode[]>
        loadContent: (contents: Array<{ name: string; content: string }>) => Promise<MibParseResult>
        selectCacheDir: () => Promise<string | null>
        getCacheDir: () => Promise<string>
      }
      snmp: {
        get: (config: SnmpConfig, oids: string[]) => Promise<SnmpResult>
        getNext: (config: SnmpConfig, oids: string[]) => Promise<SnmpResult>
        getBulk: (config: SnmpConfig, oids: string[], maxReps?: number, nonRepeaters?: number) => Promise<SnmpResult>
        set: (config: SnmpConfig, values: SnmpSetValue[]) => Promise<SnmpResult>
        walk: (config: SnmpConfig, oid: string) => Promise<SnmpResult>
        bulkWalk: (config: SnmpConfig, oid: string, maxReps?: number) => Promise<SnmpResult>
        cancel: () => Promise<boolean>
      }
      profile: {
        save: (profile: { id: string; name: string; config: SnmpConfig }) => Promise<void>
        load: () => Promise<Array<{ id: string; name: string; config: SnmpConfig }>>
        delete: (profileId: string) => Promise<void>
      }
      debug: {
        getEnabled: () => Promise<boolean>
        setEnabled: (enabled: boolean) => Promise<boolean>
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
 * A single cell in the dynamic-column results table.
 *
 * `value` is the already-formatted display text (Buffer decoding / TimeTicks
 * pretty-printing has already been applied). `rawType` is the SNMP type tag
 * from the varbind (Counter32, OCTET STRING, ...). When the varbind is an
 * SNMP-level error (noSuchObject / noSuchInstance / endOfMibView), `isError`
 * is true and `errorTag` carries the error name.
 */
export interface ResultCell {
  value: string
  rawType: string
  isError: boolean
  errorTag?: string
}

/**
 * Column metadata in a dynamic-column result session.
 *
 * `key` uniquely identifies the column (typically the MIB node OID matched
 * by longest-prefix, or an OID prefix derived from the varbind when no MIB
 * match is found). `type` is the SNMP type tag used for the header label.
 * When multiple varbinds in the same column carry different types, the first
 * one observed wins.
 */
export interface ResultColumn {
  key: string
  name: string
  type: string
  oidPrefix: string
}

/**
 * A single row in a dynamic-column result session, keyed by instance suffix
 * (the OID segments left over after stripping the column prefix).
 */
export interface ResultRowData {
  key: string
  instance: string
  cells: Record<string, ResultCell>
}

/**
 * A complete SNMP operation result, structured as a dynamic table.
 *
 * Columns are listed in first-observed order. Rows are listed in instance
 * order (compound keys compared as strings). Both are derived from the
 * varbinds returned by a single SNMP operation.
 */
export interface ResultSession {
  operation: SnmpOperation
  rootOid: string
  timestamp: number
  responseTime: number
  columns: ResultColumn[]
  rows: ResultRowData[]
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
