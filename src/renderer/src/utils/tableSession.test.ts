import { describe, expect, it } from 'vitest'
import type { SnmpVarbind } from '../../../main/snmp/types'
import type { MibTreeNodeData } from '../types'
import {
  buildAddRowSetValues,
  buildDeleteRowSetValue,
  buildTableSession,
  buildTableSetValue,
  getTableRowLifecycle,
  isRowStatusColumn,
  isTableColumnChild,
  resolveTableTarget,
  validateTableInstanceSuffix
} from './tableSession'

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

/**
 * Realistic entry where the MIB parser marks readable data columns as
 * `'scalar'` (because they aren't `not-accessible`) and only the INDEX
 * column stays as `'column'`. This is what `determineKind` produces in
 * practice — see `src/main/mib/parser.ts:556`.
 */
const baseIndex: MibTreeNodeData = {
  id: 'BASE-MIB::baseIndex',
  name: 'baseIndex',
  oid: '1.3.6.1.4.1.99999.1.1.1.1',
  kind: 'column',
  access: 'not-accessible',
  syntax: 'INTEGER',
  module: 'BASE-MIB',
  children: []
}

const baseStatus: MibTreeNodeData = {
  id: 'BASE-MIB::baseStatus',
  name: 'baseStatus',
  oid: '1.3.6.1.4.1.99999.1.1.1.2',
  kind: 'scalar',
  access: 'read-write',
  syntax: 'INTEGER { up(1), down(2) }',
  module: 'BASE-MIB',
  children: []
}

const baseFlags: MibTreeNodeData = {
  id: 'BASE-MIB::baseFlags',
  name: 'baseFlags',
  oid: '1.3.6.1.4.1.99999.1.1.1.3',
  kind: 'scalar',
  access: 'read-only',
  syntax: 'BITS { enabled(0), alarmed(1) }',
  module: 'BASE-MIB',
  children: []
}

const baseEntry: MibTreeNodeData = {
  id: 'BASE-MIB::baseEntry',
  name: 'baseEntry',
  oid: '1.3.6.1.4.1.99999.1.1.1',
  kind: 'entry',
  access: 'not-accessible',
  syntax: 'BaseEntry',
  module: 'BASE-MIB',
  children: [baseIndex, baseStatus, baseFlags]
}

const baseTable: MibTreeNodeData = {
  id: 'BASE-MIB::baseTable',
  name: 'baseTable',
  oid: '1.3.6.1.4.1.99999.1.1',
  kind: 'table',
  access: 'not-accessible',
  syntax: 'SEQUENCE OF BaseEntry',
  module: 'BASE-MIB',
  children: [baseEntry]
}

const targetAddress: MibTreeNodeData = {
  id: 'SNMP-TARGET-MIB::snmpTargetAddrTAddress',
  name: 'snmpTargetAddrTAddress',
  oid: '1.3.6.1.6.3.12.1.2.1.4',
  kind: 'scalar',
  access: 'read-create',
  syntax: 'OCTET STRING',
  module: 'SNMP-TARGET-MIB',
  children: []
}

const targetTimeout: MibTreeNodeData = {
  id: 'SNMP-TARGET-MIB::snmpTargetAddrTimeout',
  name: 'snmpTargetAddrTimeout',
  oid: '1.3.6.1.6.3.12.1.2.1.5',
  kind: 'scalar',
  access: 'read-create',
  syntax: 'INTEGER',
  module: 'SNMP-TARGET-MIB',
  children: []
}

const targetRowStatus: MibTreeNodeData = {
  id: 'SNMP-TARGET-MIB::snmpTargetAddrRowStatus',
  name: 'snmpTargetAddrRowStatus',
  oid: '1.3.6.1.6.3.12.1.2.1.9',
  kind: 'scalar',
  access: 'read-create',
  syntax: 'RowStatus',
  textualConvention: 'RowStatus',
  enumValues: [
    { name: 'active', value: 1 },
    { name: 'notInService', value: 2 },
    { name: 'notReady', value: 3 },
    { name: 'createAndGo', value: 4 },
    { name: 'createAndWait', value: 5 },
    { name: 'destroy', value: 6 }
  ],
  module: 'SNMP-TARGET-MIB',
  children: []
}

const targetEntry: MibTreeNodeData = {
  id: 'SNMP-TARGET-MIB::snmpTargetAddrEntry',
  name: 'snmpTargetAddrEntry',
  oid: '1.3.6.1.6.3.12.1.2.1',
  kind: 'entry',
  access: 'not-accessible',
  syntax: 'SnmpTargetAddrEntry',
  module: 'SNMP-TARGET-MIB',
  children: [targetAddress, targetTimeout, targetRowStatus]
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

  describe('resolveTableTarget — scalar/column mixed children', () => {
    it('collects scalar children as table columns for an entry node', () => {
      const target = resolveTableTarget(baseEntry)
      expect(target).not.toBeNull()
      expect(target!.entryNode.name).toBe('baseEntry')
      // baseIndex (column) + baseStatus + baseFlags (scalars) — all three are columns
      expect(target!.columns.map((c) => c.name)).toEqual(['baseIndex', 'baseStatus', 'baseFlags'])
    })

    it('collects scalar children as table columns for a table node via its entry', () => {
      const target = resolveTableTarget(baseTable)
      expect(target).not.toBeNull()
      expect(target!.tableNode.name).toBe('baseTable')
      expect(target!.entryNode.name).toBe('baseEntry')
      expect(target!.columns.map((c) => c.name)).toEqual(['baseIndex', 'baseStatus', 'baseFlags'])
    })

    it('collects scalar-only children as table columns (entry with no INDEX column)', () => {
      const scalarOnlyEntry: MibTreeNodeData = {
        ...baseEntry,
        children: [baseStatus, baseFlags]
      }
      const target = resolveTableTarget(scalarOnlyEntry)
      expect(target).not.toBeNull()
      expect(target!.columns.map((c) => c.name)).toEqual(['baseStatus', 'baseFlags'])
    })

    it('ignores children without an OID', () => {
      const orphan: MibTreeNodeData = { ...baseStatus, id: 'orphan', name: 'orphan', oid: '' }
      const entryWithOrphan: MibTreeNodeData = {
        ...baseEntry,
        children: [baseIndex, orphan, baseFlags]
      }
      const target = resolveTableTarget(entryWithOrphan)
      expect(target!.columns.map((c) => c.name)).toEqual(['baseIndex', 'baseFlags'])
    })

    it('returns null for non-table / non-entry nodes', () => {
      const group: MibTreeNodeData = {
        ...baseEntry,
        id: 'group',
        name: 'group',
        kind: 'group',
        children: []
      }
      expect(resolveTableTarget(group)).toBeNull()
      expect(resolveTableTarget(baseStatus)).toBeNull()
    })

    it('returns null for a table node with no entry child', () => {
      const tableWithoutEntry: MibTreeNodeData = { ...baseTable, children: [] }
      expect(resolveTableTarget(tableWithoutEntry)).toBeNull()
    })
  })

  describe('buildTableSession — scalar columns', () => {
    it('matches walk varbinds to scalar columns and forms rows by instance', () => {
      const target = resolveTableTarget(baseEntry)!
      const varbinds: SnmpVarbind[] = [
        { oid: '.1.3.6.1.4.1.99999.1.1.1.2.1', type: 'INTEGER', value: 1, isError: false },
        { oid: '.1.3.6.1.4.1.99999.1.1.1.3.1', type: 'OCTET STRING', value: 'flags-1', isError: false },
        { oid: '.1.3.6.1.4.1.99999.1.1.1.2.2', type: 'INTEGER', value: 2, isError: false }
      ]

      const session = buildTableSession(target, varbinds)

      expect(session.columns.map((c) => c.name)).toEqual(['baseIndex', 'baseStatus', 'baseFlags'])
      expect(session.rows.map((r) => r.instance)).toEqual(['1', '2'])
      expect(session.rows[0].cells['1.3.6.1.4.1.99999.1.1.1.2'].value).toBe('1')
      expect(session.rows[0].cells['1.3.6.1.4.1.99999.1.1.1.3'].value).toBe('flags-1')
      expect(session.rows[1].cells['1.3.6.1.4.1.99999.1.1.1.2'].value).toBe('2')
    })

    it('skips varbinds that do not match any column without crashing', () => {
      const target = resolveTableTarget(baseEntry)!
      const varbinds: SnmpVarbind[] = [
        { oid: '.1.3.6.1.4.1.99999.1.1.1.2.1', type: 'INTEGER', value: 1, isError: false },
        // Unrelated OID — should be skipped silently
        { oid: '.1.3.6.1.4.1.55555.1.0', type: 'INTEGER', value: 99, isError: false }
      ]

      const session = buildTableSession(target, varbinds)
      expect(session.rows.map((r) => r.instance)).toEqual(['1'])
      expect(session.rows[0].cells['1.3.6.1.4.1.99999.1.1.1.2'].value).toBe('1')
    })
  })

  describe('isTableColumnChild', () => {
    function makeNode(overrides: Partial<MibTreeNodeData>): MibTreeNodeData {
      return {
        id: 'n',
        name: 'n',
        oid: '1.2.3',
        kind: 'scalar',
        access: 'read-only',
        syntax: '',
        module: 'M',
        children: [],
        ...overrides
      }
    }

    it('accepts column children with a non-empty OID', () => {
      expect(isTableColumnChild(makeNode({ kind: 'column' }))).toBe(true)
    })

    it('accepts scalar children with a non-empty OID', () => {
      expect(isTableColumnChild(makeNode({ kind: 'scalar' }))).toBe(true)
    })

    it('rejects column children without an OID', () => {
      expect(isTableColumnChild(makeNode({ kind: 'column', oid: '' }))).toBe(false)
    })

    it('rejects scalar children without an OID', () => {
      expect(isTableColumnChild(makeNode({ kind: 'scalar', oid: '' }))).toBe(false)
    })

    it('rejects non-column/non-scalar kinds', () => {
      expect(isTableColumnChild(makeNode({ kind: 'entry' }))).toBe(false)
      expect(isTableColumnChild(makeNode({ kind: 'table' }))).toBe(false)
      expect(isTableColumnChild(makeNode({ kind: 'group' }))).toBe(false)
      expect(isTableColumnChild(makeNode({ kind: 'notification' }))).toBe(false)
    })
  })

  describe('row lifecycle helpers', () => {
    it('detects RowStatus columns from textual convention, syntax, or enum values', () => {
      const target = resolveTableTarget(targetEntry)!
      const session = buildTableSession(target, [])
      const rowStatus = session.columns.find((c) => c.name === 'snmpTargetAddrRowStatus')!

      expect(isRowStatusColumn(rowStatus)).toBe(true)
      expect(isRowStatusColumn({ ...rowStatus, syntax: 'INTEGER', textualConvention: undefined })).toBe(true)
      expect(isRowStatusColumn(ifAdminStatus)).toBe(false)
    })

    it('reports lifecycle capability only for RowStatus-backed create/delete tables', () => {
      const target = resolveTableTarget(targetEntry)!
      const session = buildTableSession(target, [])
      const lifecycle = getTableRowLifecycle(session.columns)

      expect(lifecycle.rowStatusColumn?.name).toBe('snmpTargetAddrRowStatus')
      expect(lifecycle.initialValueColumns.map((c) => c.name)).toEqual([
        'snmpTargetAddrTAddress',
        'snmpTargetAddrTimeout'
      ])
      expect(lifecycle.canCreate).toBe(true)
      expect(lifecycle.canDelete).toBe(true)

      const readWriteOnly = getTableRowLifecycle(buildTableSession(resolveTableTarget(ifTable)!, []).columns)
      expect(readWriteOnly.canCreate).toBe(false)
      expect(readWriteOnly.canDelete).toBe(false)
    })

    it('validates numeric instance suffixes for table row lifecycle operations', () => {
      expect(validateTableInstanceSuffix('1')).toBeNull()
      expect(validateTableInstanceSuffix('.10.110.109.115.49')).toBeNull()
      expect(validateTableInstanceSuffix('')).toContain('required')
      expect(validateTableInstanceSuffix('name')).toContain('numeric')
    })

    it('builds Add Row SET values with createAndGo RowStatus', () => {
      const session = buildTableSession(resolveTableTarget(targetEntry)!, [])
      const lifecycle = getTableRowLifecycle(session.columns)

      expect(buildAddRowSetValues(lifecycle, '.10.110.109.115.49', {
        '1.3.6.1.6.3.12.1.2.1.4': 'udp:127.0.0.1/162',
        '1.3.6.1.6.3.12.1.2.1.5': '1500'
      })).toEqual([
        {
          oid: '1.3.6.1.6.3.12.1.2.1.4.10.110.109.115.49',
          type: 'OCTET STRING',
          value: 'udp:127.0.0.1/162'
        },
        {
          oid: '1.3.6.1.6.3.12.1.2.1.5.10.110.109.115.49',
          type: 'INTEGER',
          value: '1500'
        },
        {
          oid: '1.3.6.1.6.3.12.1.2.1.9.10.110.109.115.49',
          type: 'INTEGER',
          value: '4'
        }
      ])
    })

    it('builds Delete Row SET value with destroy RowStatus', () => {
      const session = buildTableSession(resolveTableTarget(targetEntry)!, [])
      const lifecycle = getTableRowLifecycle(session.columns)

      expect(buildDeleteRowSetValue(lifecycle, '10.110.109.115.49')).toEqual({
        oid: '1.3.6.1.6.3.12.1.2.1.9.10.110.109.115.49',
        type: 'INTEGER',
        value: '6'
      })
    })
  })
})
