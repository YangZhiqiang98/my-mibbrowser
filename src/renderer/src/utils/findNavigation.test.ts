import { describe, expect, it } from 'vitest'
import { stepIndex, mergeExpandedKeys } from './findNavigation'

describe('stepIndex', () => {
  it('advances forward and wraps at the end', () => {
    expect(stepIndex(0, 3, 1)).toBe(1)
    expect(stepIndex(1, 3, 1)).toBe(2)
    expect(stepIndex(2, 3, 1)).toBe(0)
  })

  it('advances backward and wraps at the start', () => {
    expect(stepIndex(2, 3, -1)).toBe(1)
    expect(stepIndex(0, 3, -1)).toBe(2)
  })

  it('collapses to 0 when there are no matches', () => {
    expect(stepIndex(0, 0, 1)).toBe(0)
    expect(stepIndex(5, 0, -1)).toBe(0)
  })

  it('stays at 0 for a single match', () => {
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, 1, -1)).toBe(0)
  })
})

describe('mergeExpandedKeys', () => {
  it('adds only ancestors not already expanded', () => {
    expect(mergeExpandedKeys(['a'], ['a', 'b', 'c']).sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns the same array reference when nothing new is added (perf invariant)', () => {
    const prev = ['a', 'b']
    expect(mergeExpandedKeys(prev, ['a'])).toBe(prev)
    expect(mergeExpandedKeys(prev, ['a', 'b'])).toBe(prev)
    expect(mergeExpandedKeys(prev, [])).toBe(prev)
  })

  it('does not mutate the input array', () => {
    const prev = ['a']
    mergeExpandedKeys(prev, ['b'])
    expect(prev).toEqual(['a'])
  })
})
