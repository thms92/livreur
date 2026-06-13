import type { Driver, DriverId, Routes, Stop } from '../types'
import { DEPOT } from '../data/drivers'
import { dist, pathLen } from './geometry'

const KM_PER_UNIT = 0.0294
const MIN_PER_KM = 2.3
const STOP_MIN = 4

export interface RouteOptimizer {
  dispatch(stops: Stop[], drivers: Driver[]): Routes
}

function nearestDriver(stop: Stop, drivers: Driver[]): DriverId {
  let best = drivers[0].id
  let bd = Infinity
  for (const dr of drivers) {
    const dd = dist(stop, dr.center)
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
    const prev = i === 0 ? DEPOT : route[i - 1]
    const next = i === route.length ? null : route[i]
    const c = next ? dist(prev, stop) + dist(stop, next) - dist(prev, next) : dist(prev, stop)
    if (c < bestC) {
      bestC = c
      bestI = i
    }
  }
  return bestI
}

/** Stub : reproduit dispatchStops(). À remplacer par le vrai service d'optimisation. */
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
      const km = pathLen([DEPOT, ...arr]) * KM_PER_UNIT
      const min = Math.round(km * MIN_PER_KM + arr.length * STOP_MIN)
      result[dr.id] = { stops: arr, km: km.toFixed(1), min: String(min) }
    })
    return result
  }
}
