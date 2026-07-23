import type { SnmpSetValue, SnmpVarbind } from '../../../main/snmp/types'
import type { MibTreeNodeData } from '../types'
import { buildFullOid, guessSetTypeFromSyntax } from '../components/SetMultiNodeDialog/rowUtils'
import { formatBytesToString } from './formatBytes'

export interface TableColumnMeta {
  key: string
  name: string
  oid: string
  syntax: string
  access: string
  type: string
  enumValues?: Array<{ name: string; value: number }>
  textualConvention?: string
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

export interface TableRowLifecycle {
  rowStatusColumn: TableColumnMeta | null
  initialValueColumns: TableColumnMeta[]
  canCreate: boolean
  canDelete: boolean
}

function normalizeOid(oid: string): string {
  return (oid || '').replace(/^\.+/, '').replace(/\.+$/, '')
}

function suffixAfterPrefix(oid: string, prefix: string): string {
  if (oid === prefix) return ''
  return oid.slice(prefix.length + 1)
}

function findColumnByOidPrefix(
  oid: string,
  columnByOid: ReadonlyMap<string, TableColumnMeta>
): TableColumnMeta | undefined {
  let candidate = oid
  while (candidate.length > 0) {
    const column = columnByOid.get(candidate)
    if (column) return column

    const lastDot = candidate.lastIndexOf('.')
    if (lastDot < 0) break
    candidate = candidate.slice(0, lastDot)
  }
  return undefined
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

function normalizeEnumName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeInstanceSuffix(instance: string): string {
  return instance.trim().replace(/^\.+/, '').replace(/\.+$/, '')
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
    textualConvention: column.textualConvention,
    displayHint: column.displayHint
  }))
  const columnByOid = new Map(columns.map((column) => [column.oid, column]))
  const rowsByInstance = new Map<string, TableRowData>()

  for (const vb of varbinds) {
    const oid = normalizeOid(vb.oid)
    const column = findColumnByOidPrefix(oid, columnByOid)
    if (!column) continue

    const instance = suffixAfterPrefix(oid, column.oid) || '0'
    let row = rowsByInstance.get(instance)
    if (!row) {
      row = { key: instance, instance, cells: {} }
      rowsByInstance.set(instance, row)
    }

    row.cells[column.key] = {
      value: formatTableValue(vb.value, vb.type),
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

export function isRowStatusColumn(
  column: Pick<TableColumnMeta, 'name' | 'syntax' | 'enumValues' | 'textualConvention'>
): boolean {
  if (/^rowstatus$/i.test(column.textualConvention ?? '')) return true
  if (/\browstatus\b/i.test(column.syntax)) return true

  const enumNames = new Set((column.enumValues ?? []).map((item) => normalizeEnumName(item.name)))
  if (enumNames.has('createandgo') && enumNames.has('destroy')) return true

  const columnName = normalizeEnumName(column.name)
  return columnName.endsWith('rowstatus') && enumNames.has('destroy')
}

export function getTableRowLifecycle(columns: TableColumnMeta[]): TableRowLifecycle {
  const rowStatusColumn = columns.find(isRowStatusColumn) ?? null
  const initialValueColumns = columns.filter((column) => isEditableColumn(column) && !isRowStatusColumn(column))
  const hasReadCreateColumn = columns.some((column) => column.access === 'read-create')

  return {
    rowStatusColumn,
    initialValueColumns,
    canCreate: !!rowStatusColumn && isEditableColumn(rowStatusColumn) && hasReadCreateColumn,
    canDelete: !!rowStatusColumn && isEditableColumn(rowStatusColumn)
  }
}

export function validateTableInstanceSuffix(instance: string): string | null {
  const normalized = normalizeInstanceSuffix(instance)
  if (!normalized) return 'Instance suffix is required'
  if (!/^\d+(\.\d+)*$/.test(normalized)) {
    return `Instance suffix must be numeric OID segments, e.g. 1 or 10.110.109.115.49`
  }
  return null
}

export function buildTableSetValue(column: TableColumnMeta, instance: string, value: string): SnmpSetValue {
  return {
    oid: buildFullOid(column.oid, normalizeInstanceSuffix(instance)),
    type: column.type,
    value
  }
}

export function buildAddRowSetValues(
  lifecycle: TableRowLifecycle,
  instance: string,
  valuesByColumnKey: Record<string, string>
): SnmpSetValue[] {
  if (!lifecycle.canCreate || !lifecycle.rowStatusColumn) {
    throw new Error('This table does not expose a RowStatus-backed create operation')
  }

  const instanceError = validateTableInstanceSuffix(instance)
  if (instanceError) throw new Error(instanceError)

  const normalizedInstance = normalizeInstanceSuffix(instance)
  const values = lifecycle.initialValueColumns.flatMap((column) => {
    const value = valuesByColumnKey[column.key]?.trim() ?? ''
    return value ? [buildTableSetValue(column, normalizedInstance, value)] : []
  })

  return [
    ...values,
    buildTableSetValue(lifecycle.rowStatusColumn, normalizedInstance, '4')
  ]
}

export function buildDeleteRowSetValue(lifecycle: TableRowLifecycle, instance: string): SnmpSetValue {
  if (!lifecycle.canDelete || !lifecycle.rowStatusColumn) {
    throw new Error('This table does not expose a RowStatus-backed delete operation')
  }

  const instanceError = validateTableInstanceSuffix(instance)
  if (instanceError) throw new Error(instanceError)

  return buildTableSetValue(lifecycle.rowStatusColumn, normalizeInstanceSuffix(instance), '6')
}

function formatTableValue(value: SnmpVarbind['value'], type: string): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as unknown as Record<string, unknown>
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return formatBytesToString(obj.data as number[], type)
    }
    const maybeBuf = value as Buffer
    if (typeof maybeBuf.length === 'number' && typeof maybeBuf[0] !== 'undefined') {
      return formatBytesToString(Array.from(maybeBuf), type)
    }
    // Empty object (e.g. a zero-length Buffer that serialized to `{}`): render
    // as an empty string rather than the literal "{}".
    if (Object.keys(obj).length === 0) return ''
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  if (type === 'TimeTicks') {
    const ticks = Number(value)
    const days = Math.floor(ticks / 8640000)
    const hours = Math.floor((ticks % 8640000) / 360000)
    const minutes = Math.floor((ticks % 360000) / 6000)
    const seconds = Math.floor((ticks % 6000) / 100)
    const hundredths = ticks % 100
    return `${days}d ${hours}h ${minutes}m ${seconds}.${hundredths}s`
  }

  return String(value)
}
