import type { SnmpSetValue, SnmpVarbind } from '../../../main/snmp/types'
import type { MibTreeNodeData } from '../types'
import { buildFullOid, guessSetTypeFromSyntax } from '../components/SetMultiNodeDialog/rowUtils'

export interface TableColumnMeta {
  key: string
  name: string
  oid: string
  syntax: string
  access: string
  type: string
  enumValues?: Array<{ name: string; value: number }>
  displayHint?: string
}

export interface TableCellData {
  value: string
  rawType: string
  isError: boolean
  errorTag?: string
}

export interface TableRowData {
  key: string
  instance: string
  cells: Record<string, TableCellData>
}

export interface TableSession {
  rootOid: string
  entryOid: string
  columns: TableColumnMeta[]
  rows: TableRowData[]
}

export interface TableTarget {
  tableNode: MibTreeNodeData
  entryNode: MibTreeNodeData
  columns: MibTreeNodeData[]
}

function normalizeOid(oid: string): string {
  return (oid || '').replace(/^\.+/, '').replace(/\.+$/, '')
}

function isOidWithinPrefix(oid: string, prefix: string): boolean {
  return oid === prefix || oid.startsWith(prefix + '.')
}

function suffixAfterPrefix(oid: string, prefix: string): string {
  if (oid === prefix) return ''
  return oid.slice(prefix.length + 1)
}

function compareInstances(a: string, b: string): number {
  const aParts = a.split('.')
  const bParts = b.split('.')
  const allNumeric = aParts.every((p) => /^\d+$/.test(p)) && bParts.every((p) => /^\d+$/.test(p))
  if (!allNumeric) return a.localeCompare(b)
  const len = Math.min(aParts.length, bParts.length)
  for (let i = 0; i < len; i++) {
    const diff = Number(aParts[i]) - Number(bParts[i])
    if (diff !== 0) return diff
  }
  return aParts.length - bParts.length
}

/**
 * Predicate for "this child of an entry is a table column."
 *
 * The MIB parser (`src/main/mib/parser.ts:determineKind`) classifies any
 * column whose access is not `not-accessible` as `'scalar'` rather than
 * `'column'`. In SMI semantics, every direct child of a SEQUENCE entry that
 * carries an OID is a column of that table, regardless of access. Both
 * `kind === 'column'` (INDEX / not-accessible columns) and `kind === 'scalar'`
 * (read-* data columns) must therefore be treated as table columns.
 *
 * Reused by Table Viewer (`resolveTableTarget`) and right-click GETBULK
 * (`resolveBulkOids` in `MibTreePanel.tsx`) to keep the filter rule in one
 * place — see `.trellis/spec/frontend/mib-tree-snmp-ops.md` for the spec.
 */
export function isTableColumnChild(node: MibTreeNodeData): boolean {
  return (node.kind === 'column' || node.kind === 'scalar') && !!node.oid
}

export function resolveTableTarget(node: MibTreeNodeData): TableTarget | null {
  if (node.kind === 'table') {
    const entry = node.children.find((child) => child.kind === 'entry')
    if (!entry) return null
    const columns = entry.children.filter(isTableColumnChild)
    return { tableNode: node, entryNode: entry, columns }
  }

  if (node.kind === 'entry') {
    const columns = node.children.filter(isTableColumnChild)
    return { tableNode: node, entryNode: node, columns }
  }

  return null
}

export function buildTableSession(target: TableTarget, varbinds: SnmpVarbind[]): TableSession {
  const columns = target.columns.map((column) => ({
    key: normalizeOid(column.oid),
    name: column.name,
    oid: normalizeOid(column.oid),
    syntax: column.syntax,
    access: column.access,
    type: guessSetTypeFromSyntax(column.syntax),
    enumValues: column.enumValues,
    displayHint: column.displayHint
  }))
  const rowsByInstance = new Map<string, TableRowData>()

  for (const vb of varbinds) {
    const oid = normalizeOid(vb.oid)
    const column = columns.find((candidate) => isOidWithinPrefix(oid, candidate.oid))
    if (!column) continue

    const instance = suffixAfterPrefix(oid, column.oid) || '0'
    let row = rowsByInstance.get(instance)
    if (!row) {
      row = { key: instance, instance, cells: {} }
      rowsByInstance.set(instance, row)
    }

    row.cells[column.key] = {
      value: formatTableValue(vb.value),
      rawType: vb.type,
      isError: vb.isError,
      errorTag: vb.isError ? (vb.error || vb.type) : undefined
    }
  }

  const rows = Array.from(rowsByInstance.values()).sort((a, b) => compareInstances(a.instance, b.instance))
  return {
    rootOid: normalizeOid(target.tableNode.oid),
    entryOid: normalizeOid(target.entryNode.oid),
    columns,
    rows
  }
}

export function isEditableColumn(column: Pick<TableColumnMeta, 'access'>): boolean {
  return column.access === 'read-write' || column.access === 'read-create'
}

export function buildTableSetValue(column: TableColumnMeta, instance: string, value: string): SnmpSetValue {
  return {
    oid: buildFullOid(column.oid, instance),
    type: column.type,
    value
  }
}

function formatTableValue(value: SnmpVarbind['value']): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return formatBytes(obj.data as number[])
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function formatBytes(bytes: number[]): string {
  const text = String.fromCharCode(...bytes)
  const printable = text.replace(/[\x00-\x08\x0e-\x1f]/g, '')
  if (printable.length >= text.length * 0.8 && text.length > 0) return text
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}
