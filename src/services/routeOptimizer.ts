import type { Driver, DriverId, LatLng, Routes, Stop } from '../types'
import { DEPOT } from '../data/drivers'
import { haversine, routeLengthKm } from './geo'

const MIN_PER_KM = 2.3
const STOP_MIN = 4

function sortByOrder(stops: Stop[]): Stop[] {
  return stops.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function centroid(stops: LatLng[]): LatLng | null {
  if (!stops.length) return null
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length
  return { lat, lng }
}

export function cheapestInsertIndex(route: Stop[], stop: LatLng): number {
  let bestI = route.length
  let bestC = Infinity
  for (let i = 0; i <= route.length; i++) {
    const prev: LatLng = i === 0 ? DEPOT : route[i - 1]
    const next: LatLng | null = i === route.length ? null : route[i]
    const c = next
      ? haversine(prev, stop) + haversine(stop, next) - haversine(prev, next)
      : haversine(prev, stop)
    if (c < bestC) {
      bestC = c
      bestI = i
    }
  }
  return bestI
}

/** Groupe les arrêts par chauffeur (triés par order) et calcule les stats. */
export function buildRoutes(stops: Stop[], drivers: Driver[]): Routes {
  const result = {} as Routes
  drivers.forEach((dr) => {
    const arr = sortByOrder(stops.filter((s) => s.driver === dr.id))
    const km = routeLengthKm([DEPOT, ...arr])
    const min = Math.round(km * MIN_PER_KM + arr.length * STOP_MIN)
    result[dr.id] = { stops: arr, km: km.toFixed(1), min: String(min) }
  })
  return result
}

/** Affecte ou réaffecte un arrêt à un chauffeur (insertion moindre coût + réindex order). */
export function assignToDriver(stops: Stop[], stopId: string, driverId: DriverId | null): Stop[] {
  const target = stops.find((s) => s.id === stopId)
  if (!target) return stops
  if (driverId === null) {
    return stops.map((s) => (s.id === stopId ? { ...s, driver: null } : s))
  }
  const route = sortByOrder(stops.filter((s) => s.driver === driverId && s.id !== stopId))
  const idx = cheapestInsertIndex(route, target)
  route.splice(idx, 0, { ...target, driver: driverId })
  const orderMap = new Map(route.map((s, i) => [s.id, i]))
  return stops.map((s) => {
    if (s.id === stopId) return { ...s, driver: driverId, order: orderMap.get(s.id) }
    if (s.driver === driverId && orderMap.has(s.id)) return { ...s, order: orderMap.get(s.id) }
    return s
  })
}

/** Auto-remplissage : affecte les arrêts NON affectés au chauffeur dont le centroïde est le plus proche. */
export function autoAssign(stops: Stop[], drivers: Driver[]): Stop[] {
  const centers: Record<string, LatLng> = {}
  drivers.forEach((d) => {
    centers[d.id] = centroid(stops.filter((s) => s.driver === d.id)) ?? DEPOT
  })
  let out = stops
  for (const s of stops.filter((st) => !st.driver)) {
    let best = drivers[0]?.id
    let bd = Infinity
    for (const d of drivers) {
      const dd = haversine(s, centers[d.id])
      if (dd < bd) {
        bd = dd
        best = d.id
      }
    }
    if (best != null) out = assignToDriver(out, s.id, best)
  }
  return out
}
