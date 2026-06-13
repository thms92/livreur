import type { Driver, LatLng } from '../types'

export const DEPOT: LatLng & { id: string; ville: string } = {
  id: 'depot',
  ville: 'Dépôt',
  lat: 48.816035,
  lng: 2.289012,
}

export const DRIVERS: Driver[] = [
  { id: 'karim',   nom: 'Karim',   couleur: 'var(--c-karim)',   couleurHex: '#2f6df0', center: { lat: 48.8242, lng: 2.2747 } },
  { id: 'lea',     nom: 'Léa',     couleur: 'var(--c-lea)',     couleurHex: '#e0892a', center: { lat: 48.8047, lng: 2.2984 } },
  { id: 'sofiane', nom: 'Sofiane', couleur: 'var(--c-sofiane)', couleurHex: '#2f9e54', center: { lat: 48.7779, lng: 2.2804 } },
]
