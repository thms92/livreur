import { describe, it, expect } from 'vitest'
import { haversine, routeLengthKm } from './geo'

describe('geo', () => {
  it('haversine : ~0 km pour le même point', () => {
    expect(haversine({ lat: 48.81, lng: 2.29 }, { lat: 48.81, lng: 2.29 })).toBeCloseTo(0, 5)
  })
  it('haversine : distance Malakoff→Boulogne ≈ 4–6 km', () => {
    const d = haversine({ lat: 48.8147, lng: 2.2949 }, { lat: 48.8396, lng: 2.2475 })
    expect(d).toBeGreaterThan(3)
    expect(d).toBeLessThan(7)
  })
  it('routeLengthKm : somme des segments', () => {
    const a = { lat: 48.80, lng: 2.28 }
    const b = { lat: 48.82, lng: 2.30 }
    const total = routeLengthKm([a, b, a])
    expect(total).toBeCloseTo(haversine(a, b) * 2, 5)
  })
})
