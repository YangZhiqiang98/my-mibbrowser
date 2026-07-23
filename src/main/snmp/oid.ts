/**
 * Pure OID helpers used by walk-shaped SNMP operations.
 *
 * Kept free of any `net-snmp` import so the logic is trivially unit-testable
 * and reusable from both the client and any future walk analog.
 */

/**
 * SNMPv1 `noSuchName` error-status code (RFC 1157). A v1 agent returns this
 * when a GETNEXT walks off the end of the MIB view — it is a normal walk
 * terminator, not a transport failure.
 */
export const SNMP_NO_SUCH_NAME_STATUS = 2

/**
 * Compare two dotted numeric OID strings in SNMP lexicographic order.
 *
 * Segments are compared numerically (not lexically) so that, e.g.,
 * `1.3.6.1.2.1.2` sorts before `1.3.6.1.2.1.10`. A shorter OID that is a
 * prefix of a longer one sorts first.
 *
 * Leading/trailing dots and empty segments are ignored, so net-snmp's
 * dotted-leading form (`.1.3.6...`) compares correctly against the dotless
 * form used everywhere else.
 *
 * @returns negative if `a < b`, positive if `a > b`, `0` if equal.
 */
export function compareOids(a: string, b: string): number {
  const aSegments = toSegments(a)
  const bSegments = toSegments(b)
  const len = Math.min(aSegments.length, bSegments.length)

  for (let i = 0; i < len; i++) {
    if (aSegments[i] !== bSegments[i]) {
      return aSegments[i] < bSegments[i] ? -1 : 1
    }
  }

  if (aSegments.length !== bSegments.length) {
    return aSegments.length < bSegments.length ? -1 : 1
  }
  return 0
}

/**
 * True when the next OID is strictly greater than the last pushed OID, i.e.
 * the walk is still making forward progress. A non-increasing OID indicates a
 * buggy/looping agent and the walk must terminate to avoid an infinite loop.
 */
export function isStrictlyIncreasing(previousOid: string | null, nextOid: string): boolean {
  if (previousOid === null) return true
  return compareOids(nextOid, previousOid) > 0
}

/**
 * Detect the SNMPv1 `noSuchName` error returned by net-snmp when a walk runs
 * off the end of the MIB. net-snmp surfaces it as a `RequestFailedError` whose
 * `.status` equals {@link SNMP_NO_SUCH_NAME_STATUS}. This is a normal end of
 * walk, so callers should resolve success with whatever was collected.
 */
export function isNoSuchNameEnd(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as { status?: unknown }).status === SNMP_NO_SUCH_NAME_STATUS
}

function toSegments(oid: string): number[] {
  return oid
    .split('.')
    .filter((segment) => segment.length > 0)
    .map((segment) => Number(segment))
}
