import type { LatLng } from '../types'

/** Entrepôt fixe : départ ET arrivée de toute tournée. Géocodé via la BAN. */
export const DEPOT: LatLng & { label: string; ville: string; codePostal: string } = {
  label: 'Letourville',
  ville: 'Boisville-la-Saint-Père',
  codePostal: '28150',
  lat: 48.312002,
  lng: 1.718473,
}
