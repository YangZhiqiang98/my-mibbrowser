/**
 * Row-oriented data as produced by the renderer for export. Keys become CSV
 * headers / XML tag names; values are stringified for output.
 */
export type ExportRow = Record<string, unknown>

/**
 * UTF-8 byte-order mark. Excel needs this to open a UTF-8 CSV without mangling
 * non-ASCII text (e.g. Chinese device descriptions).
 */
const UTF8_BOM = '﻿'

/**
 * Characters that, when leading a spreadsheet cell, trigger formula evaluation
 * in Excel / LibreOffice / Google Sheets. Prefixing with a single quote
 * neutralizes the injection while leaving the visible text intact.
 */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

function neutralizeFormula(value: string): string {
  if (value.length > 0 && FORMULA_TRIGGERS.has(value[0])) {
    return `'${value}`
  }
  return value
}

function escapeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const neutralized = neutralizeFormula(String(raw))
  const needsQuoting =
    neutralized.includes(',') ||
    neutralized.includes('"') ||
    neutralized.includes('\n') ||
    neutralized.includes('\r')
  return needsQuoting ? `"${neutralized.replace(/"/g, '""')}"` : neutralized
}

/**
 * Build a CSV document from row objects.
 *
 * - Prepends a UTF-8 BOM so spreadsheet apps decode non-ASCII correctly.
 * - Neutralizes CSV formula injection on every cell.
 * - Quotes/escapes cells containing separators, quotes, or newlines.
 *
 * Returns an empty string for empty input so callers can skip writing a file.
 */
export function buildCsv(data: ExportRow[]): string {
  if (data.length === 0) return ''

  const headers = Object.keys(data[0])
  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(','),
    ...data.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(','))
  ]

  return UTF8_BOM + lines.join('\r\n')
}

/**
 * Escape a string for safe inclusion as XML text content.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Convert an arbitrary header string into a valid XML element name.
 *
 * A raw header such as "SNMP Value [hex]" is not a legal XML tag — spaces and
 * brackets would produce a document no standard parser can read. Invalid
 * characters are replaced with underscores, and a leading non-name-start
 * character is prefixed so the name is always well-formed.
 */
export function sanitizeXmlTagName(name: string): string {
  // Replace any character that is not a valid XML name character with '_'.
  let sanitized = name.replace(/[^A-Za-z0-9_.-]/g, '_')
  // XML names must start with a letter or underscore.
  if (sanitized.length === 0 || !/^[A-Za-z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`
  }
  return sanitized
}

/**
 * Build an XML document from row objects.
 *
 * Header strings are sanitized into valid XML element names (fixing the bug
 * where a raw header with spaces/brackets was used directly as a tag) and all
 * values are XML-escaped.
 *
 * Returns an empty string for empty input so callers can skip writing a file.
 */
export function buildXml(data: ExportRow[]): string {
  if (data.length === 0) return ''

  const headers = Object.keys(data[0])
  const tagNames = headers.map((header) => sanitizeXmlTagName(header))

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<snmpResults>',
    ...data.map((row) =>
      [
        '  <result>',
        ...headers.map(
          (header, index) =>
            `    <${tagNames[index]}>${escapeXml(String(row[header] ?? ''))}</${tagNames[index]}>`
        ),
        '  </result>'
      ].join('\n')
    ),
    '</snmpResults>'
  ]

  return lines.join('\n')
}
