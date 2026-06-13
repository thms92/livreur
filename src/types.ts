export type DriverId = 'karim' | 'lea' | 'sofiane'
export type ScreenId = 'dispatch' | 'driver'
export type Theme = 'light' | 'dark'

export interface Point {
  x: number
  y: number
}

export interface Stop {
  id: string
  driver: DriverId | null
  order?: number
  ville: string
  adresse: string
  x: number
  y: number
}

export interface Driver {
  id: DriverId
  nom: string
  couleur: string
  couleurHex: string
  center: Point
}

export interface RouteResult {
  stops: Stop[]
  km: string
  min: string
}

export type Routes = Record<DriverId, RouteResult>

export interface GeocodeResult {
  ville: string
  adresse: string
  x: number
  y: number
}
