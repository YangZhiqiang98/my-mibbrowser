import { describe, expect, it, vi } from 'vitest'
import type { SnmpConfig } from './types'

// ---------------------------------------------------------------------------
// Guard behavior tests for snmpWalk / snmpBulkWalk. A mocked net-snmp session
// replays a scripted "device" so we can prove:
//   - a non-lexicographic (name-ordered) table walks FULLY (regression for the
//     172.16.67.180 string-index bug where the old monotonic guard stopped at 1)
//   - a genuine cycle (an OID returned twice) still terminates with a warning
// ---------------------------------------------------------------------------

const ROOT = '1.3.6.1.4.1.8886.1.82.1.1.1.3'
// Instance suffixes encode an OCTET STRING index as <len>.<ascii bytes...>. The
// device returns "loopback1" (len 9) BEFORE "client1"/"client2" (len 7): the
// first sub-identifier goes 9 -> 7, i.e. numerically DECREASING but distinct.
const OID_LOOPBACK1 = `.${ROOT}.9.108.111.111.112.98.97.99.107.49`
const OID_CLIENT1 = `.${ROOT}.7.99.108.105.101.110.116.49`
const OID_CLIENT2 = `.${ROOT}.7.99.108.105.101.110.116.50`
// First OID of the NEXT column — outside the ROOT subtree: the natural walk end.
const OID_OUTSIDE = '.1.3.6.1.4.1.8886.1.82.1.1.1.4.7.99.108.105.101.110.116.49'

type Vb = { oid: string; type: number; value: unknown }
const vb = (oid: string, value: unknown = 1): Vb => ({ oid, type: 2, value })

function strip(o: string): string {
  return o.startsWith('.') ? o.slice(1) : o
}

/**
 * Build a fake net-snmp session from a getNext transition map keyed by the
 * (dot-stripped) requested OID. getBulk chains the same map up to maxRepetitions.
 */
function makeSession(nextOf: (reqOid: string) => Vb) {
  return {
    getNext(oids: string[], cb: (e: unknown, v: unknown[]) => void): void {
      const out = nextOf(strip(oids[0]))
      queueMicrotask(() => cb(null, [out]))
    },
    getBulk(oids: string[], _nr: number, maxRep: number, cb: (e: unknown, v: unknown[]) => void): void {
      const batch: Vb[] = []
      let cursor = strip(oids[0])
      for (let i = 0; i < maxRep; i++) {
        const next = nextOf(cursor)
        batch.push(next)
        cursor = strip(next.oid)
      }
      // net-snmp nests repeater results: [[vb1, vb2, ...]]
      queueMicrotask(() => cb(null, [batch]))
    },
    close: vi.fn()
  }
}

let currentNextOf: (reqOid: string) => Vb = () => vb(OID_OUTSIDE)

const mockSnmp = {
  AuthProtocols: { md5: 1, sha: 2, sha224: 3, sha256: 4, sha384: 5, sha512: 6 },
  PrivProtocols: { des: 1, aes: 2, aes256b: 3, aes256r: 4 },
  SecurityLevel: { noAuthNoPriv: 1, authNoPriv: 2, authPriv: 3 },
  ObjectType: { Integer: 2, OctetString: 4, OID: 6, Null: 5, IpAddress: 64, Counter: 65, Gauge: 66, TimeTicks: 67, Opaque: 68, Counter64: 70 },
  Version1: 0,
  Version2c: 1,
  isVarbindError: (v: { type: number }) => v.type >= 128,
  createSession: () => makeSession((req) => currentNextOf(req)),
  createV3Session: () => makeSession((req) => currentNextOf(req))
}

vi.mock('net-snmp', () => ({ default: mockSnmp }))

const { snmpWalk, snmpBulkWalk } = await import('./client')

const config: SnmpConfig = {
  host: '127.0.0.1', port: 161, version: 'v2c', community: 'public',
  securityLevel: 'noAuthNoPriv', username: '', authProtocol: 'md5', authPassword: '',
  privProtocol: 'des', privPassword: '', timeout: 1000, retries: 0, transport: 'udp4',
  bulkMaxRepetitions: 10, bulkNonRepeaters: 0
}

// Non-lexicographic, terminating device: 3 rows then out-of-subtree.
function nonLexDevice(reqOid: string): Vb {
  const map: Record<string, Vb> = {
    [ROOT]: vb(OID_LOOPBACK1, 0),
    [strip(OID_LOOPBACK1)]: vb(OID_CLIENT1, 2),
    [strip(OID_CLIENT1)]: vb(OID_CLIENT2, 2),
    [strip(OID_CLIENT2)]: vb(OID_OUTSIDE, 9)
  }
  return map[reqOid] ?? vb(OID_OUTSIDE, 9)
}

// Cyclic device: root -> A -> B -> A (A returned a second time = real loop).
function loopDevice(reqOid: string): Vb {
  const A = OID_CLIENT1
  const B = OID_CLIENT2
  const map: Record<string, Vb> = {
    [ROOT]: vb(A, 1),
    [strip(A)]: vb(B, 2),
    [strip(B)]: vb(A, 1) // loops back to A
  }
  return map[reqOid] ?? vb(OID_OUTSIDE, 9)
}

describe('walk termination guard — non-lexicographic tables walk fully', () => {
  it('WALK collects every distinct row despite a decreasing index prefix (AC1)', async () => {
    currentNextOf = nonLexDevice
    const result = await snmpWalk(config, ROOT)
    expect(result.success).toBe(true)
    expect(result.warning).toBeUndefined()
    expect(result.varbinds.map((v) => v.oid)).toEqual([
      strip(OID_LOOPBACK1), strip(OID_CLIENT1), strip(OID_CLIENT2)
    ])
  })

  it('BULK_WALK collects every distinct row too (AC2)', async () => {
    currentNextOf = nonLexDevice
    const result = await snmpBulkWalk(config, ROOT, 10)
    expect(result.success).toBe(true)
    expect(result.warning).toBeUndefined()
    expect(result.varbinds.map((v) => v.oid)).toEqual([
      strip(OID_LOOPBACK1), strip(OID_CLIENT1), strip(OID_CLIENT2)
    ])
  })
})

describe('walk termination guard — genuine loops still terminate (AC3)', () => {
  it('WALK stops with a loop warning when an OID repeats', async () => {
    currentNextOf = loopDevice
    const result = await snmpWalk(config, ROOT)
    expect(result.success).toBe(true)
    expect(result.warning).toMatch(/looped/i)
    // Collected A and B before A repeated.
    expect(result.varbinds.length).toBe(2)
  })

  it('BULK_WALK stops with a loop warning when an OID repeats', async () => {
    currentNextOf = loopDevice
    const result = await snmpBulkWalk(config, ROOT, 2)
    expect(result.success).toBe(true)
    expect(result.warning).toMatch(/looped/i)
    expect(result.varbinds.length).toBe(2)
  })
})
