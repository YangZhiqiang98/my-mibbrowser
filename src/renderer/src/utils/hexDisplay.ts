/**
 * Convert a string to a space-separated hex display for OCTET STRING toggle.
 *
 * Uses UTF-8 byte encoding (not `charCodeAt`) so multi-byte characters — e.g.
 * Chinese device descriptions — render as their actual on-the-wire bytes
 * rather than as truncated UTF-16 code unit values.
 */
export function toHexDisplay(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ')
}
