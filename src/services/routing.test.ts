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
  const urls: string[] = []
  const f = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
    urls.push(url)
    if (init?.body) bodies.push(JSON.parse(init.body))
    return Promise.resolve({ ok, json: () => Promise.resolve(json) })
  })
  vi.stubGlobal('fetch', f)
  return { bodies, urls, f }
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

describe('limite de 10 points de l’instance Valhalla', () => {
  // 12 arrêts => 14 points avec le dépôt aux deux bouts : au-dessus de la limite.
  const douze: Stop[] = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, label: `A${i}`, ville: '', lat: 48.3 + i * 0.02, lng: 1.7 + i * 0.02,
  }))

  it('ne demande jamais plus de 10 points en une requête', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(douze)
    expect(bodies.length).toBeGreaterThan(1)
    for (const b of bodies) {
      expect((b as { locations: unknown[] }).locations.length).toBeLessThanOrEqual(10)
    }
  })

  it('chaîne les tronçons : chacun reprend le dernier point du précédent', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(douze)
    const locs = bodies.map((b) => (b as { locations: { lat: number; lon: number }[] }).locations)
    for (let i = 1; i < locs.length; i++) {
      expect(locs[i][0]).toEqual(locs[i - 1][locs[i - 1].length - 1])
    }
  })

  it('couvre toute la boucle, du dépôt au dépôt, sans trou ni doublon', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(douze)
    const locs = bodies.map((b) => (b as { locations: { lat: number; lon: number }[] }).locations)
    const parcours = locs.flatMap((l, i) => (i === 0 ? l : l.slice(1)))
    expect(parcours).toHaveLength(14)
    expect(parcours[0]).toEqual(parcours[13]) // dépôt aux deux bouts
    expect(parcours[1]).toMatchObject({ lat: 48.3, lon: 1.7 })
  })

  it('additionne distances et durées de tous les tronçons', async () => {
    mockValhalla(tripRoute([SHAPE_A])) // chaque tronçon renvoie 31 km / 52 min
    const route = await computeRoute(douze)
    expect(route.km).toBeCloseTo(31 * 2)
    expect(route.min).toBeCloseTo(52 * 2)
    expect(route.approximate).toBe(false)
  })

  it('recolle les tracés des tronçons successifs', async () => {
    mockValhalla(tripRoute([SHAPE_A]))
    const route = await computeRoute(douze)
    expect(route.geometry).toHaveLength(5) // 3 + 3 - la jonction
  })

  it('applique le mode péage à chaque tronçon, pas seulement au premier', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(douze, { sansPeage: false })
    for (const b of bodies) {
      expect(b).toMatchObject({ costing_options: { auto: { use_tolls: 1 } } })
    }
  })

  it('un seul tronçon quand la tournée tient sous la limite', async () => {
    const { bodies } = mockValhalla(tripRoute([SHAPE_A]))
    await computeRoute(douze.slice(0, 8))
    expect(bodies).toHaveLength(1)
  })

  it('au-delà de la limite, optimizeTrip renonce à réordonner mais garde un vrai tracé', async () => {
    const { urls, bodies } = mockValhalla(tripRoute([SHAPE_A]))
    const { order, route } = await optimizeTrip(douze)

    // Aucun appel à /optimized_route : il refuserait 14 points.
    expect(urls.every((u) => !u.includes('optimized_route'))).toBe(true)
    // L'ordre donné est conservé, faute de pouvoir optimiser.
    expect(order).toEqual(douze.map((_, i) => i))
    // Mais le tracé reste routier, découpé en tronçons — pas de ligne droite.
    expect(route.approximate).toBe(false)
    expect(route.optimized).toBe(false)
    expect(bodies.length).toBeGreaterThan(1)
  })

  it('sous la limite, optimizeTrip réordonne toujours via /optimized_route', async () => {
    const { urls } = mockValhalla({
      trip: {
        locations: [{ original_index: 0 }, { original_index: 2 }, { original_index: 1 }, { original_index: 3 }],
        summary: { length: 47, time: 4320 }, legs: [{ shape: SHAPE_A }],
      },
    })
    const { order } = await optimizeTrip(douze.slice(0, 2))
    expect(urls.some((u) => u.includes('optimized_route'))).toBe(true)
    expect(order).toEqual([1, 0])
  })
})
