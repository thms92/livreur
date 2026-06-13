import { describe, it, expect } from 'vitest'
import { driverColor, PALETTE_SIZE } from './palette'

describe('driverColor', () => {
  it('mappe l’index sur la variable CSS de palette (1-based)', () => {
    expect(driverColor(0)).toBe('var(--c-1)')
    expect(driverColor(2)).toBe('var(--c-3)')
  })
  it('cycle modulo la taille de palette', () => {
    expect(driverColor(PALETTE_SIZE)).toBe('var(--c-1)')
    expect(driverColor(PALETTE_SIZE + 1)).toBe('var(--c-2)')
  })
})
