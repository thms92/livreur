export type Theme = 'light' | 'dark'
export type Section = 'livreurs' | 'tournees' | 'chauffeurs' | 'historique'

export interface LatLng {
  lat: number
  lng: number
}

export interface Livreur {
  id: string
  nom: string
  prenom: string
  telephone: string
  colorIndex: number
}

/** Un arrêt-client d'une tournée (le dépôt n'est jamais stocké ici). */
export interface Stop {
  id: string
  label: string
  ville: string
  lat: number
  lng: number
  heure?: string // heure de livraison souhaitée, "HH:MM" (24h, heure locale FR)
}

export interface RouteResult {
  km: number
  min: number
  geometry: [number, number][] // polyligne [lat, lng]
  optimized: boolean // ordre venu d'OSRM /trip
  approximate: boolean // calcul de repli haversine (OSRM injoignable)
}

export interface Tournee {
  id: string
  livreurId: string
  date: string // "YYYY-MM-DD"
  stops: Stop[] // ordre = ordre de visite des clients
  route?: RouteResult
  departHeure?: string // heure de départ du dépôt, "HH:MM" (24h), saisie manuelle
  retourHeure?: string // heure de retour au dépôt, "HH:MM" (24h), saisie manuelle
  ordreManuel?: boolean // true = ordre figé manuellement ; sinon tri chronologique auto
}

export interface Suggestion {
  id: string
  label: string
  ville: string
  lat: number
  lng: number
}
