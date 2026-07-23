import type { MibTreeNodeData } from '../types'

/**
 * Case-insensitive index from a MIB object name to its numeric OID.
 *
 * The MIB tree the renderer holds is search-oriented (`mibTreeIndex` only
 * supports substring search); it has no name -> OID lookup. This builds that
 * lookup once so QueryPanel can accept symbolic input like `sysDescr.0`.
 */
export interface NameToOidIndex {
  /** lower-cased object name -> numeric OID (dotless) */
  readonly byName: ReadonlyMap<string, string>
}

/** Strip a single leading '.' so OID comparisons are normalized. */
function normalizeOid(oid: string): string {
  return oid.startsWith('.') ? oid.slice(1) : oid
}

/** A pure numeric OID, optionally with a single leading dot (e.g. `.1.3.6`). */
const NUMERIC_OID = /^\.?\d+(?:\.\d+)*$/

/**
 * Build a name -> OID index from the current MIB tree. First occurrence of a
 * name wins so the result is deterministic when two modules export the same
 * object name (standard SMI names such as `sysDescr` are unique in practice).
 */
export function buildNameToOidIndex(mibTree: readonly MibTreeNodeData[]): NameToOidIndex {
  const byName = new Map<string, string>()

  const walk = (nodes: readonly MibTreeNodeData[]): void => {
    for (const node of nodes) {
      if (node.name && node.oid) {
        const key = node.name.toLowerCase()
        if (!byName.has(key)) {
          byName.set(key, normalizeOid(node.oid))
        }
      }
      if (node.children.length > 0) {
        walk(node.children)
      }
    }
  }

  walk(mibTree)
  return { byName }
}

/**
 * Resolve a single query token to a numeric OID.
 *
 * Accepted shapes:
 * - Pure numeric OID (`1.3.6.1.2.1.1.1.0`, `.1.3.6.1...`) -> returned dotless,
 *   unchanged otherwise.
 * - Symbolic name (`sysDescr`) -> the object's base OID.
 * - Symbolic name with a numeric instance suffix (`sysDescr.0`, `ifDescr.1`) ->
 *   base OID with the suffix appended.
 * - Module-qualified name (`SNMPv2-MIB::sysDescr.0`) -> the module prefix is
 *   dropped before lookup.
 *
 * Returns `null` when the leading symbolic label cannot be resolved. Callers
 * must treat `null` as an unresolvable token and abort, not send a bad request.
 */
export function resolveNameToOid(token: string, index: NameToOidIndex): string | null {
  const trimmed = token.trim()
  if (trimmed.length === 0) return null

  // Drop an optional `MODULE::` qualifier.
  const separator = trimmed.lastIndexOf('::')
  const bare = separator >= 0 ? trimmed.slice(separator + 2).trim() : trimmed
  if (bare.length === 0) return null

  // Already a numeric OID — normalize the leading dot and pass through.
  if (NUMERIC_OID.test(bare)) {
    return normalizeOid(bare)
  }

  // Symbolic: the object name is the leading segment; anything after the first
  // dot is a numeric instance suffix (object names never contain dots).
  const firstDot = bare.indexOf('.')
  const label = firstDot >= 0 ? bare.slice(0, firstDot) : bare
  const suffix = firstDot >= 0 ? bare.slice(firstDot + 1) : ''

  const baseOid = index.byName.get(label.toLowerCase())
  if (!baseOid) return null

  return suffix.length > 0 ? `${baseOid}.${suffix}` : baseOid
}
