import { describe, expect, it } from 'vitest'
import type { SnmpVarbind } from '../../../main/snmp/types'
import type { MibTreeNodeData } from '../types'
import { buildTableSession, buildTableSetValue, resolveTableTarget } from './tableSession'

const ifDescr: MibTreeNodeData = {
  id: 'IF-MIB::ifDescr',
  name: 'ifDescr',
  oid: '1.3.6.1.2.1.2.2.1.2',
  kind: 'column',
  access: 'read-only',
  syntax: 'DisplayString',
  module: 'IF-MIB',
  children: []
}

const ifAdminStatus: MibTreeNodeData = {
  id: 'IF-MIB::ifAdminStatus',
  name: 'ifAdminStatus',
  oid: '1.3.6.1.2.1.2.2.1.7',
  kind: 'column',
  access: 'read-write',
  syntax: 'INTEGER { up(1), down(2), testing(3) }',
  module: 'IF-MIB',
  children: []
}

const ifEntry: MibTreeNodeData = {
  id: 'IF-MIB::ifEntry',
  name: 'ifEntry',
  oid: '1.3.6.1.2.1.2.2.1',
  kind: 'entry',
  access: 'not-accessible',
  syntax: 'IfEntry',
  module: 'IF-MIB',
  children: [ifDescr, ifAdminStatus]
}

const ifTable: MibTreeNodeData = {
  id: 'IF-MIB::ifTable',
  name: 'ifTable',
  oid: '1.3.6.1.2.1.2.2',
  kind: 'table',
  access: 'not-accessible',
  syntax: 'SEQUENCE OF IfEntry',
  module: 'IF-MIB',
  children: [ifEntry]
}

describe('tableSession', () => {
  it('resolves table targets from table and entry nodes', () => {
    expect(resolveTableTarget(ifTable)?.columns.map((c) => c.name)).toEqual(['ifDescr', 'ifAdminStatus'])
    expect(resolveTableTarget(ifEntry)?.entryNode.name).toBe('ifEntry')
  })

  it('groups varbinds into table rows by instance suffix', () => {
    const target = resolveTableTarget(ifTable)!
    const varbinds: SnmpVarbind[] = [
      { oid: '.1.3.6.1.2.1.2.2.1.7.2', type: 'INTEGER', value: 2, isError: false },
      { oid: '.1.3.6.1.2.1.2.2.1.2.1', type: 'OCTET STRING', value: 'eth0', isError: false },
      { oid: '.1.3.6.1.2.1.2.2.1.7.1', type: 'INTEGER', value: 1, isError: false }
    ]

    const session = buildTableSession(target, varbinds)

    expect(session.columns.map((c) => c.name)).toEqual(['ifDescr', 'ifAdminStatus'])
    expect(session.rows.map((r) => r.instance)).toEqual(['1', '2'])
    expect(session.rows[0].cells['1.3.6.1.2.1.2.2.1.2'].value).toBe('eth0')
    expect(session.rows[0].cells['1.3.6.1.2.1.2.2.1.7'].value).toBe('1')
    expect(session.rows[1].cells['1.3.6.1.2.1.2.2.1.7'].value).toBe('2')
  })

  it('builds SET varbinds from column metadata and instance', () => {
    const target = resolveTableTarget(ifTable)!
    const session = buildTableSession(target, [])
    const adminStatus = session.columns.find((c) => c.name === 'ifAdminStatus')!

    expect(buildTableSetValue(adminStatus, '3', '2')).toEqual({
      oid: '1.3.6.1.2.1.2.2.1.7.3',
      type: 'INTEGER',
      value: '2'
    })
  })
})
