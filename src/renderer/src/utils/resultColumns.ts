import type {
  MibTreeNodeData,
  ResultSession,
  ResultVarbind
} from '../types'
import type { SnmpOperation, SnmpResult } from '../../../main/snmp/types'
import { formatBytesToString } from './formatBytes'

/**
 * Result of resolving a varbind OID against the MIB tree to identify the
 * column name and instance suffix.
 */
interface ResolvedColumn {
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
 * downstream (e.g. fall back to '0' for scalar GETs).
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
 * Resolve a varbind OID into a (columnName, instance) tuple.
 *
 * Strategy:
 * 1. Longest-prefix match against the MIB tree using dot-segment boundaries.
 *    On a hit, columnName = node.name, instance = suffix after the matched node.
 * 2. On miss, fall back to splitting the OID at the last dot: columnName =
 *    the last-but-one segment (best label we can guess), instance = the final segment.
 * 3. Single-segment OIDs (rare) use the whole OID as the column name and
 *    an empty instance.
 */
function resolveOidToColumn(
  varbindOid: string,
  flattened: ReadonlyArray<{ oid: string; node: MibTreeNodeData }>
): ResolvedColumn {
  const oid = normalizeOid(varbindOid)

  for (const entry of flattened) {
    if (isOidWithinPrefix(oid, entry.oid)) {
      const instance = suffixAfterPrefix(oid, entry.oid)
      return {
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
      columnName: oid,
      oidPrefix: oid,
      instance: ''
    }
  }
  const prefix = oid.slice(0, lastDot)
  const instance = oid.slice(lastDot + 1)
  const labelDot = prefix.lastIndexOf('.')
  const columnName = labelDot >= 0 ? prefix.slice(labelDot + 1) : prefix

  return {
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
function formatVarbindValue(value: SnmpResult['varbinds'][number]['value'], type: string): string {
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

/**
 * Pre-computed resolve context for incremental varbind processing.
 * Create once at the start of a streaming session and reuse for each batch.
 */
export interface ResolveContext {
  readonly flattened: ReadonlyArray<{ oid: string; node: MibTreeNodeData }>
}

/**
 * Create a resolve context from the current MIB tree. Call once before
 * streaming starts; pass the result to resolveVarbind for each batch.
 */
export function initResolveContext(mibTree: readonly MibTreeNodeData[]): ResolveContext {
  return { flattened: flattenMibTree(mibTree) }
}

/**
 * Resolve a single raw SNMP varbind into a display-ready ResultVarbind.
 * Use during streaming to incrementally build the result session.
 */
export function resolveVarbind(
  vb: SnmpResult['varbinds'][number],
  ctx: ResolveContext,
  index: number
): ResultVarbind {
  const resolved = resolveOidToColumn(vb.oid, ctx.flattened)
  const isError = vb.isError
  return {
    key: normalizeOid(vb.oid),
    index,
    oid: normalizeOid(vb.oid),
    columnName: resolved.columnName,
    instance: resolved.instance,
    type: vb.type,
    value: isError ? '' : formatVarbindValue(vb.value, vb.type),
    rawType: vb.type,
    isError,
    errorTag: isError ? (vb.error || vb.type) : undefined
  }
}

/**
 * Build a ResultSession from a raw SNMP response by mapping each varbind
 * into a flat list row with MIB name resolution and type-aware formatting.
 *
 * - Each varbind becomes one row in `varbinds`, preserving the original
 *   response order.
 * - OID-to-name resolution uses longest-prefix MIB matching.
 * - SNMP-level error varbinds (noSuchObject / noSuchInstance / endOfMibView)
 *   are kept with isError=true and the error name in errorTag.
 */
export function buildResultSession(
  operation: SnmpOperation,
  rootOid: string,
  response: SnmpResult,
  mibTree: readonly MibTreeNodeData[]
): ResultSession {
  const ctx = initResolveContext(mibTree)

  // Filter varbinds to only include those within the rootOid subtree.
  // Raw GETBULK returns "next" OIDs that may cross into unrelated tables.
  const rootOidNorm = normalizeOid(rootOid)
  const filteredVarbinds = response.varbinds.filter((vb) => {
    // WALK / BULK_WALK already filter by subtree; also allow scalar GETs
    // where the returned OID exactly matches the root.
    if (operation === 'WALK' || operation === 'BULK_WALK') return true
    const oid = normalizeOid(vb.oid)
    return oid === rootOidNorm || oid.startsWith(rootOidNorm + '.')
  })

  const varbinds: ResultVarbind[] = filteredVarbinds.map((vb, i) =>
    resolveVarbind(vb, ctx, i + 1)
  )

  return {
    operation,
    rootOid,
    timestamp: response.timestamp,
    responseTime: response.responseTime,
    varbinds,
    error: response.success ? undefined : response.error
  }
}
