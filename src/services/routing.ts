import type { LatLng, RouteResult, Stop } from '../types'
import { DEPOT } from '../data/depot'
import { routeLengthKm } from './geo'
import { decodePolyline6 } from './polyline'

// Valhalla (instance publique FOSSGIS) : contrairement à OSRM, il sait éviter les péages.
const VALHALLA = 'https://valhalla1.openstreetmap.de'
const AVG_KMH = 50 // vitesse moyenne pour estimer la durée en mode repli

/** Mode d'itinéraire. Sans péage par défaut. */
export interface RouteOptions {
  sansPeage?: boolean
}

interface Leg {
  shape: string
}
interface Trip {
  summary: { length: number; time: number }
  legs: Leg[]
  locations?: { original_index: number }[]
}

function emptyRoute(optimized: boolean): RouteResult {
  return { km: 0, min: 0, geometry: [[DEPOT.lat, DEPOT.lng]], optimized, approximate: false }
}

/** Repli hors-ligne : boucle dépôt -> arrêts -> dépôt, distance à vol d'oiseau. */
function fallbackRoute(stops: Stop[]): RouteResult {
  const loop: LatLng[] = [DEPOT, ...stops, DEPOT]
  const km = routeLengthKm(loop)
  return {
    km,
    min: (km / AVG_KMH) * 60,
    geometry: loop.map((p) => [p.lat, p.lng]),
    optimized: false,
    approximate: true,
  }
}

/** Recolle les tronçons en supprimant le point de jonction répété entre deux legs. */
function joinLegs(legs: Leg[]): [number, number][] {
  return legs.flatMap((leg, i) => {
    const pts = decodePolyline6(leg.shape)
    return i === 0 ? pts : pts.slice(1)
  })
}

async function askValhalla(path: string, pts: LatLng[], sansPeage: boolean): Promise<Trip> {
  const res = await fetch(`${VALHALLA}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      locations: pts.map((p) => ({ lat: p.lat, lon: p.lng })),
      costing: 'auto',
      costing_options: { auto: { use_tolls: sansPeage ? 0 : 1 } },
    }),
  })
  if (!res.ok) throw new Error('valhalla')
  const data = (await res.json()) as { trip?: Trip }
  if (!data.trip) throw new Error('valhalla')
  return data.trip
}

/**
 * Optimise l'ordre des arrêts (TSP) via Valhalla /optimized_route.
 * Le dépôt reste fixe en première et dernière position.
 * Renvoie l'ordre (indices dans `stops`, ordre de visite) + la route.
 */
export async function optimizeTrip(
  stops: Stop[],
  opts: RouteOptions = {},
): Promise<{ order: number[]; route: RouteResult }> {
  if (stops.length === 0) return { order: [], route: emptyRoute(true) }
  const pts = [DEPOT, ...stops, DEPOT]
  try {
    const trip = await askValhalla('/optimized_route', pts, opts.sansPeage ?? true)
    if (!trip.locations) throw new Error('valhalla')
    // On retire le dépôt aux deux bouts ; les indices restants pointent dans `stops` (décalés de 1).
    const order = trip.locations.slice(1, -1).map((l) => l.original_index - 1)
    return {
      order,
      route: {
        km: trip.summary.length,
        min: trip.summary.time / 60,
        geometry: joinLegs(trip.legs),
        optimized: true,
        approximate: false,
      },
    }
  } catch {
    return { order: stops.map((_, i) => i), route: fallbackRoute(stops) }
  }
}

/** Calcule km/min/tracé sur l'ordre DONNÉ (sans réoptimiser). Boucle dépôt -> arrêts -> dépôt. */
export async function computeRoute(stops: Stop[], opts: RouteOptions = {}): Promise<RouteResult> {
  if (stops.length === 0) return emptyRoute(false)
  const pts = [DEPOT, ...stops, DEPOT]
  try {
    const trip = await askValhalla('/route', pts, opts.sansPeage ?? true)
    return {
      km: trip.summary.length,
      min: trip.summary.time / 60,
      geometry: joinLegs(trip.legs),
      optimized: false,
      approximate: false,
    }
  } catch {
    return fallbackRoute(stops)
  }
}
