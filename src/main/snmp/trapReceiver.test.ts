import { describe, expect, it } from 'vitest'
import { formatTrapNotification } from './trapReceiver'

describe('trapReceiver', () => {
  it('formats TrapV2 notifications with resolved trap and varbind names', () => {
    const event = formatTrapNotification({
      pdu: {
        type: 167,
        community: 'public',
        varbinds: [
          { oid: '.1.3.6.1.2.1.1.3.0', type: 67, value: 12345 },
          { oid: '.1.3.6.1.6.3.1.1.4.1.0', type: 6, value: '1.3.6.1.6.3.1.1.5.3' },
          { oid: '.1.3.6.1.2.1.2.2.1.1.2', type: 2, value: 2 }
        ]
      },
      rinfo: { address: '192.0.2.10', port: 48123 }
    }, {
      id: 7,
      timestamp: 1000,
      resolveName: (oid) => ({
        '1.3.6.1.6.3.1.1.5.3': 'linkDown',
        '1.3.6.1.2.1.2.2.1.1.2': 'ifIndex'
      })[oid]
    })

    expect(event).toMatchObject({
      id: 7,
      timestamp: 1000,
      sourceAddress: '192.0.2.10',
      sourcePort: 48123,
      version: 'v2c',
      kind: 'trap',
      pduType: 'TrapV2',
      community: 'public',
      trapOid: '1.3.6.1.6.3.1.1.5.3',
      trapName: 'linkDown'
    })
    expect(event.varbinds[2]).toEqual({
      oid: '1.3.6.1.2.1.2.2.1.1.2',
      name: 'ifIndex',
      type: 'INTEGER',
      value: '2'
    })
  })

  it('formats InformRequest notifications as inform events', () => {
    const event = formatTrapNotification({
      pdu: {
        type: 166,
        user: 'trap-user',
        varbinds: []
      },
      rinfo: { address: '2001:db8::1', port: 162 }
    }, {
      id: 1,
      timestamp: 2,
      resolveName: () => undefined
    })

    expect(event.kind).toBe('inform')
    expect(event.version).toBe('v3')
    expect(event.user).toBe('trap-user')
  })
})
