import type { SnmpConfig } from '../main/snmp/types'
import type { SnmpOperation } from '../main/snmp/types'
import type { MibNamedValue } from '../main/mib/types'

export type SnmpToolWindowKind = 'get' | 'set' | 'table'

export interface ToolWindowMibNode {
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
  children: ToolWindowMibNode[]
}

export interface ToolWindowSetSeed {
  node: ToolWindowMibNode
  instance?: string
  targetValue?: string
}

/**
 * A single varbind row in the flat-list results display, used for IPC between
 * the tool window and the main window.
 */
export interface ToolWindowResultVarbind {
  key: string
  index: number
  oid: string
  columnName: string
  instance: string
  type: string
  value: string
  rawType: string
  isError: boolean
  errorTag?: string
}

/**
 * A complete SNMP operation result for IPC, structured as a flat varbind list.
 */
export interface ToolWindowResultSession {
  operation: SnmpOperation
  rootOid: string
  timestamp: number
  responseTime: number
  varbinds: ToolWindowResultVarbind[]
  error?: string
}

export interface SnmpToolWindowOpenRequest {
  kind: SnmpToolWindowKind
  seed: ToolWindowMibNode | ToolWindowSetSeed
  snmpConfig: SnmpConfig
}

export interface SnmpToolWindowContext {
  kind: SnmpToolWindowKind
  seed: ToolWindowMibNode | ToolWindowSetSeed
  snmpConfig: SnmpConfig
}

export interface SnmpToolWindowResultUpdate {
  session: ToolWindowResultSession | null
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMessage?: string
  isQuerying?: boolean
}

export interface SnmpToolWindowStatusUpdate {
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMessage?: string
  isQuerying?: boolean
}

export type SnmpToolWindowToastKind = 'success' | 'error' | 'warning' | 'info'

export interface SnmpToolWindowToast {
  kind: SnmpToolWindowToastKind
  message: string
}
