export type DriverId = 'karim' | 'lea' | 'sofiane'
export type ScreenId = 'dispatch' | 'driver'
export type Theme = 'light' | 'dark'

export interface LatLng {
  lat: number
  lng: number
}

export interface Stop {
  id: string
  driver: DriverId | null
  order?: number
  label: string
  ville: string
  lat: number
  lng: number
}

export interface Driver {
  id: DriverId
  nom: string
  couleur: string
  couleurHex: string
  center: LatLng
}

export interface RouteResult {
  stops: Stop[]
  km: string
  min: string
}

export type Routes = Record<DriverId, RouteResult>

export interface Suggestion {
  id: string
  label: string
  ville: string
  lat: number
  lng: number
}
