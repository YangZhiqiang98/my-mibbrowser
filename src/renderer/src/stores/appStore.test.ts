import { describe, expect, it } from 'vitest'
import { normalizeSnmpConfig } from './appStore'

describe('normalizeSnmpConfig', () => {
  it('keeps old profiles compatible by defaulting transport', () => {
    const config = normalizeSnmpConfig({
      host: '192.0.2.10',
      version: 'v3',
      securityLevel: 'authPriv',
      username: 'operator',
      authProtocol: 'sha',
      privProtocol: 'aes'
    })

    expect(config.transport).toBe('udp4')
    expect(config.host).toBe('192.0.2.10')
    expect(config.authProtocol).toBe('sha')
    expect(config.privProtocol).toBe('aes')
  })

  it('preserves new SNMPv3 security and IPv6 transport settings', () => {
    const config = normalizeSnmpConfig({
      version: 'v3',
      authProtocol: 'sha512',
      privProtocol: 'aes256r',
      transport: 'udp6'
    })

    expect(config.authProtocol).toBe('sha512')
    expect(config.privProtocol).toBe('aes256r')
    expect(config.transport).toBe('udp6')
  })
})
