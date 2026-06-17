import type { LatLng, RouteResult, Stop } from '../types'
import { DEPOT } from '../data/depot'
import { routeLengthKm } from './geo'

const OSRM = 'https://router.project-osrm.org'
const AVG_KMH = 50 // vitesse moyenne pour estimer la durée en mode repli

function coordsParam(pts: LatLng[]): string {
  return pts.map((p) => `${p.lng},${p.lat}`).join(';')
}

function toLatLngPath(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng])
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

interface TripResponse {
  code: string
  waypoints: { waypoint_index: number }[]
  trips: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
}

interface RouteResponse {
  code: string
  routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
}

/**
 * Optimise l'ordre des arrêts (TSP) via OSRM /trip, boucle au départ du dépôt.
 * Renvoie l'ordre (indices dans `stops`, ordre de visite) + la route.
 */
export async function optimizeTrip(stops: Stop[]): Promise<{ order: number[]; route: RouteResult }> {
  if (stops.length === 0) return { order: [], route: emptyRoute(true) }
  const pts = [DEPOT, ...stops]
  const url =
    `${OSRM}/trip/v1/driving/${coordsParam(pts)}` +
    `?source=first&roundtrip=true&geometries=geojson&overview=full`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('osrm')
    const data = (await res.json()) as TripResponse
    if (data.code !== 'Ok') throw new Error('osrm')
    const wp = data.waypoints
    const order = stops
      .map((_, i) => i)
      .sort((a, b) => wp[a + 1].waypoint_index - wp[b + 1].waypoint_index)
    const trip = data.trips[0]
    return {
      order,
      route: {
        km: trip.distance / 1000,
        min: trip.duration / 60,
        geometry: toLatLngPath(trip.geometry.coordinates),
        optimized: true,
        approximate: false,
      },
    }
  } catch {
    return { order: stops.map((_, i) => i), route: fallbackRoute(stops) }
  }
}

/** Calcule km/min/tracé sur l'ordre DONNÉ (sans réoptimiser). Boucle dépôt -> arrêts -> dépôt. */
export async function computeRoute(stops: Stop[]): Promise<RouteResult> {
  if (stops.length === 0) return emptyRoute(false)
  const pts = [DEPOT, ...stops, DEPOT]
  const url = `${OSRM}/route/v1/driving/${coordsParam(pts)}?geometries=geojson&overview=full`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('osrm')
    const data = (await res.json()) as RouteResponse
    if (data.code !== 'Ok') throw new Error('osrm')
    const r = data.routes[0]
    return {
      km: r.distance / 1000,
      min: r.duration / 60,
      geometry: toLatLngPath(r.geometry.coordinates),
      optimized: false,
      approximate: false,
    }
  } catch {
    return fallbackRoute(stops)
  }
}
