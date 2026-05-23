import type { MibTreeNodeData } from '../../types'
import type { SetRowDraft, SetRowError } from './types'

/**
 * Concatenate a base OID and an instance suffix into a single dotted OID
 * suitable for SNMP. Both halves may carry redundant dots — this
 * normalizes them.
 *
 * Examples:
 *   buildFullOid('1.3.6.1.2.1.1.1', '0')      => '1.3.6.1.2.1.1.1.0'
 *   buildFullOid('1.3.6.1.2.1.1.1', '.0')     => '1.3.6.1.2.1.1.1.0'
 *   buildFullOid('1.3.6.1.2.1.2.2.1.7', '1')  => '1.3.6.1.2.1.2.2.1.7.1'
 *   buildFullOid('1.3.6.1.2.1.1.1', '')       => '1.3.6.1.2.1.1.1.0'  // default scalar
 *   buildFullOid('.1.3.6.1', '.10.0.0.1')     => '1.3.6.1.10.0.0.1'
 */
export function buildFullOid(baseOid: string, instance: string): string {
  const base = (baseOid || '').replace(/^\.+/, '').replace(/\.+$/, '')
  const rawSuffix = (instance ?? '').trim()
  const suffix = rawSuffix === '' ? '0' : rawSuffix.replace(/^\.+/, '').replace(/\.+$/, '')
  if (!base) return suffix
  if (!suffix) return base
  return `${base}.${suffix}`
}

/**
 * Strip a known base OID prefix from a fully-qualified OID and return only
 * the suffix segments. Returns the original value (with any leading dot
 * removed) when the prefix doesn't match.
 *
 * Used to convert the OIDs returned from a `walk(baseOid)` into Instance
 * suffix options for the dropdown.
 */
export function stripBaseOid(fullOid: string, baseOid: string): string {
  const full = (fullOid || '').replace(/^\.+/, '')
  const base = (baseOid || '').replace(/^\.+/, '').replace(/\.+$/, '')
  if (!base) return full
  if (full === base) return ''
  const prefix = `${base}.`
  if (full.startsWith(prefix)) return full.slice(prefix.length)
  return full
}

const OID_PATTERN = /^\d+(\.\d+)*$/

/**
 * Validate a single row. Returns the first violation found, or null if the
 * row is ready to be sent. Caller is responsible for collecting per-row
 * errors across the whole table.
 */
export function validateRow(row: SetRowDraft): SetRowError | null {
  const fullOid = buildFullOid(row.node.oid, row.instance)
  if (!OID_PATTERN.test(fullOid)) {
    return { rowId: row.rowId, field: 'fullOid', message: `OID invalid: ${fullOid || '(empty)'}` }
  }
  if (!row.targetValue.trim()) {
    return { rowId: row.rowId, field: 'targetValue', message: 'Target value is required' }
  }
  if (!row.type.trim()) {
    return { rowId: row.rowId, field: 'type', message: 'Type is required' }
  }
  return null
}

export function validateGetRow(row: Pick<SetRowDraft, 'rowId' | 'node' | 'instance'>): SetRowError | null {
  const fullOid = buildFullOid(row.node.oid, row.instance)
  if (!OID_PATTERN.test(fullOid)) {
    return { rowId: row.rowId, field: 'fullOid', message: `OID invalid: ${fullOid || '(empty)'}` }
  }
  return null
}

/**
 * Map a MIB syntax string to one of the SNMP SET type option labels.
 * Falls back to OCTET STRING when no confident match. Lifted out of
 * MibTreePanel so the tool window and any future caller share one rule.
 */
export function guessSetTypeFromSyntax(syntax: string): string {
  const upper = (syntax || '').toUpperCase()
  if (upper.includes('INTEGER')) return 'INTEGER'
  if (upper.includes('OBJECT IDENTIFIER') || upper === 'OID') return 'OBJECT IDENTIFIER'
  if (upper.includes('IPADDRESS')) return 'IpAddress'
  if (upper.includes('COUNTER32')) return 'Counter32'
  if (upper.includes('GAUGE32') || upper.includes('UNSIGNED32')) return 'Gauge32'
  if (upper.includes('TIMETICKS')) return 'TimeTicks'
  return 'OCTET STRING'
}

/**
 * Build the seed row when a node is added to the tool window. `rowId` is fresh,
 * `instance` defaults to '.0' so scalar SETs work without typing, type is
 * guessed from syntax, and the current value starts in `idle`.
 */
export function makeRowFromNode(node: MibTreeNodeData): SetRowDraft {
  return {
    rowId: makeRowId(),
    node,
    instance: '0',
    instanceOptions: null,
    type: guessSetTypeFromSyntax(node.syntax),
    targetValue: '',
    currentValue: { state: 'idle' }
  }
}

let rowIdCounter = 0
function makeRowId(): string {
  rowIdCounter += 1
  return `setrow-${Date.now().toString(36)}-${rowIdCounter.toString(36)}`
}

/**
 * Determine whether `node` (with default instance) duplicates a row already
 * in the list. Used so the right-click "SET" handler can tell the user
 * the node is already pending instead of silently adding a second row.
 *
 * Match is by node.id AND instance — same MIB node with different instance
 * suffixes is intentionally allowed.
 */
export function isDuplicate(rows: SetRowDraft[], node: MibTreeNodeData, instance = '0'): boolean {
  return rows.some((r) => r.node.id === node.id && r.instance === instance)
}
