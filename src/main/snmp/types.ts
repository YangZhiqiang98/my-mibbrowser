/**
 * SNMP protocol version
 */
export type SnmpVersion = 'v1' | 'v2c' | 'v3'

/**
 * SNMPv3 security level
 */
export type SecurityLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'

/**
 * SNMPv3 authentication protocol
 */
export type AuthProtocol = 'md5' | 'sha'

/**
 * SNMPv3 privacy/encryption protocol
 */
export type PrivProtocol = 'des' | 'aes'

/**
 * SNMP operation type
 */
export type SnmpOperation = 'GET' | 'GETNEXT' | 'GETBULK' | 'SET' | 'WALK' | 'BULK_WALK'

/**
 * SNMP connection configuration
 */
export interface SnmpConfig {
  /** Target host IP or hostname */
  host: string
  /** Target port (default 161) */
  port: number
  /** SNMP version */
  version: SnmpVersion
  /** Community string for v1/v2c */
  community: string
  /** SNMPv3 security level */
  securityLevel: SecurityLevel
  /** SNMPv3 username */
  username: string
  /** SNMPv3 authentication protocol */
  authProtocol: AuthProtocol
  /** SNMPv3 authentication password */
  authPassword: string
  /** SNMPv3 privacy protocol */
  privProtocol: PrivProtocol
  /** SNMPv3 privacy password */
  privPassword: string
  /** Request timeout in milliseconds */
  timeout: number
  /** Number of retries */
  retries: number
}

/**
 * A single SNMP variable binding (varbind)
 */
export interface SnmpVarbind {
  /** OID string */
  oid: string
  /** Symbolic name (if resolved) */
  name?: string
  /** Value */
  value: string | number | Buffer | null
  /** ASN.1 type */
  type: string
  /** Whether this varbind is an error */
  isError: boolean
  /** Error message if isError */
  error?: string
}

/**
 * Result of an SNMP operation
 */
export interface SnmpResult {
  /** Whether the operation was successful */
  success: boolean
  /** Variable bindings */
  varbinds: SnmpVarbind[]
  /** Error message if failed */
  error?: string
  /** Response time in milliseconds */
  responseTime: number
  /** Timestamp */
  timestamp: number
}

/**
 * SET value type for SNMP SET operations
 */
export interface SnmpSetValue {
  /** OID to set */
  oid: string
  /** Value to set */
  value: string | number
  /** ASN.1 type */
  type: string
}

/**
 * Saved connection profile
 */
export interface ConnectionProfile {
  /** Profile ID */
  id: string
  /** Profile name */
  name: string
  /** SNMP configuration */
  config: SnmpConfig
  /** Created timestamp */
  createdAt: number
  /** Last used timestamp */
  lastUsedAt: number
}
