import type {
  MibTreeNodeData,
  ResultCell,
  ResultColumn,
  ResultRowData,
  ResultSession
} from '../types'
import type { SnmpOperation, SnmpResult, SnmpVarbind } from '../../../main/snmp/types'
import { formatBytesToString } from './formatBytes'

/**
 * Result of resolving a varbind OID against the MIB tree to identify the
 * (column, instance) pair the cell belongs to.
 */
export interface ResolvedColumn {
  columnKey: string
  columnName: string
  oidPrefix: string
  instance: string
}

/**
 * Strip a leading '.' if present so OID comparisons are normalized.
 */
function normalizeOid(oid: string): string {
  return oid.startsWith('.') ? oid.slice(1) : oid
}

/**
 * Determine whether `oid` is exactly `prefix` or a descendant of it, using
 * OID dot-segment boundaries (so prefix 1.3.6 does NOT match 1.3.60).
 */
function isOidWithinPrefix(oid: string, prefix: string): boolean {
  if (oid === prefix) return true
  return oid.startsWith(prefix + '.')
}

/**
 * Compute the instance suffix of `oid` relative to `prefix`. If oid === prefix
 * the instance is the empty string. Caller should normalize empty instance
 * downstream (e.g. fall back to '0' or 'value' for scalar GETs).
 */
function suffixAfterPrefix(oid: string, prefix: string): string {
  if (oid === prefix) return ''
  return oid.slice(prefix.length + 1) // drop the separator dot
}

/**
 * Flatten the MIB tree into a list of (oid, node) pairs sorted by OID
 * segment count descending so that longest-prefix lookup is the first
 * matching entry. Empty-OID nodes are skipped — they cannot participate
 * in OID-based matching.
 */
function flattenMibTree(mibTree: readonly MibTreeNodeData[]): Array<{ oid: string; node: MibTreeNodeData }> {
  const out: Array<{ oid: string; node: MibTreeNodeData }> = []
  function walk(nodes: readonly MibTreeNodeData[]): void {
    for (const node of nodes) {
      if (node.oid) {
        out.push({ oid: normalizeOid(node.oid), node })
      }
      if (node.children.length > 0) {
        walk(node.children)
      }
    }
  }
  walk(mibTree)
  // Sort by descending segment count, then by descending raw length, so
  // longest-prefix wins on ties.
  out.sort((a, b) => {
    const segA = a.oid.split('.').length
    const segB = b.oid.split('.').length
    if (segA !== segB) return segB - segA
    return b.oid.length - a.oid.length
  })
  return out
}

/**
 * Resolve a varbind OID into a (column, instance) tuple.
 *
 * Strategy:
 * 1. Longest-prefix match against the MIB tree using dot-segment boundaries.
 *    On a hit, columnKey = node.oid, columnName = node.name, instance =
 *    suffix after the matched node.
 * 2. On miss, fall back to splitting the OID at the last dot: column =
 *    everything before, columnName = the last-but-one segment (best label
 *    we can guess), instance = the final segment.
 * 3. Single-segment OIDs (rare) collapse to an empty column key and the
 *    whole OID as instance.
 */
export function resolveOidToColumn(
  varbindOid: string,
  flattened: ReadonlyArray<{ oid: string; node: MibTreeNodeData }>
): ResolvedColumn {
  const oid = normalizeOid(varbindOid)

  for (const entry of flattened) {
    if (isOidWithinPrefix(oid, entry.oid)) {
      const instance = suffixAfterPrefix(oid, entry.oid)
      return {
        columnKey: entry.oid,
        columnName: entry.node.name || entry.oid.split('.').pop() || entry.oid,
        oidPrefix: entry.oid,
        instance: instance.length > 0 ? instance : '0'
      }
    }
  }

  // Fallback: split at last dot.
  const lastDot = oid.lastIndexOf('.')
  if (lastDot < 0) {
    return {
      columnKey: '',
      columnName: '?',
      oidPrefix: '',
      instance: oid
    }
  }
  const prefix = oid.slice(0, lastDot)
  const instance = oid.slice(lastDot + 1)
  const labelDot = prefix.lastIndexOf('.')
  const columnName = labelDot >= 0 ? prefix.slice(labelDot + 1) : prefix

  return {
    columnKey: prefix,
    columnName,
    oidPrefix: prefix,
    instance
  }
}

/**
 * Format a single varbind value for table display, decoding IPC-serialized
 * Buffers (which arrive as { type: 'Buffer', data: number[] }) and pretty-
 * printing TimeTicks.
 */
function formatVarbindValue(value: SnmpVarbind['value'], type: string): string {
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

/**
 * Compare two instance strings using natural OID ordering when both are
 * dotted-numeric, falling back to plain string compare otherwise.
 */
function compareInstances(a: string, b: string): number {
  const aParts = a.split('.')
  const bParts = b.split('.')
  const allNumericA = aParts.every((p) => /^\d+$/.test(p))
  const allNumericB = bParts.every((p) => /^\d+$/.test(p))
  if (allNumericA && allNumericB) {
    const n = Math.min(aParts.length, bParts.length)
    for (let i = 0; i < n; i++) {
      const ai = Number(aParts[i])
      const bi = Number(bParts[i])
      if (ai !== bi) return ai - bi
    }
    return aParts.length - bParts.length
  }
  return a.localeCompare(b)
}

/**
 * Build a ResultSession from a raw SNMP response by classifying each varbind
 * into a (column, instance) pair via the MIB tree.
 *
 * - Columns are listed in first-observed order.
 * - Rows are listed in instance order (numeric-aware when applicable).
 * - SNMP-level error varbinds (noSuchObject / noSuchInstance / endOfMibView)
 *   are kept in the table with isError=true and the error name in errorTag,
 *   so the UI can render an inline error indicator instead of silently
 *   dropping rows.
 */
export function buildResultSession(
  operation: SnmpOperation,
  rootOid: string,
  response: SnmpResult,
  mibTree: readonly MibTreeNodeData[]
): ResultSession {
  const flattened = flattenMibTree(mibTree)

  const columnOrder: string[] = []
  const columnsByKey = new Map<string, ResultColumn>()
  const rowOrder: string[] = []
  const rowsByKey = new Map<string, ResultRowData>()

  for (const vb of response.varbinds) {
    const resolved = resolveOidToColumn(vb.oid, flattened)
    const { columnKey, columnName, oidPrefix, instance } = resolved

    // Register column on first sighting; later occurrences keep the original
    // type label even if downstream varbinds carry a different SNMP type.
    if (!columnsByKey.has(columnKey)) {
      columnsByKey.set(columnKey, {
        key: columnKey,
        name: columnName,
        type: vb.type,
        oidPrefix
      })
      columnOrder.push(columnKey)
    }

    const rowKey = instance
    let row = rowsByKey.get(rowKey)
    if (!row) {
      row = { key: rowKey, instance, cells: {} }
      rowsByKey.set(rowKey, row)
      rowOrder.push(rowKey)
    }

    const cell: ResultCell = {
      value: formatVarbindValue(vb.value, vb.type),
      rawType: vb.type,
      isError: vb.isError,
      errorTag: vb.isError ? (vb.error || vb.type) : undefined
    }
    row.cells[columnKey] = cell
  }

  rowOrder.sort(compareInstances)

  return {
    operation,
    rootOid,
    timestamp: response.timestamp,
    responseTime: response.responseTime,
    columns: columnOrder.map((k) => columnsByKey.get(k)!),
    rows: rowOrder.map((k) => rowsByKey.get(k)!),
    error: response.success ? undefined : response.error
  }
}
