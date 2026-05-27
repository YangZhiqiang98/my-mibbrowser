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
import type { AuthProtocol, PrivProtocol, SnmpTransport } from '../../shared/snmpOptions'
export type { AuthProtocol, PrivProtocol, SnmpTransport }

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
  /** UDP transport/IP family used by net-snmp */
  transport: SnmpTransport
  /** Default max repetitions for GETBULK / BULK_WALK */
  bulkMaxRepetitions: number
  /** Default non-repeaters for GETBULK */
  bulkNonRepeaters: number
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
  /**
   * Whether the operation was aborted by the user via
   * `cancelCurrentSnmpOperation()`. When true, `success` is still `true` and
   * `varbinds` contains whatever rows were collected before the abort
   * (non-empty only for WALK / BULK_WALK). Left optional so callers can write
   * `if (result.aborted)` and treat `undefined` as "not aborted".
   */
  aborted?: boolean
  /**
   * True when a WALK / BULK_WALK caller opted into progress-event rendering
   * and the final IPC response intentionally omitted the full varbind payload.
   */
  streamed?: boolean
}

export interface SnmpWalkRequestOptions {
  /**
   * When true, the main process still emits progress batches but returns only
   * final metadata from the invoke response. Use only from renderers that
   * subscribed to `snmp:walk-progress` before starting the request.
   */
  omitFinalVarbinds?: boolean
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
