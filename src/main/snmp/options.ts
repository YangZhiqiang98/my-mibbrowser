// @ts-expect-error net-snmp has no TS types bundled
import snmp from 'net-snmp'
import type { AuthProtocol, PrivProtocol, SnmpTransport } from './types'

const AUTH_PROTOCOL_MAP: Record<AuthProtocol, number> = {
  md5: snmp.AuthProtocols.md5,
  sha: snmp.AuthProtocols.sha,
  sha224: snmp.AuthProtocols.sha224,
  sha256: snmp.AuthProtocols.sha256,
  sha384: snmp.AuthProtocols.sha384,
  sha512: snmp.AuthProtocols.sha512
}

const PRIV_PROTOCOL_MAP: Record<PrivProtocol, number> = {
  des: snmp.PrivProtocols.des,
  aes: snmp.PrivProtocols.aes,
  aes256b: snmp.PrivProtocols.aes256b,
  aes256r: snmp.PrivProtocols.aes256r
}

const SUPPORTED_TRANSPORTS = new Set<SnmpTransport>(['udp4', 'udp6'])

function hasMappedValue<T extends string>(map: Record<T, number>, value: string): value is T {
  return Object.prototype.hasOwnProperty.call(map, value) && map[value as T] !== undefined
}

export function resolveAuthProtocol(protocol: string): number {
  if (!hasMappedValue(AUTH_PROTOCOL_MAP, protocol)) {
    throw new Error(`Unsupported SNMPv3 auth protocol: ${protocol}`)
  }
  return AUTH_PROTOCOL_MAP[protocol]
}

export function resolvePrivProtocol(protocol: string): number {
  if (!hasMappedValue(PRIV_PROTOCOL_MAP, protocol)) {
    throw new Error(`Unsupported SNMPv3 privacy protocol: ${protocol}`)
  }
  return PRIV_PROTOCOL_MAP[protocol]
}

export function resolveSnmpTransport(transport: string): SnmpTransport {
  if (!SUPPORTED_TRANSPORTS.has(transport as SnmpTransport)) {
    throw new Error(`Unsupported SNMP transport or IP family: ${transport}`)
  }
  return transport as SnmpTransport
}
