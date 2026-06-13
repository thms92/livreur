import { describe, it, expect } from 'vitest'
import { buildRoutes, autoAssign, assignToDriver, centroid } from './routeOptimizer'
import { DEFAULT_DRIVERS } from '../data/drivers'
import { driverColor } from '../data/palette'
import { SEED_STOPS } from '../data/seed'
import type { Driver, Stop } from '../types'

const DRIVERS: Driver[] = DEFAULT_DRIVERS.map((d) => ({ ...d, couleur: driverColor(d.colorIndex) }))

describe('buildRoutes', () => {
  it('groupe par chauffeur, trie par order, calcule km/min', () => {
    const r = buildRoutes(SEED_STOPS, DRIVERS)
    expect(r.karim.stops.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(r.karim.km).toMatch(/^\d+\.\d$/)
    expect(Number(r.karim.min)).toBeGreaterThan(0)
  })
  it('ignore les arrêts non affectés', () => {
    const extra: Stop = { id: 'x', driver: null, ville: 'X', label: 'X', lat: 48.8, lng: 2.29 }
    const r = buildRoutes([...SEED_STOPS, extra], DRIVERS)
    const total = r.karim.stops.length + r.lea.stops.length + r.sofiane.stops.length
    expect(total).toBe(12)
  })
})

describe('centroid', () => {
  it('renvoie la moyenne lat/lng, null si vide', () => {
    expect(centroid([])).toBeNull()
    const c = centroid([{ lat: 48.8, lng: 2.2 } as Stop, { lat: 48.6, lng: 2.4 } as Stop])
    expect(c).toEqual({ lat: 48.7, lng: 2.3 })
  })
})

describe('autoAssign', () => {
  it('affecte les non-affectés au chauffeur le plus proche, sans écraser l’existant', () => {
    const extra: Stop = { id: 'x', driver: null, ville: 'Sceaux', label: 'test', lat: 48.7785, lng: 2.2882 }
    const out = autoAssign([...SEED_STOPS, extra], DRIVERS)
    const got = out.find((s) => s.id === 'x')!
    expect(got.driver).toBe('sofiane') // proche du cluster sud
    expect(out.find((s) => s.id === 's1')!.driver).toBe('karim')
  })
})

describe('assignToDriver', () => {
  it('affecte un arrêt à un chauffeur et réindexe order', () => {
    const extra: Stop = { id: 'x', driver: null, ville: 'X', label: 'X', lat: 48.815, lng: 2.30 }
    const out = assignToDriver([...SEED_STOPS, extra], 'x', 'lea')
    const lea = out.filter((s) => s.driver === 'lea').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    expect(lea.some((s) => s.id === 'x')).toBe(true)
    expect(lea.map((s) => s.order)).toEqual(lea.map((_, i) => i))
  })
  it('désaffecte avec driverId null', () => {
    const out = assignToDriver(SEED_STOPS, 's1', null)
    expect(out.find((s) => s.id === 's1')!.driver).toBeNull()
  })
  it('retire l’arrêt de son ancien chauffeur quand on le réaffecte', () => {
    const out = assignToDriver(SEED_STOPS, 's1', 'lea')
    expect(out.find((s) => s.id === 's1')!.driver).toBe('lea')
    expect(out.filter((s) => s.driver === 'karim').some((s) => s.id === 's1')).toBe(false)
  })
})
