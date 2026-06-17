import { afterEach, describe, expect, it, vi } from 'vitest'
import { optimizeTrip, computeRoute } from './routing'
import type { Stop } from '../types'

const stops: Stop[] = [
  { id: 's1', label: 'A', ville: '', lat: 48.4, lng: 1.6 },
  { id: 's2', label: 'B', ville: '', lat: 48.2, lng: 1.9 },
]

function mockFetchOnce(json: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(json) }))
}

afterEach(() => vi.unstubAllGlobals())

describe('optimizeTrip', () => {
  it('renvoie l\'ordre optimisé et la distance/durée depuis OSRM', async () => {
    mockFetchOnce({
      code: 'Ok',
      waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      trips: [{ distance: 47000, duration: 4320, geometry: { coordinates: [[1.7, 48.3], [1.9, 48.2]] } }],
    })
    const { order, route } = await optimizeTrip(stops)
    expect(order).toEqual([1, 0])
    expect(route.km).toBeCloseTo(47)
    expect(route.min).toBeCloseTo(72)
    expect(route.geometry).toEqual([[48.3, 1.7], [48.2, 1.9]])
    expect(route.optimized).toBe(true)
    expect(route.approximate).toBe(false)
  })

  it('repli haversine si OSRM échoue (garde l\'ordre donné)', async () => {
    mockFetchOnce({}, false)
    const { order, route } = await optimizeTrip(stops)
    expect(order).toEqual([0, 1])
    expect(route.approximate).toBe(true)
    expect(route.km).toBeGreaterThan(0)
    expect(route.min).toBeGreaterThan(0)
  })

  it('liste vide -> route nulle sans appel réseau', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { order, route } = await optimizeTrip([])
    expect(order).toEqual([])
    expect(route.km).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('computeRoute', () => {
  it('calcule km/min/tracé sur l\'ordre donné via OSRM /route', async () => {
    mockFetchOnce({
      code: 'Ok',
      routes: [{ distance: 31000, duration: 3120, geometry: { coordinates: [[1.7, 48.3], [1.8, 48.25]] } }],
    })
    const route = await computeRoute(stops)
    expect(route.km).toBeCloseTo(31)
    expect(route.min).toBeCloseTo(52)
    expect(route.approximate).toBe(false)
  })

  it('repli haversine si OSRM échoue', async () => {
    mockFetchOnce({ code: 'NoRoute' })
    const route = await computeRoute(stops)
    expect(route.approximate).toBe(true)
  })
})
