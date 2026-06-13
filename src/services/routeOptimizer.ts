import type { Driver, DriverId, LatLng, Routes, Stop } from '../types'
import { DEPOT } from '../data/drivers'
import { haversine, routeLengthKm } from './geo'

const MIN_PER_KM = 2.3
const STOP_MIN = 4

export interface RouteOptimizer {
  dispatch(stops: Stop[], drivers: Driver[]): Routes
}

function nearestDriver(stop: LatLng, drivers: Driver[]): DriverId {
  let best = drivers[0].id
  let bd = Infinity
  for (const dr of drivers) {
    const dd = haversine(stop, dr.center)
    if (dd < bd) {
      bd = dd
      best = dr.id
    }
  }
  return best
}

function cheapestInsert(route: Stop[], stop: Stop): number {
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

/** Heuristique (stub) : zone la plus proche + insertion au moindre coût, distances réelles. */
export class StubOptimizer implements RouteOptimizer {
  dispatch(stops: Stop[], drivers: Driver[]): Routes {
    const routes = {} as Record<DriverId, Stop[]>
    drivers.forEach((dr) => {
      routes[dr.id] = stops
        .filter((s) => s.driver === dr.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .slice()
    })
    stops
      .filter((s) => !s.driver)
      .forEach((s) => {
        const id = nearestDriver(s, drivers)
        const idx = cheapestInsert(routes[id], s)
        routes[id].splice(idx, 0, s)
      })

    const result = {} as Routes
    drivers.forEach((dr) => {
      const arr = routes[dr.id]
      const km = routeLengthKm([DEPOT, ...arr])
      const min = Math.round(km * MIN_PER_KM + arr.length * STOP_MIN)
      result[dr.id] = { stops: arr, km: km.toFixed(1), min: String(min) }
    })
    return result
  }
}
