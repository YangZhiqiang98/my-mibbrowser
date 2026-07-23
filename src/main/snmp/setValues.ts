import type { SnmpSetValue } from './types'

/**
 * A varbind ready to hand to net-snmp's `session.set`, with the ASN.1 type
 * already resolved to the library's numeric ObjectType constant and the value
 * coerced/validated into the shape net-snmp expects for that type.
 */
export interface PreparedSetVarbind {
  oid: string
  type: number
  value: string | number
}

/**
 * Result of preparing a SET request. Either every value converted cleanly
 * (`ok: true`) or the first invalid value produced a user-friendly error
 * (`ok: false`). The client uses this to reject illegal input BEFORE opening a
 * socket, so a typo never spins up a UDP session.
 */
export type PrepareSetResult =
  | { ok: true; varbinds: PreparedSetVarbind[] }
  | { ok: false; error: string }

const SIGNED_32_MIN = -2147483648
const SIGNED_32_MAX = 2147483647
const UNSIGNED_32_MAX = 4294967295

function isIntegerString(raw: string): boolean {
  return /^[+-]?\d+$/.test(raw.trim())
}

function isUnsignedIntegerString(raw: string): boolean {
  return /^\+?\d+$/.test(raw.trim())
}

/**
 * Validate and convert a single SET value based on its ASN.1 type name.
 *
 * Returns the value coerced into the JS shape net-snmp expects, or a
 * human-readable error string describing why the input is invalid. Never
 * throws — malformed input is a normal, reportable condition.
 */
export function convertSetValue(
  type: string,
  rawValue: string | number
): { ok: true; value: string | number } | { ok: false; error: string } {
  const asString = typeof rawValue === 'number' ? String(rawValue) : rawValue

  switch (type) {
    case 'INTEGER': {
      if (!isIntegerString(asString)) {
        return { ok: false, error: `INTEGER value must be a whole number, got "${asString}"` }
      }
      const num = Number(asString.trim())
      if (!Number.isInteger(num) || num < SIGNED_32_MIN || num > SIGNED_32_MAX) {
        return { ok: false, error: `INTEGER value out of 32-bit range: "${asString}"` }
      }
      return { ok: true, value: num }
    }

    case 'Counter32':
    case 'Gauge32':
    case 'TimeTicks': {
      if (!isUnsignedIntegerString(asString)) {
        return { ok: false, error: `${type} value must be a non-negative whole number, got "${asString}"` }
      }
      const num = Number(asString.trim())
      if (!Number.isInteger(num) || num < 0 || num > UNSIGNED_32_MAX) {
        return { ok: false, error: `${type} value out of 32-bit unsigned range: "${asString}"` }
      }
      return { ok: true, value: num }
    }

    case 'Counter64': {
      if (!isUnsignedIntegerString(asString)) {
        return { ok: false, error: `Counter64 value must be a non-negative whole number, got "${asString}"` }
      }
      // Counter64 can exceed Number.MAX_SAFE_INTEGER; keep it as a decimal
      // string so net-snmp can build the 64-bit value without precision loss.
      return { ok: true, value: asString.trim() }
    }

    case 'IpAddress': {
      const trimmed = asString.trim()
      const octets = trimmed.split('.')
      const valid =
        octets.length === 4 &&
        octets.every((octet) => /^\d+$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
      if (!valid) {
        return { ok: false, error: `IpAddress value must be a dotted IPv4 address, got "${asString}"` }
      }
      return { ok: true, value: trimmed }
    }

    case 'OBJECT IDENTIFIER': {
      const trimmed = asString.trim().replace(/^\./, '')
      if (!/^\d+(\.\d+)*$/.test(trimmed)) {
        return { ok: false, error: `OBJECT IDENTIFIER value must be a numeric OID, got "${asString}"` }
      }
      return { ok: true, value: trimmed }
    }

    case 'NULL':
      return { ok: true, value: '' }

    case 'OCTET STRING':
    case 'Opaque':
      return { ok: true, value: asString }

    default:
      // Unknown types are treated as OCTET STRING by the client's typeMap
      // fallback; pass the raw string through unchanged.
      return { ok: true, value: asString }
  }
}

/**
 * Convert and validate a full SET request, resolving each ASN.1 type name to
 * its net-snmp numeric constant via `typeMap`. Stops at the first invalid
 * value and returns a friendly error so the caller can bail out before
 * creating a session.
 *
 * `typeMap` is injected (rather than importing net-snmp here) so this module
 * stays pure and unit-testable without the native dependency.
 */
export function prepareSetVarbinds(
  values: SnmpSetValue[],
  typeMap: Record<string, number>,
  fallbackType: number
): PrepareSetResult {
  const varbinds: PreparedSetVarbind[] = []

  for (const value of values) {
    const converted = convertSetValue(value.type, value.value)
    if (!converted.ok) {
      return { ok: false, error: converted.error }
    }
    varbinds.push({
      oid: value.oid,
      type: typeMap[value.type] ?? fallbackType,
      value: converted.value
    })
  }

  return { ok: true, varbinds }
}
