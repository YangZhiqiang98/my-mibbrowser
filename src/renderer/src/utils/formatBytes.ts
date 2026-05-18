/**
 * Format a byte array to a human-readable string based on ASN.1 type.
 * Handles IpAddress, TimeTicks, and OCTET STRING (text vs binary).
 *
 * Shared by MibTreePanel and QueryPanel for consistent display of
 * Buffer data that was serialized through Electron IPC.
 */
export function formatBytesToString(bytes: number[], type: string): string {
  if (bytes.length === 0) return ''

  if (type === 'IpAddress' && bytes.length === 4) {
    return bytes.join('.')
  }

  if (type === 'TimeTicks' && bytes.length >= 4) {
    const ticks = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]
    const days = Math.floor(ticks / 8640000)
    const hours = Math.floor((ticks % 8640000) / 360000)
    const minutes = Math.floor((ticks % 360000) / 6000)
    const seconds = Math.floor((ticks % 6000) / 100)
    const hundredths = ticks % 100
    return `${days}d ${hours}h ${minutes}m ${seconds}.${hundredths}s`
  }

  // OCTET STRING and others: try UTF-8 text decode
  let text = ''
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes))
  } catch {
    text = bytes.map(b => String.fromCharCode(b)).join('')
  }

  // Check if the text is mostly printable
  const printable = text.replace(/[\x00-\x08\x0e-\x1f]/g, '')
  if (printable.length >= text.length * 0.7 && text.length > 0) {
    return text
  }

  // Binary data: hex display
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
}
