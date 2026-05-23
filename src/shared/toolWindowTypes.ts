import type { SnmpConfig } from '../main/snmp/types'
import type { SnmpOperation } from '../main/snmp/types'

export type SnmpToolWindowKind = 'get' | 'set'

export interface ToolWindowMibNode {
  id: string
  name: string
  oid: string
  kind: string
  access: string
  syntax: string
  module: string
  description?: string
  children: ToolWindowMibNode[]
}

export interface ToolWindowSetSeed {
  node: ToolWindowMibNode
  instance?: string
  targetValue?: string
}

export interface ToolWindowResultCell {
  value: string
  rawType: string
  isError: boolean
  errorTag?: string
}

export interface ToolWindowResultColumn {
  key: string
  name: string
  type: string
  oidPrefix: string
}

export interface ToolWindowResultRowData {
  key: string
  instance: string
  cells: Record<string, ToolWindowResultCell>
}

export interface ToolWindowResultSession {
  operation: SnmpOperation
  rootOid: string
  timestamp: number
  responseTime: number
  columns: ToolWindowResultColumn[]
  rows: ToolWindowResultRowData[]
  error?: string
}

export interface SnmpToolWindowOpenRequest {
  kind: SnmpToolWindowKind
  seed: ToolWindowMibNode | ToolWindowSetSeed
  snmpConfig: SnmpConfig
  mibTree: ToolWindowMibNode[]
}

export interface SnmpToolWindowContext {
  kind: SnmpToolWindowKind
  seed: ToolWindowMibNode | ToolWindowSetSeed
  snmpConfig: SnmpConfig
  mibTree: ToolWindowMibNode[]
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
