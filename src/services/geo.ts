import type { LatLng } from '../types'

const R = 6371 // rayon Terre en km

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function routeLengthKm(pts: LatLng[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += haversine(pts[i - 1], pts[i])
  return L
}
