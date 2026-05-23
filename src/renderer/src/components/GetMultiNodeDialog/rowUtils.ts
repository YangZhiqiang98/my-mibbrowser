import type { MibTreeNodeData } from '../../types'
import { buildFullOid } from '../SetMultiNodeDialog/rowUtils'
import type { GetRowDraft, GetRowError } from './types'

// `buildFullOid` and `stripBaseOid` are intentionally NOT redeclared here —
// they're imported from `SetMultiNodeDialog/rowUtils` so both dialogs share
// a single source of truth for OID composition / parsing. See PRD R8 / R11.

const OID_PATTERN = /^\d+(\.\d+)*$/

/**
 * Validate a single GET row. Returns the first violation found, or null if
 * the row is ready to be sent. GET only needs a syntactically valid full
 * OID — there is no target value / type to check.
 */
export function validateGetRow(row: GetRowDraft): GetRowError | null {
  const fullOid = buildFullOid(row.node.oid, row.instance)
  if (!OID_PATTERN.test(fullOid)) {
    return { rowId: row.rowId, field: 'fullOid', message: `OID invalid: ${fullOid || '(empty)'}` }
  }
  return null
}

/**
 * Build a fresh GET row from a tree node. Instance defaults to '0' so a
 * scalar GET works without typing; instanceOptions starts at null to render
 * the free-form Input until the user runs "获取实例".
 */
export function makeGetRowFromNode(node: MibTreeNodeData): GetRowDraft {
  return {
    rowId: makeRowId(),
    node,
    instance: '0',
    instanceOptions: null
  }
}

let rowIdCounter = 0
function makeRowId(): string {
  rowIdCounter += 1
  return `getrow-${Date.now().toString(36)}-${rowIdCounter.toString(36)}`
}

/**
 * Determine whether `node` (with the given default instance) duplicates a
 * row already in the list. Match is by node.id AND instance so the same MIB
 * node with different instance suffixes is intentionally allowed. The
 * drop-zone handler uses this to tell the user the node is already pending
 * instead of silently adding a second row.
 */
export function isDuplicate(rows: GetRowDraft[], node: MibTreeNodeData, instance = '0'): boolean {
  return rows.some((r) => r.node.id === node.id && r.instance === instance)
}
