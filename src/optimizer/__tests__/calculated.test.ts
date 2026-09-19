import { describe, expect, it } from 'vitest'
import { isRoughlyEvenSpread, pointsRemaining, pointsSpent, validateAllocation } from '../calculated'
import type { AttributeName } from '../../types'

const alloc = (v: Partial<Record<AttributeName, number>>): Record<AttributeName, number> => ({
  Vitality: 0,
  Might: 0,
  Agility: 0,
  Defense: 0,
  Luck: 0,
  ...v,
})

describe('pointsSpent / pointsRemaining', () => {
  it('sums all five attributes', () => {
    expect(pointsSpent(alloc({ Vitality: 10, Might: 5, Agility: 5, Defense: 5, Luck: 5 }))).toBe(30)
  })

  it('computes remaining as budget minus spent', () => {
    expect(pointsRemaining(50, alloc({ Vitality: 10, Might: 10 }))).toBe(30)
  })
})

describe('validateAllocation', () => {
  it('accepts a valid allocation within budget', () => {
    const result = validateAllocation(30, alloc({ Vitality: 10, Might: 10, Agility: 10 }))
    expect(result.valid).toBe(true)
  })

  it('rejects overspend', () => {
    const result = validateAllocation(10, alloc({ Vitality: 10, Might: 10 }))
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/20 points but only 10/)
  })

  it('rejects negative values', () => {
    const result = validateAllocation(30, alloc({ Vitality: -5 }))
    expect(result.valid).toBe(false)
  })

  it('rejects non-integer values', () => {
    const result = validateAllocation(30, alloc({ Vitality: 2.5 }))
    expect(result.valid).toBe(false)
  })

  it('rejects NaN gracefully instead of throwing', () => {
    const result = validateAllocation(30, alloc({ Vitality: Number.NaN }))
    expect(result.valid).toBe(false)
  })
})

describe('isRoughlyEvenSpread', () => {
  it('flags a perfectly even allocation as even', () => {
    expect(isRoughlyEvenSpread(alloc({ Vitality: 20, Might: 20, Agility: 20, Defense: 20, Luck: 20 }))).toBe(true)
  })

  it('does not flag a heavily concentrated allocation as even', () => {
    expect(isRoughlyEvenSpread(alloc({ Vitality: 90, Might: 2, Agility: 2, Defense: 2, Luck: 2 }))).toBe(false)
  })

  it('treats an all-zero allocation as trivially even (no data to judge)', () => {
    expect(isRoughlyEvenSpread(alloc({}))).toBe(true)
  })
})
