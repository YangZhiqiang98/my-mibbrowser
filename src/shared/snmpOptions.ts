export const SNMP_AUTH_PROTOCOL_OPTIONS = [
  { label: 'MD5', value: 'md5' },
  { label: 'SHA-1', value: 'sha' },
  { label: 'SHA-224', value: 'sha224' },
  { label: 'SHA-256', value: 'sha256' },
  { label: 'SHA-384', value: 'sha384' },
  { label: 'SHA-512', value: 'sha512' }
] as const

export const SNMP_PRIV_PROTOCOL_OPTIONS = [
  { label: 'DES', value: 'des' },
  { label: 'AES-128', value: 'aes' },
  { label: 'AES-256 (Blumenthal)', value: 'aes256b' },
  { label: 'AES-256 (Reeder)', value: 'aes256r' }
] as const

export const SNMP_TRANSPORT_OPTIONS = [
  { label: 'UDP / IPv4', value: 'udp4' },
  { label: 'UDP / IPv6', value: 'udp6' }
] as const

export type AuthProtocol = (typeof SNMP_AUTH_PROTOCOL_OPTIONS)[number]['value']
export type PrivProtocol = (typeof SNMP_PRIV_PROTOCOL_OPTIONS)[number]['value']
export type SnmpTransport = (typeof SNMP_TRANSPORT_OPTIONS)[number]['value']
