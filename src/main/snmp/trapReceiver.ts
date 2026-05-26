// @ts-expect-error net-snmp has no TS types bundled
import snmp from 'net-snmp'
import type {
  TrapNotificationEvent,
  TrapNotificationKind,
  TrapNotificationVarbind,
  TrapNotificationVersion,
  TrapReceiverConfig,
  TrapReceiverStatus,
  TrapSecurityLevel
} from '../../shared/trapTypes'
import { resolveAuthProtocol, resolvePrivProtocol, resolveSnmpTransport } from './options'
import { debugError, debugLog } from '../debugLogger'

type RawReceiver = {
  close: (callback?: () => void) => void
  getAuthorizer: () => {
    addCommunity: (community: string) => void
    addUser: (user: Record<string, unknown>) => void
  }
}

type RawTrap = {
  pdu?: {
    type?: number
    varbinds?: RawTrapVarbind[]
    enterprise?: string
    generic?: number
    specific?: number
    upTime?: number
    community?: string
    user?: string
    contextName?: string
  }
  rinfo?: {
    address?: string
    port?: number
  }
}

type RawTrapVarbind = {
  oid?: string
  type?: number
  value?: unknown
}

interface TrapReceiverHandlers {
  onEvent: (event: TrapNotificationEvent) => void
  onStatus: (status: TrapReceiverStatus) => void
  resolveName: (oid: string) => string | undefined
}

let receiver: RawReceiver | null = null
let currentStatus: TrapReceiverStatus = {
  listening: false,
  port: 9162,
  transport: 'udp4',
  message: 'Trap receiver stopped'
}
let nextTrapEventId = 0

const SNMP_TRAP_OID = '1.3.6.1.6.3.1.1.4.1.0'
const SYS_UPTIME_OID = '1.3.6.1.2.1.1.3.0'

const TYPE_NAMES: Record<number, string> = {
  1: 'BOOLEAN',
  2: 'INTEGER',
  3: 'BIT STRING',
  4: 'OCTET STRING',
  5: 'NULL',
  6: 'OBJECT IDENTIFIER',
  64: 'IpAddress',
  65: 'Counter32',
  66: 'Gauge32',
  67: 'TimeTicks',
  68: 'Opaque',
  70: 'Counter64',
  128: 'noSuchObject',
  129: 'noSuchInstance',
  130: 'endOfMibView'
}

const SECURITY_LEVEL_MAP: Record<TrapSecurityLevel, number> = {
  noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv,
  authNoPriv: snmp.SecurityLevel.authNoPriv,
  authPriv: snmp.SecurityLevel.authPriv
}

export function getTrapReceiverStatus(): TrapReceiverStatus {
  return currentStatus
}

export function startTrapReceiver(config: TrapReceiverConfig, handlers: TrapReceiverHandlers): TrapReceiverStatus {
  stopTrapReceiver()

  try {
    const port = normalizePort(config.port)
    const transport = resolveSnmpTransport(config.transport)
    const options = {
      port,
      transport,
      includeAuthentication: config.includeAuthentication,
      disableAuthorization: config.disableAuthorization
    }

    const nextReceiver: RawReceiver = snmp.createReceiver(options, (error: unknown, trap: RawTrap | undefined) => {
      if (error) {
        const message = error instanceof Error ? error.message : String(error)
        const fatal = isFatalReceiverError(error)
        currentStatus = {
          listening: !fatal && currentStatus.listening,
          port,
          transport,
          startedAt: !fatal ? currentStatus.startedAt : undefined,
          message: fatal ? `Trap receiver error: ${message}` : `Trap receiver warning: ${message}`,
          error: message
        }
        debugError('snmp', 'trap receiver error', message)
        handlers.onStatus(currentStatus)
        if (fatal) safeCloseReceiver()
        return
      }

      if (!trap) return
      const event = formatTrapNotification(trap, {
        id: nextTrapEventId += 1,
        timestamp: Date.now(),
        resolveName: handlers.resolveName
      })
      debugLog('snmp', `${event.pduType} received`, {
        sourceAddress: event.sourceAddress,
        sourcePort: event.sourcePort,
        varbindCount: event.varbinds.length,
        trapOid: event.trapOid,
        trapName: event.trapName
      })
      handlers.onEvent(event)
    })

    receiver = nextReceiver

    const authorizer = nextReceiver.getAuthorizer()
    if (config.community.trim()) {
      authorizer.addCommunity(config.community.trim())
    }
    if (config.v3.enabled && config.v3.username.trim()) {
      authorizer.addUser(buildReceiverV3User(config))
    }

    currentStatus = {
      listening: true,
      port,
      transport,
      startedAt: Date.now(),
      message: `Listening for Trap / Inform on ${transport}:${port}`
    }
    debugLog('snmp', 'trap receiver started', {
      port,
      transport,
      communityConfigured: !!config.community.trim(),
      v3UserConfigured: config.v3.enabled && !!config.v3.username.trim()
    })
    handlers.onStatus(currentStatus)
    return currentStatus
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    currentStatus = {
      listening: false,
      port: Number.isInteger(config.port) ? config.port : 9162,
      transport: config.transport,
      message: `Trap receiver failed to start: ${message}`,
      error: message
    }
    debugError('snmp', 'trap receiver start failed', message)
    safeCloseReceiver()
    handlers.onStatus(currentStatus)
    return currentStatus
  }
}

export function stopTrapReceiver(): TrapReceiverStatus {
  const previous = currentStatus
  safeCloseReceiver()
  currentStatus = {
    listening: false,
    port: previous.port,
    transport: previous.transport,
    message: 'Trap receiver stopped'
  }
  if (previous.listening) {
    debugLog('snmp', 'trap receiver stopped', {
      port: previous.port,
      transport: previous.transport
    })
  }
  return currentStatus
}

export function formatTrapNotification(
  trap: RawTrap,
  options: { id: number; timestamp: number; resolveName: (oid: string) => string | undefined }
): TrapNotificationEvent {
  const pdu = trap.pdu ?? {}
  const pduTypeCode = typeof pdu.type === 'number' ? pdu.type : -1
  const pduType = snmp.PduType[pduTypeCode] ?? 'Unknown'
  const varbinds = (pdu.varbinds ?? []).map((varbind) => formatTrapVarbind(varbind, options.resolveName))
  const trapOid = normalizeOid(findVarbindValue(varbinds, SNMP_TRAP_OID) || pdu.enterprise || '')
  const uptime = findVarbindValue(varbinds, SYS_UPTIME_OID) || formatTicks(pdu.upTime)

  return {
    id: options.id,
    timestamp: options.timestamp,
    sourceAddress: trap.rinfo?.address ?? '',
    sourcePort: trap.rinfo?.port ?? 0,
    version: inferVersion(pduTypeCode, pdu),
    kind: inferKind(pduTypeCode),
    pduType,
    pduTypeCode,
    community: typeof pdu.community === 'string' ? pdu.community : undefined,
    user: typeof pdu.user === 'string' ? pdu.user : undefined,
    enterprise: pdu.enterprise,
    trapOid: trapOid || undefined,
    trapName: trapOid ? options.resolveName(trapOid) : undefined,
    genericTrap: pdu.generic,
    specificTrap: pdu.specific,
    uptime,
    varbinds
  }
}

function buildReceiverV3User(config: TrapReceiverConfig): Record<string, unknown> {
  const user: Record<string, unknown> = {
    name: config.v3.username.trim(),
    level: SECURITY_LEVEL_MAP[config.v3.securityLevel]
  }

  if (config.v3.securityLevel !== 'noAuthNoPriv') {
    user.authProtocol = resolveAuthProtocol(config.v3.authProtocol)
    user.authKey = config.v3.authPassword
  }

  if (config.v3.securityLevel === 'authPriv') {
    user.privProtocol = resolvePrivProtocol(config.v3.privProtocol)
    user.privKey = config.v3.privPassword
  }

  return user
}

function formatTrapVarbind(
  varbind: RawTrapVarbind,
  resolveName: (oid: string) => string | undefined
): TrapNotificationVarbind {
  const oid = normalizeOid(varbind.oid ?? '')
  const type = typeof varbind.type === 'number' ? TYPE_NAMES[varbind.type] || `Unknown(${varbind.type})` : 'Unknown'
  return {
    oid,
    name: oid ? resolveName(oid) : undefined,
    type,
    value: formatValue(varbind.value, type)
  }
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return ''

  if (Buffer.isBuffer(value)) {
    if (type === 'IpAddress' && value.length === 4) {
      return Array.from(value).join('.')
    }
    if (type === 'TimeTicks' && value.length >= 4) {
      return formatTicks(value.readUInt32BE(0)) ?? ''
    }
    const text = value.toString('utf-8')
    const printable = text.replace(/[\x00-\x08\x0e-\x1f]/g, '')
    if (printable.length >= text.length * 0.8 && text.length > 0) return text
    return Array.from(value).map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
  }

  if (type === 'TimeTicks') return formatTicks(Number(value)) ?? ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function inferKind(pduTypeCode: number): TrapNotificationKind {
  if (pduTypeCode === snmp.PduType.InformRequest) return 'inform'
  if (pduTypeCode === snmp.PduType.Trap || pduTypeCode === snmp.PduType.TrapV2) return 'trap'
  return 'unknown'
}

function inferVersion(pduTypeCode: number, pdu: NonNullable<RawTrap['pdu']>): TrapNotificationVersion {
  if (typeof pdu.user === 'string') return 'v3'
  if (pduTypeCode === snmp.PduType.Trap) return 'v1'
  if (pduTypeCode === snmp.PduType.TrapV2 || pduTypeCode === snmp.PduType.InformRequest) return 'v2c'
  return 'unknown'
}

function findVarbindValue(varbinds: TrapNotificationVarbind[], oid: string): string | undefined {
  return varbinds.find((varbind) => varbind.oid === oid)?.value
}

function formatTicks(value: unknown): string | undefined {
  const ticks = Number(value)
  if (!Number.isFinite(ticks)) return undefined
  const days = Math.floor(ticks / 8640000)
  const hours = Math.floor((ticks % 8640000) / 360000)
  const minutes = Math.floor((ticks % 360000) / 6000)
  const seconds = Math.floor((ticks % 6000) / 100)
  const hundredths = ticks % 100
  return `${days}d ${hours}h ${minutes}m ${seconds}.${hundredths}s`
}

function normalizeOid(oid: string): string {
  return oid.replace(/^\.+/, '').replace(/\.+$/, '')
}

function normalizePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid trap receiver port: ${port}`)
  }
  return port
}

function isFatalReceiverError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  return ['EADDRINUSE', 'EADDRNOTAVAIL', 'EACCES', 'EPERM', 'EINVAL'].includes(code)
}

function safeCloseReceiver(): void {
  if (!receiver) return
  const closing = receiver
  receiver = null
  try {
    closing.close()
  } catch {
    // Socket may already be closed after a bind/listen error.
  }
}
