// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error net-snmp has no bundled types
import snmp from 'net-snmp'
import { snmpWalk, snmpBulkWalk, snmpGetBulk } from './client'
import type { SnmpConfig } from './types'

// ---------------------------------------------------------------------------
// End-to-end regression: boot a REAL in-process net-snmp agent serving system
// scalars and a real table, then drive the REAL snmpWalk / snmpBulkWalk against
// it over UDP. Proves the loop guard does not regress well-behaved agents and
// exercises net-snmp's actual getNext continuation + getBulk nested-array shape.
// The non-lexicographic ("returns 1 row") device case is covered deterministically
// in client.walkguard.test.ts (a real net-snmp agent always orders rows correctly).
// ---------------------------------------------------------------------------

const PORT = 16799

let agent: { close?: () => void; getMib: () => Record<string, (...args: unknown[]) => unknown> }

const SCALARS: Array<{ name: string; oid: string; scalarType: number; value: string | number }> = [
  { name: 'sysDescr', oid: '1.3.6.1.2.1.1.1', scalarType: snmp.ObjectType.OctetString, value: 'Test Device' },
  { name: 'sysObjectID', oid: '1.3.6.1.2.1.1.2', scalarType: snmp.ObjectType.OID, value: '1.3.6.1.4.1.8072' },
  { name: 'sysUpTime', oid: '1.3.6.1.2.1.1.3', scalarType: snmp.ObjectType.TimeTicks, value: 42 },
  { name: 'sysContact', oid: '1.3.6.1.2.1.1.4', scalarType: snmp.ObjectType.OctetString, value: 'admin' },
  { name: 'sysName', oid: '1.3.6.1.2.1.1.5', scalarType: snmp.ObjectType.OctetString, value: 'device01' }
]

const config: SnmpConfig = {
  host: '127.0.0.1', port: PORT, version: 'v2c', community: 'public',
  securityLevel: 'noAuthNoPriv', username: '', authProtocol: 'md5', authPassword: '',
  privProtocol: 'des', privPassword: '', timeout: 2000, retries: 1, transport: 'udp4',
  bulkMaxRepetitions: 10, bulkNonRepeaters: 0
}

beforeAll(() => {
  agent = snmp.createAgent(
    { port: PORT, disableAuthorization: true, accessControlModelType: snmp.AccessControlModelType.None },
    () => {}
  ) as typeof agent
  const mib = agent.getMib()
  for (const s of SCALARS) {
    mib.registerProvider({
      name: s.name,
      type: snmp.MibProviderType.Scalar,
      oid: s.oid,
      scalarType: s.scalarType,
      maxAccess: snmp.MaxAccess['read-only']
    })
    mib.setScalarValue(s.name, s.value)
  }

  // A real table (ifTable-shaped): 3 rows x 3 columns = 9 varbinds under
  // the entry 1.3.6.1.2.1.2.2.1. This is the canonical "walk returns many".
  mib.registerProvider({
    name: 'ifTable',
    type: snmp.MibProviderType.Table,
    oid: '1.3.6.1.2.1.2.2',
    maxAccess: snmp.MaxAccess['read-only'],
    tableColumns: [
      { number: 1, name: 'ifIndex', type: snmp.ObjectType.Integer, maxAccess: snmp.MaxAccess['read-only'] },
      { number: 2, name: 'ifDescr', type: snmp.ObjectType.OctetString, maxAccess: snmp.MaxAccess['read-only'] },
      { number: 3, name: 'ifSpeed', type: snmp.ObjectType.Gauge, maxAccess: snmp.MaxAccess['read-only'] }
    ],
    tableIndex: [{ columnNumber: 1 }]
  })
  mib.addTableRow('ifTable', [1, 'eth0', 1000])
  mib.addTableRow('ifTable', [2, 'eth1', 2000])
  mib.addTableRow('ifTable', [3, 'lo', 10])
})

afterAll(() => {
  try { agent.close?.() } catch { /* ignore */ }
})

describe('REAL net-snmp agent — walk/bulk multi-value (no regression)', () => {
  it('WALK 1.3.6.1.2.1.1 returns all 5 system scalars', async () => {
    const result = await snmpWalk(config, '1.3.6.1.2.1.1')
    expect(result.success).toBe(true)
    expect(result.varbinds.length).toBe(5)
  })

  it('BULK_WALK 1.3.6.1.2.1.1 returns all 5 system scalars', async () => {
    const result = await snmpBulkWalk(config, '1.3.6.1.2.1.1', 10)
    expect(result.success).toBe(true)
    expect(result.varbinds.length).toBe(5)
  })

  it('GETBULK 1.3.6.1.2.1.1 returns multiple scalars in one response', async () => {
    const result = await snmpGetBulk(config, ['1.3.6.1.2.1.1'], 10, 0)
    expect(result.success).toBe(true)
    expect(result.varbinds.length).toBeGreaterThan(1)
  })

  it('BULK_WALK over a real TABLE 1.3.6.1.2.1.2.2 returns all 9 cells', async () => {
    const result = await snmpBulkWalk(config, '1.3.6.1.2.1.2.2', 10)
    expect(result.success).toBe(true)
    expect(result.varbinds.length).toBe(9)
  })

  it('WALK over a real TABLE 1.3.6.1.2.1.2.2 returns all 9 cells', async () => {
    const result = await snmpWalk(config, '1.3.6.1.2.1.2.2')
    expect(result.success).toBe(true)
    expect(result.varbinds.length).toBe(9)
  })

  it('BULK_WALK with maxRepetitions=1 (forces multi-round) still returns all 9', async () => {
    const result = await snmpBulkWalk(config, '1.3.6.1.2.1.2.2', 1)
    expect(result.success).toBe(true)
    expect(result.varbinds.length).toBe(9)
  })
})
