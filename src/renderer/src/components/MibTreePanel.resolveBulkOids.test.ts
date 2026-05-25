import { describe, expect, it } from 'vitest'
import type { MibTreeNodeData } from '../types'
import { resolveBulkOids } from './MibTreePanel'

const indexColumn: MibTreeNodeData = {
  id: 'BASE-MIB::baseIndex',
  name: 'baseIndex',
  oid: '1.3.6.1.4.1.99999.1.1.1.1',
  kind: 'column',
  access: 'not-accessible',
  syntax: 'INTEGER',
  module: 'BASE-MIB',
  children: []
}

const scalarStatus: MibTreeNodeData = {
  id: 'BASE-MIB::baseStatus',
  name: 'baseStatus',
  oid: '1.3.6.1.4.1.99999.1.1.1.2',
  kind: 'scalar',
  access: 'read-write',
  syntax: 'INTEGER',
  module: 'BASE-MIB',
  children: []
}

const scalarFlags: MibTreeNodeData = {
  id: 'BASE-MIB::baseFlags',
  name: 'baseFlags',
  oid: '1.3.6.1.4.1.99999.1.1.1.3',
  kind: 'scalar',
  access: 'read-only',
  syntax: 'BITS',
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
  children: [indexColumn, scalarStatus, scalarFlags]
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

describe('resolveBulkOids', () => {
  it('fans out an entry to every column OID (column + scalar children)', () => {
    expect(resolveBulkOids(baseEntry)).toEqual([
      '1.3.6.1.4.1.99999.1.1.1.1',
      '1.3.6.1.4.1.99999.1.1.1.2',
      '1.3.6.1.4.1.99999.1.1.1.3'
    ])
  })

  it('fans out a table to every column OID under its entry child', () => {
    expect(resolveBulkOids(baseTable)).toEqual([
      '1.3.6.1.4.1.99999.1.1.1.1',
      '1.3.6.1.4.1.99999.1.1.1.2',
      '1.3.6.1.4.1.99999.1.1.1.3'
    ])
  })

  it('falls back to [node.oid] when an entry has no valid column children', () => {
    const empty: MibTreeNodeData = { ...baseEntry, children: [] }
    expect(resolveBulkOids(empty)).toEqual([baseEntry.oid])
  })

  it('falls back to [node.oid] when an entry only has children without OIDs', () => {
    const orphan: MibTreeNodeData = { ...scalarStatus, oid: '' }
    const entry: MibTreeNodeData = { ...baseEntry, children: [orphan] }
    expect(resolveBulkOids(entry)).toEqual([baseEntry.oid])
  })

  it('falls back to [node.oid] when a table has no entry child', () => {
    const empty: MibTreeNodeData = { ...baseTable, children: [] }
    expect(resolveBulkOids(empty)).toEqual([baseTable.oid])
  })

  it('falls back to [node.oid] when a table entry has no column children', () => {
    const entryWithoutCols: MibTreeNodeData = { ...baseEntry, children: [] }
    const table: MibTreeNodeData = { ...baseTable, children: [entryWithoutCols] }
    expect(resolveBulkOids(table)).toEqual([baseTable.oid])
  })

  it('returns [node.oid] for scalar leaves', () => {
    expect(resolveBulkOids(scalarStatus)).toEqual([scalarStatus.oid])
  })

  it('returns [node.oid] for standalone column nodes', () => {
    expect(resolveBulkOids(indexColumn)).toEqual([indexColumn.oid])
  })

  it('returns [node.oid] for group / other kinds', () => {
    const group: MibTreeNodeData = { ...baseEntry, kind: 'group' }
    expect(resolveBulkOids(group)).toEqual([group.oid])
  })
})
