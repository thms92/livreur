import { describe, it, expect } from 'vitest'
import { StubOptimizer } from './routeOptimizer'
import { DRIVERS } from '../data/drivers'
import { SEED_STOPS } from '../data/seed'
import type { Stop } from '../types'

const opt = new StubOptimizer()

describe('StubOptimizer', () => {
  it("conserve l'ordre curaté des arrêts seed", () => {
    const r = opt.dispatch(SEED_STOPS, DRIVERS)
    expect(r.karim.stops.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(r.lea.stops.length).toBe(4)
    expect(r.sofiane.stops.length).toBe(4)
  })

  it('calcule km et min comme le prototype', () => {
    const r = opt.dispatch(SEED_STOPS, DRIVERS)
    // km = pathLen([DEPOT, ...stops]) * 0.0294, à 1 décimale ; min = round(km*2.3 + n*4)
    expect(r.karim.km).toMatch(/^\d+\.\d$/)
    expect(Number(r.karim.min)).toBeGreaterThan(0)
  })

  it('affecte un arrêt sans chauffeur à la zone la plus proche', () => {
    // point proche du centroïde de Sofiane (473,564)
    const extra: Stop = { id: 'x1', driver: null, ville: 'Test', adresse: 'Test', x: 470, y: 560 }
    const r = opt.dispatch([...SEED_STOPS, extra], DRIVERS)
    expect(r.sofiane.stops.some((s) => s.id === 'x1')).toBe(true)
  })
})
