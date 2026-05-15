import type { MibParseResult, MibNode } from '../../../main/mib/types'
import type { SnmpConfig, SnmpResult, SnmpSetValue } from '../../../main/snmp/types'

declare global {
  interface Window {
    api: {
      mib: {
        openFiles: () => Promise<MibParseResult>
        openDirectory: () => Promise<MibParseResult>
        getTree: () => Promise<MibNode[]>
        search: (query: string) => Promise<MibNode[]>
        loadContent: (contents: Array<{ name: string; content: string }>) => Promise<MibParseResult>
      }
      snmp: {
        get: (config: SnmpConfig, oids: string[]) => Promise<SnmpResult>
        getNext: (config: SnmpConfig, oids: string[]) => Promise<SnmpResult>
        getBulk: (config: SnmpConfig, oids: string[], maxReps?: number, nonRepeaters?: number) => Promise<SnmpResult>
        set: (config: SnmpConfig, values: SnmpSetValue[]) => Promise<SnmpResult>
        walk: (config: SnmpConfig, oid: string) => Promise<SnmpResult>
        bulkWalk: (config: SnmpConfig, oid: string, maxReps?: number) => Promise<SnmpResult>
      }
      profile: {
        save: (profile: { id: string; name: string; config: SnmpConfig }) => Promise<void>
        load: () => Promise<Array<{ id: string; name: string; config: SnmpConfig }>>
        delete: (profileId: string) => Promise<void>
      }
      export: {
        csv: (data: Array<Record<string, unknown>>) => Promise<boolean>
        xml: (data: Array<Record<string, unknown>>) => Promise<boolean>
      }
    }
  }
}

/**
 * SNMP result row for display in the results table
 */
export interface ResultRow {
  key: string
  oid: string
  name: string
  value: string
  type: string
  status: 'success' | 'error' | 'timeout'
  timestamp: string
  responseTime: number
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
  children: MibTreeNodeData[]
}
