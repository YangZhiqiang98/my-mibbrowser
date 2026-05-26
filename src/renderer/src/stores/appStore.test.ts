import { describe, expect, it } from 'vitest'
import { DEBUG_LOG_ENTRY_LIMIT, TRAP_EVENT_LIMIT, normalizeSnmpConfig, useAppStore } from './appStore'

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

describe('trap console state', () => {
  it('keeps only the most recent trap events', () => {
    useAppStore.setState({ trapEvents: [] })

    for (let index = 1; index <= TRAP_EVENT_LIMIT + 3; index += 1) {
      useAppStore.getState().appendTrapEvent({
        id: index,
        timestamp: index,
        sourceAddress: '192.0.2.1',
        sourcePort: 162,
        version: 'v2c',
        kind: 'trap',
        pduType: 'TrapV2',
        pduTypeCode: 167,
        varbinds: []
      })
    }

    const events = useAppStore.getState().trapEvents
    expect(events).toHaveLength(TRAP_EVENT_LIMIT)
    expect(events[0].id).toBe(4)
    expect(events[events.length - 1].id).toBe(TRAP_EVENT_LIMIT + 3)
  })

  it('clears trap events', () => {
    useAppStore.setState({
      trapEvents: [{
        id: 1,
        timestamp: 1,
        sourceAddress: '192.0.2.1',
        sourcePort: 162,
        version: 'v2c',
        kind: 'trap',
        pduType: 'TrapV2',
        pduTypeCode: 167,
        varbinds: []
      }]
    })

    useAppStore.getState().clearTrapEvents()

    expect(useAppStore.getState().trapEvents).toEqual([])
  })
})
