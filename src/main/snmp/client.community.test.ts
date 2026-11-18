// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SnmpConfig, SnmpSetValue } from './types'

// ---------------------------------------------------------------------------
// Read/write community selection. A mocked net-snmp captures the community
// argument of every createSession call so we can prove:
//   - read operations authenticate with `config.community`
//   - SET authenticates with `config.writeCommunity`
//   - a blank write community falls back to the read community
//   - SNMPv3 never routes through the community-based session at all
// ---------------------------------------------------------------------------

type SessionCall = { host: string; community: string; options: Record<string, unknown> }
const createSessionCalls: SessionCall[] = []

function makeSession() {
  return {
    get(oids: string[], cb: (e: unknown, v: unknown[]) => void): void {
      queueMicrotask(() => cb(null, oids.map((oid) => ({ oid, type: 4, value: 'x' }))))
    },
    set(varbinds: Array<{ oid: string }>, cb: (e: unknown, v: unknown[]) => void): void {
      queueMicrotask(() => cb(null, varbinds))
    },
    close: vi.fn()
  }
}

const mockSnmp = {
  AuthProtocols: { md5: 1, sha: 2, sha224: 3, sha256: 4, sha384: 5, sha512: 6 },
  PrivProtocols: { des: 1, aes: 2, aes256b: 3, aes256r: 4 },
  SecurityLevel: { noAuthNoPriv: 1, authNoPriv: 2, authPriv: 3 },
  ObjectType: { Integer: 2, OctetString: 4, OID: 6, Null: 5, IpAddress: 64, Counter: 65, Gauge: 66, TimeTicks: 67, Opaque: 68, Counter64: 70 },
  Version1: 0,
  Version2c: 1,
  isVarbindError: (v: { type: number }) => v.type >= 128,
  createSession: (host: string, community: string, options: Record<string, unknown>) => {
    createSessionCalls.push({ host, community, options })
    return makeSession()
  },
  createV3Session: vi.fn(() => makeSession())
}

vi.mock('net-snmp', () => ({ default: mockSnmp }))

const { snmpGet, snmpSet } = await import('./client')

const config: SnmpConfig = {
  host: '127.0.0.1', port: 161, version: 'v2c', community: 'public', writeCommunity: 'private',
  securityLevel: 'noAuthNoPriv', username: '', authProtocol: 'md5', authPassword: '',
  privProtocol: 'des', privPassword: '', timeout: 1000, retries: 0, transport: 'udp4',
  bulkMaxRepetitions: 10, bulkNonRepeaters: 0
}

const setValue: SnmpSetValue = { oid: '1.3.6.1.2.1.1.4.0', value: 'admin@example.com', type: 'OCTET STRING' }

beforeEach(() => {
  createSessionCalls.length = 0
  mockSnmp.createV3Session.mockClear()
})

describe('read/write community selection', () => {
  it('GET authenticates with the read community', async () => {
    const result = await snmpGet(config, ['1.3.6.1.2.1.1.1.0'])
    expect(result.success).toBe(true)
    expect(createSessionCalls).toHaveLength(1)
    expect(createSessionCalls[0].community).toBe('public')
  })

  it('SET authenticates with the write community', async () => {
    const result = await snmpSet(config, [setValue])
    expect(result.success).toBe(true)
    expect(createSessionCalls).toHaveLength(1)
    expect(createSessionCalls[0].community).toBe('private')
  })

  it('SET falls back to the read community when the write community is blank', async () => {
    const result = await snmpSet({ ...config, writeCommunity: '   ' }, [setValue])
    expect(result.success).toBe(true)
    expect(createSessionCalls).toHaveLength(1)
    expect(createSessionCalls[0].community).toBe('public')
  })

  it('SNMPv3 SET bypasses the community-based session entirely', async () => {
    const v3Config: SnmpConfig = { ...config, version: 'v3' }
    const result = await snmpSet(v3Config, [setValue])
    expect(result.success).toBe(true)
    expect(createSessionCalls).toHaveLength(0)
    expect(mockSnmp.createV3Session).toHaveBeenCalledTimes(1)
  })
})
