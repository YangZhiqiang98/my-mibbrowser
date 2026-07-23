import { describe, expect, it } from 'vitest'
import { toHexDisplay } from './hexDisplay'

describe('toHexDisplay', () => {
  it('renders ASCII bytes as space-separated hex', () => {
    // Arrange / Act / Assert
    expect(toHexDisplay('AB')).toBe('41 42')
  })

  it('encodes multi-byte UTF-8 characters as their real bytes', () => {
    // Arrange: Chinese character 中 is E4 B8 AD in UTF-8
    const result = toHexDisplay('中')

    // Assert
    expect(result).toBe('e4 b8 ad')
  })

  it('returns an empty string for empty input', () => {
    expect(toHexDisplay('')).toBe('')
  })
})
