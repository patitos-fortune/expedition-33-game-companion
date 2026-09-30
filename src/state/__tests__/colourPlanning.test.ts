import { describe, expect, it } from 'vitest'
import { currentPaidLuminaCost, extraColourNeeded, plannedPaidLuminaCost, totalColourNeeded } from '../colourPlanning'
import { defaultBuild } from '../persistence'
import type { NormalizedPicto } from '../../types'

function makePicto(id: string, cost: number): NormalizedPicto {
  return { id, name: id, type: 'Offensive', effect: '', fullUrl: '', cost, costValid: true, levels: [] }
}

const pictosById = new Map([
  ['p1', makePicto('p1', 5)],
  ['p2', makePicto('p2', 10)],
  ['p3', makePicto('p3', 20)],
])

describe('colourPlanning', () => {
  it('currentPaidLuminaCost only counts activeLuminaIds, excluding equipped-Picto passives', () => {
    const build = defaultBuild(1)
    build.equippedPictoIds = ['p1']
    build.activeLuminaIds = ['p1', 'p2']
    expect(currentPaidLuminaCost(build, pictosById)).toBe(10) // p1 is free (equipped), p2 costs 10
  })

  it('plannedPaidLuminaCost includes the union of active and wishlist Luminas', () => {
    const build = defaultBuild(1)
    build.equippedPictoIds = []
    build.activeLuminaIds = ['p1']
    build.plannedLuminaIds = ['p2', 'p3']
    expect(plannedPaidLuminaCost(build, pictosById)).toBe(35) // 5 + 10 + 20
  })

  it('plannedPaidLuminaCost does not double-count a Lumina that is both active and planned', () => {
    const build = defaultBuild(1)
    build.activeLuminaIds = ['p1']
    build.plannedLuminaIds = ['p1', 'p2']
    expect(plannedPaidLuminaCost(build, pictosById)).toBe(15) // 5 + 10, not 5+5+10
  })

  it('plannedPaidLuminaCost treats a wishlist item as free if its Picto is equipped', () => {
    const build = defaultBuild(1)
    build.equippedPictoIds = ['p3']
    build.plannedLuminaIds = ['p3']
    expect(plannedPaidLuminaCost(build, pictosById)).toBe(0)
  })

  it('extraColourNeeded is the shortfall between planned cost and current capacity, floored at 0', () => {
    const build = defaultBuild(1)
    build.luminaPointBudget = 12
    build.activeLuminaIds = ['p1']
    build.plannedLuminaIds = ['p2']
    expect(extraColourNeeded(build, pictosById)).toBe(3) // planned=15, budget=12 -> +3

    build.luminaPointBudget = 20
    expect(extraColourNeeded(build, pictosById)).toBe(0) // fits within capacity
  })

  it('totalColourNeeded sums extraColourNeeded across the whole party', () => {
    const b1 = defaultBuild(1)
    b1.luminaPointBudget = 0
    b1.plannedLuminaIds = ['p1'] // needs +5

    const b2 = defaultBuild(2)
    b2.luminaPointBudget = 0
    b2.plannedLuminaIds = ['p2'] // needs +10

    expect(totalColourNeeded([b1, b2], pictosById)).toBe(15)
  })

  it('characters-page and party-summary figures now agree once a wishlist item exists (regression for the drift found in the audit)', () => {
    const build = defaultBuild(1)
    build.luminaPointBudget = 0
    build.activeLuminaIds = []
    build.plannedLuminaIds = ['p2'] // wishlist-only addition

    // Both call sites now route through the same helper, so this is the single
    // number both CharactersView and PartySummaryView will display.
    expect(extraColourNeeded(build, pictosById)).toBe(10)
  })
})
