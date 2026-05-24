import { describe, expect, it } from 'vitest'
import { resolveAuthProtocol, resolvePrivProtocol, resolveSnmpTransport } from './options'

describe('SNMP option mapping', () => {
  it('maps supported SHA-2 authentication protocols', () => {
    expect(resolveAuthProtocol('sha224')).toBeTypeOf('number')
    expect(resolveAuthProtocol('sha256')).toBeTypeOf('number')
    expect(resolveAuthProtocol('sha384')).toBeTypeOf('number')
    expect(resolveAuthProtocol('sha512')).toBeTypeOf('number')
  })

  it('maps supported AES-256 privacy protocol variants', () => {
    expect(resolvePrivProtocol('aes256b')).toBeTypeOf('number')
    expect(resolvePrivProtocol('aes256r')).toBeTypeOf('number')
  })

  it('rejects unsupported auth and privacy protocols without fallback', () => {
    expect(() => resolveAuthProtocol('sha1024')).toThrow('Unsupported SNMPv3 auth protocol')
    expect(() => resolvePrivProtocol('3des')).toThrow('Unsupported SNMPv3 privacy protocol')
  })

  it('allows only UDP transports exposed by net-snmp', () => {
    expect(resolveSnmpTransport('udp4')).toBe('udp4')
    expect(resolveSnmpTransport('udp6')).toBe('udp6')
    expect(() => resolveSnmpTransport('tcp')).toThrow('Unsupported SNMP transport or IP family')
  })
})
