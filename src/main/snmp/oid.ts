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
 * Detect the SNMPv1 `noSuchName` error returned by net-snmp when a walk runs
 * off the end of the MIB. net-snmp surfaces it as a `RequestFailedError` whose
 * `.status` equals {@link SNMP_NO_SUCH_NAME_STATUS}. This is a normal end of
 * walk, so callers should resolve success with whatever was collected.
 */
export function isNoSuchNameEnd(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as { status?: unknown }).status === SNMP_NO_SUCH_NAME_STATUS
}
