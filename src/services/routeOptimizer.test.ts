import { describe, it, expect } from 'vitest'
import { StubOptimizer } from './routeOptimizer'
import { DRIVERS } from '../data/drivers'
import { SEED_STOPS } from '../data/seed'
import type { Stop } from '../types'

const opt = new StubOptimizer()

describe('StubOptimizer (lat/lng)', () => {
  it("conserve l'ordre curaté des arrêts seed", () => {
    const r = opt.dispatch(SEED_STOPS, DRIVERS)
    expect(r.karim.stops.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(r.lea.stops.length).toBe(4)
    expect(r.sofiane.stops.length).toBe(4)
  })

  it('km est une vraie distance (>0, format 1 décimale) et min > 0', () => {
    const r = opt.dispatch(SEED_STOPS, DRIVERS)
    expect(r.karim.km).toMatch(/^\d+\.\d$/)
    expect(Number(r.karim.km)).toBeGreaterThan(0)
    expect(Number(r.karim.min)).toBeGreaterThan(0)
  })

  it('affecte un arrêt sans chauffeur à la zone la plus proche (haversine)', () => {
    // point proche du centroïde Sofiane (48.7779, 2.2804)
    const extra: Stop = { id: 'x1', driver: null, ville: 'Test', label: 'Test', lat: 48.778, lng: 2.281 }
    const r = opt.dispatch([...SEED_STOPS, extra], DRIVERS)
    expect(r.sofiane.stops.some((s) => s.id === 'x1')).toBe(true)
  })
})
