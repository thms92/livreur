import { afterEach, describe, expect, it, vi } from 'vitest'
import { optimizeTrip, computeRoute } from './routing'
import type { Stop } from '../types'

const stops: Stop[] = [
  { id: 's1', label: 'A', ville: '', lat: 48.4, lng: 1.6 },
  { id: 's2', label: 'B', ville: '', lat: 48.2, lng: 1.9 },
]

// Fragments réels Valhalla : 3 points chacun.
const SHAPE_A = 'qkvc{Amg{gBjO`CdW~C'
const PTS_A: [number, number][] = [
  [48.312009, 1.718407],
  [48.311747, 1.718342],
  [48.31136, 1.718262],
]

/** Mocke fetch et retient les corps de requête envoyés, pour vérifier le mode demandé. */
function mockValhalla(json: unknown, ok = true) {
  const bodies: unknown[] = []
  const f = vi.fn().mockImplementation((_url: string, init?: { body?: string }) => {
    if (init?.body) bodies.push(JSON.parse(init.body))
    return Promise.resolve({ ok, json: () => Promise.resolve(json) })
  })
  vi.stubGlobal('fetch', f)
  return { bodies, f }
}

const tripRoute = (legs: string[]) => ({
  trip: { summary: { length: 31, time: 3120 }, legs: legs.map((shape) => ({ shape })) },
})

afterEach(() => vi.unstubAllGlobals())

describe('computeRoute', () => {
  it('lit distance, durée et tracé depuis la réponse Valhalla', async () => {
    mockValhalla(tripRoute([SHAPE_A]))
    const route = await computeRoute(stops)
    expect(route.km).toBeCloseTo(31)
    expect(route.min).toBeCloseTo(52)
    expect(route.geometry).toEqual(PTS_A)
    expect(route.approximate).toBe(false)
    expect(route.optimized).toBe(false)
  })

  it('sans péage par défaut : demande use_tolls = 0', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(stops)
    expect(bodies[0]).toMatchObject({ costing_options: { auto: { use_tolls: 0 } } })
  })

  it('mode péage autorisé : demande use_tolls = 1', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(stops, { sansPeage: false })
    expect(bodies[0]).toMatchObject({ costing_options: { auto: { use_tolls: 1 } } })
  })

  it('boucle dépôt -> arrêts -> dépôt : le premier et le dernier point sont le dépôt', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(stops)
    const locs = (bodies[0] as { locations: { lat: number; lon: number }[] }).locations
    expect(locs).toHaveLength(4)
    expect(locs[0]).toEqual(locs[3])
    expect(locs[1]).toMatchObject({ lat: 48.4, lon: 1.6 })
  })

  it('recolle les tronçons sans dupliquer le point de jonction', async () => {
    mockValhalla(tripRoute([SHAPE_A, SHAPE_A]))
    const route = await computeRoute(stops)
    // 3 + 3 points, moins la jonction répétée = 5
    expect(route.geometry).toHaveLength(5)
  })

  it('repli haversine si Valhalla échoue', async () => {
    mockValhalla({ error: 'No route found' })
    const route = await computeRoute(stops)
    expect(route.approximate).toBe(true)
    expect(route.km).toBeGreaterThan(0)
  })
})

describe('optimizeTrip', () => {
  const optimized = {
    trip: {
      locations: [
        { original_index: 0 },
        { original_index: 2 },
        { original_index: 1 },
        { original_index: 3 },
      ],
      summary: { length: 47, time: 4320 },
      legs: [{ shape: SHAPE_A }],
    },
  }

  it('renvoie l’ordre des arrêts issu de original_index', async () => {
    mockValhalla(optimized)
    const { order, route } = await optimizeTrip(stops)
    // locations = [dépôt, s1, s2, dépôt] ; Valhalla visite s2 avant s1
    expect(order).toEqual([1, 0])
    expect(route.km).toBeCloseTo(47)
    expect(route.min).toBeCloseTo(72)
    expect(route.optimized).toBe(true)
  })

  it('transmet aussi le mode sans péage', async () => {
    const { bodies } = mockValhalla(optimized)
    await optimizeTrip(stops, { sansPeage: false })
    expect(bodies[0]).toMatchObject({ costing_options: { auto: { use_tolls: 1 } } })
  })

  it('repli haversine si Valhalla échoue (garde l’ordre donné)', async () => {
    mockValhalla({}, false)
    const { order, route } = await optimizeTrip(stops)
    expect(order).toEqual([0, 1])
    expect(route.approximate).toBe(true)
  })

  it('liste vide -> route nulle sans appel réseau', async () => {
    const { f } = mockValhalla({})
    const { order, route } = await optimizeTrip([])
    expect(order).toEqual([])
    expect(route.km).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})
