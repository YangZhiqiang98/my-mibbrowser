import { describe, expect, it } from 'vitest'
import { DEBUG_LOG_ENTRY_LIMIT, normalizeSnmpConfig, useAppStore } from './appStore'

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

describe('debug log state', () => {
  it('keeps only the most recent debug log entries', () => {
    useAppStore.setState({ debugLogs: [] })

    for (let index = 1; index <= DEBUG_LOG_ENTRY_LIMIT + 5; index += 1) {
      useAppStore.getState().appendDebugLog({
        id: index,
        timestamp: index,
        level: 'debug',
        scope: 'test',
        message: `entry ${index}`
      })
    }

    const logs = useAppStore.getState().debugLogs
    expect(logs).toHaveLength(DEBUG_LOG_ENTRY_LIMIT)
    expect(logs[0].id).toBe(6)
    expect(logs[logs.length - 1].id).toBe(DEBUG_LOG_ENTRY_LIMIT + 5)
  })

  it('clears debug log entries', () => {
    useAppStore.setState({
      debugLogs: [{
        id: 1,
        timestamp: 1,
        level: 'debug',
        scope: 'test',
        message: 'entry'
      }]
    })

    useAppStore.getState().clearDebugLogs()

    expect(useAppStore.getState().debugLogs).toEqual([])
  })
})
