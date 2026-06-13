import type { DriverConfig, LatLng } from '../types'

export const DEPOT: LatLng & { id: string; ville: string } = {
  id: 'depot',
  ville: 'Dépôt',
  lat: 48.816035,
  lng: 2.289012,
}

/** Chauffeurs par défaut (graine de l'état). Les ids correspondent aux SEED_STOPS. */
export const DEFAULT_DRIVERS: DriverConfig[] = [
  { id: 'karim', nom: 'Karim', colorIndex: 0 },
  { id: 'lea', nom: 'Léa', colorIndex: 1 },
  { id: 'sofiane', nom: 'Sofiane', colorIndex: 2 },
]
