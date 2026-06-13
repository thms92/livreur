export type DriverId = string
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

export interface DriverConfig {
  id: DriverId
  nom: string
  colorIndex: number
}

export interface Driver extends DriverConfig {
  couleur: string
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
