export type Theme = 'light' | 'dark'
export type Section = 'livreurs' | 'tournees' | 'chauffeurs' | 'historique' | 'corbeille'

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
  // Marqueurs de corbeille. Un livreur supprimé n'est jamais effacé : il quitte les listes
  // et les sélecteurs, mais reste lisible pour nommer le livreur d'une tournée ancienne.
  deletedAt?: number
  deletedBy?: string
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
  optimized: boolean // ordre venu de Valhalla /optimized_route
  approximate: boolean // calcul de repli haversine (routeur injoignable)
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
  sansPeage?: boolean // true = itinéraire évitant les péages (défaut des nouvelles tournées)
  // Version détenue localement : renvoyée par le serveur à chaque lecture et à chaque
  // écriture acceptée, elle est réémise à l'écriture suivante pour armer le verrou
  // optimiste. Optionnelle : une tournée construite hors serveur (tests) n'en a pas,
  // et l'écriture passe alors sans contrôle, comme avant.
  version?: number
  // Marqueurs de corbeille : posés à la suppression, effacés à la restauration.
  deletedAt?: number
  deletedBy?: string
  // Attribution des écritures, pour savoir qui a fait quoi entre collègues.
  createdBy?: string
  updatedBy?: string
}

export interface Suggestion {
  id: string
  label: string
  ville: string
  lat: number
  lng: number
}
