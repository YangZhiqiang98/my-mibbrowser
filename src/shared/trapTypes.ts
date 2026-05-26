import type { AuthProtocol, PrivProtocol, SnmpTransport } from './snmpOptions'

export type TrapSecurityLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'

export interface TrapReceiverV3Config {
  enabled: boolean
  username: string
  securityLevel: TrapSecurityLevel
  authProtocol: AuthProtocol
  authPassword: string
  privProtocol: PrivProtocol
  privPassword: string
}

export interface TrapReceiverConfig {
  port: number
  transport: SnmpTransport
  community: string
  disableAuthorization: boolean
  includeAuthentication: boolean
  v3: TrapReceiverV3Config
}

export interface TrapReceiverStatus {
  listening: boolean
  port: number
  transport: SnmpTransport
  startedAt?: number
  message: string
  error?: string
}

export type TrapNotificationKind = 'trap' | 'inform' | 'unknown'
export type TrapNotificationVersion = 'v1' | 'v2c' | 'v3' | 'unknown'

export interface TrapNotificationVarbind {
  oid: string
  name?: string
  type: string
  value: string
}

export interface TrapNotificationEvent {
  id: number
  timestamp: number
  sourceAddress: string
  sourcePort: number
  version: TrapNotificationVersion
  kind: TrapNotificationKind
  pduType: string
  pduTypeCode: number
  community?: string
  user?: string
  enterprise?: string
  trapOid?: string
  trapName?: string
  genericTrap?: number
  specificTrap?: number
  uptime?: string
  varbinds: TrapNotificationVarbind[]
}
