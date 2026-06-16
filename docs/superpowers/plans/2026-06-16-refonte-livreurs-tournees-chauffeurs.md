# Refonte Livreurs · Tournées · Chauffeurs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruire l'app autour de 3 sections gestionnaire (Livreurs, Tournées, Chauffeurs), avec tournée = entité `{livreur, date, arrêts}`, routage routier réel OSRM (boucle depuis l'entrepôt) et stockage localStorage.

**Architecture:** React 19 + contexte unique `LivreurContext` (livreurs + tournées + actions CRUD, persistés en localStorage `livreur:v3:`). Un service `routing.ts` appelle OSRM `/trip` (ordre optimisé) et `/route` (ordre fixé), avec repli haversine hors-ligne. UI = barre latérale + 3 vues. On réutilise BAN autocomplete, palette `--c-1..8`, Leaflet ; on supprime l'ancien modèle Dispatcher/DriverView.

**Tech Stack:** TypeScript, React 19, Vite, Leaflet/react-leaflet, Vitest + Testing Library, OSRM public API, BAN (api-adresse.data.gouv.fr).

---

## File Structure

**Créés :**
- `src/data/depot.ts` — constante `DEPOT`.
- `src/services/routing.ts` — OSRM `/trip` + `/route` + repli haversine.
- `src/state/LivreurContext.tsx` — réécrit (livreurs + tournées + actions).
- `src/components/layout/Sidebar.tsx` — navigation 3 sections.
- `src/components/AddressAutocomplete.tsx` + `useAddressAutocomplete.ts` — déplacés depuis `Dispatcher/`.
- `src/components/Livreurs/LivreursSection.tsx`, `LivreurForm.tsx`, `LivreurList.tsx`.
- `src/components/Tournees/TourneesSection.tsx`, `TourneeList.tsx`, `TourneeEditor.tsx`, `StopList.tsx`.
- `src/components/Chauffeurs/ChauffeursSection.tsx`, `ChauffeurCard.tsx`.
- `src/components/map/TourneeMap.tsx` — carte d'une (ou plusieurs) tournée(s) à partir de `RouteResult.geometry`.

**Modifiés :**
- `src/types.ts` — nouveau modèle.
- `src/state/usePersistentState.ts` — préfixe `v3`.
- `src/components/map/BaseMap.tsx` — centre par défaut = dépôt ; retirer dépendance au modèle Driver.
- `src/components/map/pins.ts` — réutilisé (numberedIcon, depotIcon).
- `src/App.tsx` — coquille sidebar + routeur de section.
- `src/styles/app.css` — styles des 3 sections.

**Supprimés :**
- `src/components/Dispatcher/` (sauf AddressAutocomplete + hook déplacés), `src/components/DriverView/`, `src/components/map/DispatcherMap.tsx`, `src/components/map/PhoneMap.tsx`, `src/components/map/RouteLayer.tsx`.
- `src/services/routeOptimizer.ts` (+ test), `src/data/seed.ts`, `src/data/drivers.ts`.

---

## Task 1: Nouveau modèle de types

**Files:**
- Modify: `src/types.ts` (remplacement complet)

- [ ] **Step 1: Réécrire `src/types.ts`**

```ts
export type Theme = 'light' | 'dark'
export type Section = 'livreurs' | 'tournees' | 'chauffeurs'

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
}

export interface Suggestion {
  id: string
  label: string
  ville: string
  lat: number
  lng: number
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript (échecs attendus ailleurs)**

Run: `npx tsc -b --noEmit`
Expected: erreurs UNIQUEMENT dans les fichiers encore basés sur l'ancien modèle (drivers.ts, seed.ts, routeOptimizer.ts, LivreurContext.tsx, composants Dispatcher/DriverView/map). C'est normal : ils seront remplacés/supprimés dans les tâches suivantes. `types.ts` lui-même ne doit pas avoir d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: nouveau modèle de types (Livreur/Tournee/Stop/RouteResult)"
```

---

## Task 2: Constante dépôt

**Files:**
- Create: `src/data/depot.ts`

- [ ] **Step 1: Créer `src/data/depot.ts`**

```ts
import type { LatLng } from '../types'

/** Entrepôt fixe : départ ET arrivée de toute tournée. Géocodé via la BAN. */
export const DEPOT: LatLng & { label: string; ville: string; codePostal: string } = {
  label: 'Letourville',
  ville: 'Boisville-la-Saint-Père',
  codePostal: '28150',
  lat: 48.312002,
  lng: 1.718473,
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/depot.ts
git commit -m "feat: constante dépôt Letourville (Boisville-la-Saint-Père)"
```

---

## Task 3: Service de routage OSRM (`/trip` optimisé)

**Files:**
- Create: `src/services/routing.ts`
- Test: `src/services/routing.test.ts`

- [ ] **Step 1: Écrire le test `optimizeTrip` (succès + fallback)**

Créer `src/services/routing.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optimizeTrip, computeRoute } from './routing'
import type { Stop } from '../types'

const stops: Stop[] = [
  { id: 's1', label: 'A', ville: '', lat: 48.4, lng: 1.6 },
  { id: 's2', label: 'B', ville: '', lat: 48.2, lng: 1.9 },
]

function mockFetchOnce(json: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(json) }))
}

afterEach(() => vi.unstubAllGlobals())

describe('optimizeTrip', () => {
  it('renvoie l’ordre optimisé et la distance/durée depuis OSRM', async () => {
    // waypoints: [depot, s1, s2]. waypoint_index donne le rang dans la tournée.
    // depot=0, s2 visité avant s1 -> s2.waypoint_index=1, s1.waypoint_index=2
    mockFetchOnce({
      code: 'Ok',
      waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      trips: [{ distance: 47000, duration: 4320, geometry: { coordinates: [[1.7, 48.3], [1.9, 48.2]] } }],
    })
    const { order, route } = await optimizeTrip(stops)
    expect(order).toEqual([1, 0]) // s2 (index 1) puis s1 (index 0)
    expect(route.km).toBeCloseTo(47)
    expect(route.min).toBeCloseTo(72)
    expect(route.geometry).toEqual([[48.3, 1.7], [48.2, 1.9]]) // [lat,lng]
    expect(route.optimized).toBe(true)
    expect(route.approximate).toBe(false)
  })

  it('repli haversine si OSRM échoue (garde l’ordre donné)', async () => {
    mockFetchOnce({}, false)
    const { order, route } = await optimizeTrip(stops)
    expect(order).toEqual([0, 1])
    expect(route.approximate).toBe(true)
    expect(route.km).toBeGreaterThan(0)
    expect(route.min).toBeGreaterThan(0)
  })

  it('liste vide -> route nulle sans appel réseau', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { order, route } = await optimizeTrip([])
    expect(order).toEqual([])
    expect(route.km).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('computeRoute', () => {
  it('calcule km/min/tracé sur l’ordre donné via OSRM /route', async () => {
    mockFetchOnce({
      code: 'Ok',
      routes: [{ distance: 31000, duration: 3120, geometry: { coordinates: [[1.7, 48.3], [1.8, 48.25]] } }],
    })
    const route = await computeRoute(stops)
    expect(route.km).toBeCloseTo(31)
    expect(route.min).toBeCloseTo(52)
    expect(route.approximate).toBe(false)
  })

  it('repli haversine si OSRM échoue', async () => {
    mockFetchOnce({ code: 'NoRoute' })
    const route = await computeRoute(stops)
    expect(route.approximate).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/services/routing.test.ts`
Expected: FAIL (`routing.ts` n'existe pas / exports manquants).

- [ ] **Step 3: Implémenter `src/services/routing.ts`**

```ts
import type { LatLng, RouteResult, Stop } from '../types'
import { DEPOT } from '../data/depot'
import { routeLengthKm } from './geo'

const OSRM = 'https://router.project-osrm.org'
const AVG_KMH = 50 // vitesse moyenne pour estimer la durée en mode repli

function coordsParam(pts: LatLng[]): string {
  return pts.map((p) => `${p.lng},${p.lat}`).join(';')
}

function toLatLngPath(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng])
}

function emptyRoute(optimized: boolean): RouteResult {
  return { km: 0, min: 0, geometry: [[DEPOT.lat, DEPOT.lng]], optimized, approximate: false }
}

/** Repli hors-ligne : boucle dépôt -> arrêts -> dépôt, distance à vol d'oiseau. */
function fallbackRoute(stops: Stop[]): RouteResult {
  const loop: LatLng[] = [DEPOT, ...stops, DEPOT]
  const km = routeLengthKm(loop)
  return {
    km,
    min: (km / AVG_KMH) * 60,
    geometry: loop.map((p) => [p.lat, p.lng]),
    optimized: false,
    approximate: true,
  }
}

interface TripResponse {
  code: string
  waypoints: { waypoint_index: number }[]
  trips: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
}

interface RouteResponse {
  code: string
  routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
}

/**
 * Optimise l'ordre des arrêts (TSP) via OSRM /trip, boucle au départ du dépôt.
 * Renvoie l'ordre (indices dans `stops`, ordre de visite) + la route.
 */
export async function optimizeTrip(stops: Stop[]): Promise<{ order: number[]; route: RouteResult }> {
  if (stops.length === 0) return { order: [], route: emptyRoute(true) }
  const pts = [DEPOT, ...stops]
  const url =
    `${OSRM}/trip/v1/driving/${coordsParam(pts)}` +
    `?source=first&roundtrip=true&geometries=geojson&overview=full`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('osrm')
    const data = (await res.json()) as TripResponse
    if (data.code !== 'Ok') throw new Error('osrm')
    const wp = data.waypoints
    const order = stops
      .map((_, i) => i)
      .sort((a, b) => wp[a + 1].waypoint_index - wp[b + 1].waypoint_index)
    const trip = data.trips[0]
    return {
      order,
      route: {
        km: trip.distance / 1000,
        min: trip.duration / 60,
        geometry: toLatLngPath(trip.geometry.coordinates),
        optimized: true,
        approximate: false,
      },
    }
  } catch {
    return { order: stops.map((_, i) => i), route: fallbackRoute(stops) }
  }
}

/** Calcule km/min/tracé sur l'ordre DONNÉ (sans réoptimiser). Boucle dépôt -> arrêts -> dépôt. */
export async function computeRoute(stops: Stop[]): Promise<RouteResult> {
  if (stops.length === 0) return emptyRoute(false)
  const pts = [DEPOT, ...stops, DEPOT]
  const url = `${OSRM}/route/v1/driving/${coordsParam(pts)}?geometries=geojson&overview=full`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('osrm')
    const data = (await res.json()) as RouteResponse
    if (data.code !== 'Ok') throw new Error('osrm')
    const r = data.routes[0]
    return {
      km: r.distance / 1000,
      min: r.duration / 60,
      geometry: toLatLngPath(r.geometry.coordinates),
      optimized: false,
      approximate: false,
    }
  } catch {
    return fallbackRoute(stops)
  }
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `npx vitest run src/services/routing.test.ts`
Expected: PASS (8 assertions / 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/routing.ts src/services/routing.test.ts
git commit -m "feat: service routing OSRM /trip + /route + repli haversine"
```

---

## Task 4: Bump du préfixe de persistance (v3)

**Files:**
- Modify: `src/state/usePersistentState.ts:3`

- [ ] **Step 1: Changer le préfixe**

Remplacer la ligne :
```ts
const PREFIX = 'livreur:v2:'
```
par :
```ts
const PREFIX = 'livreur:v3:'
```

- [ ] **Step 2: Commit**

```bash
git add src/state/usePersistentState.ts
git commit -m "chore: préfixe localStorage v3 (rupture propre, démarrage à vide)"
```

---

## Task 5: Déplacer l'autocomplétion d'adresse hors de Dispatcher

**Files:**
- Create: `src/components/AddressAutocomplete.tsx` (copie depuis `Dispatcher/`)
- Create: `src/components/useAddressAutocomplete.ts` (copie depuis `Dispatcher/`)

- [ ] **Step 1: Copier le hook**

Copier le contenu de `src/components/Dispatcher/useAddressAutocomplete.ts` vers `src/components/useAddressAutocomplete.ts` **sans modification** (les imports `../../services/...` et `../../types` restent corrects depuis `components/`).

- [ ] **Step 2: Copier le composant en corrigeant les imports**

Créer `src/components/AddressAutocomplete.tsx` avec le contenu de `src/components/Dispatcher/AddressAutocomplete.tsx`, en ajustant les chemins d'import (un niveau de moins) :

```ts
import { useId, useState } from 'react'
import type { AddressProvider } from '../services/addressProvider'
import type { Suggestion } from '../types'
import { useAddressAutocomplete } from './useAddressAutocomplete'
import { IcoPin, IcoPlus } from './icons'
```

Le reste du fichier est identique à l'original.

- [ ] **Step 3: Vérifier la compilation du nouveau fichier**

Run: `npx tsc -b --noEmit 2>&1 | grep -i addressautocomplete || echo "OK: pas d'erreur sur AddressAutocomplete"`
Expected: `OK: pas d'erreur sur AddressAutocomplete` (les autres erreurs legacy subsistent).

- [ ] **Step 4: Commit**

```bash
git add src/components/AddressAutocomplete.tsx src/components/useAddressAutocomplete.ts
git commit -m "refactor: déplacer AddressAutocomplete au niveau components/"
```

---

## Task 6: Réécrire LivreurContext — livreurs (CRUD)

**Files:**
- Modify: `src/state/LivreurContext.tsx` (remplacement complet)
- Test: `src/state/LivreurContext.test.tsx` (remplacement complet)

> Cette tâche pose le socle du contexte (état + livreurs). Les tournées sont ajoutées en Task 7.

- [ ] **Step 1: Écrire le test des livreurs**

Remplacer `src/state/LivreurContext.test.tsx` par :

```tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <LivreurProvider>{children}</LivreurProvider>

afterEach(() => localStorage.clear())

describe('LivreurContext — livreurs', () => {
  it('démarre à vide', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    expect(result.current.livreurs).toEqual([])
    expect(result.current.tournees).toEqual([])
  })

  it('ajoute un livreur avec une couleur auto (index 0 puis 1)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '0612345678' }))
    act(() => result.current.addLivreur({ nom: 'Martin', prenom: 'Léa', telephone: '' }))
    expect(result.current.livreurs).toHaveLength(2)
    expect(result.current.livreurs[0]).toMatchObject({ nom: 'Benali', prenom: 'Karim', colorIndex: 0 })
    expect(result.current.livreurs[1].colorIndex).toBe(1)
    expect(result.current.livreurs[0].couleur).toBe('var(--c-1)')
  })

  it('modifie un livreur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '' }))
    const id = result.current.livreurs[0].id
    act(() => result.current.updateLivreur(id, { telephone: '0700000000' }))
    expect(result.current.livreurs[0].telephone).toBe('0700000000')
  })

  it('supprime un livreur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '' }))
    const id = result.current.livreurs[0].id
    act(() => result.current.removeLivreur(id))
    expect(result.current.livreurs).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: FAIL (l'ancien contexte n'a ni `livreurs` ni `addLivreur`).

- [ ] **Step 3: Réécrire `src/state/LivreurContext.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Livreur, Section, Stop, Suggestion, Theme, Tournee } from '../types'
import { driverColor, nextColorIndex } from '../data/palette'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { makeStopId } from '../services/stopId'
import { computeRoute, optimizeTrip } from '../services/routing'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()

export interface LivreurInput {
  nom: string
  prenom: string
  telephone: string
}

export type LivreurWithColor = Livreur & { couleur: string }

export interface LivreurState {
  theme: Theme
  section: Section
  livreurs: LivreurWithColor[]
  tournees: Tournee[]
  provider: AddressProvider
  reduceMotion: boolean
  toggleTheme: () => void
  setSection: (s: Section) => void
  // livreurs
  addLivreur: (input: LivreurInput) => void
  updateLivreur: (id: string, patch: Partial<LivreurInput>) => void
  removeLivreur: (id: string) => void
  // tournées (Task 7)
  addTournee: (input: { livreurId: string; date: string }) => string
  updateTournee: (id: string, patch: { livreurId?: string; date?: string }) => void
  removeTournee: (id: string) => void
  addStopToTournee: (tourneeId: string, s: Suggestion) => void
  removeStopFromTournee: (tourneeId: string, stopId: string) => void
  reorderStops: (tourneeId: string, from: number, to: number) => void
  optimizeTournee: (tourneeId: string) => Promise<void>
  refreshRoute: (tourneeId: string) => Promise<void>
}

const Ctx = createContext<LivreurState | null>(null)

export function useLivreur(): LivreurState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLivreur doit être utilisé dans <LivreurProvider>')
  return v
}

export function LivreurProvider({
  children,
  provider = defaultProvider,
}: {
  children: ReactNode
  provider?: AddressProvider
}) {
  const [theme, setTheme] = usePersistentState<Theme>('theme', 'light')
  const [section, setSection] = usePersistentState<Section>('section', 'tournees')
  const [livreursRaw, setLivreurs] = usePersistentState<Livreur[]>('livreurs', [])
  const [tournees, setTournees] = usePersistentState<Tournee[]>('tournees', [])

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const livreurs = useMemo<LivreurWithColor[]>(
    () => livreursRaw.map((l) => ({ ...l, couleur: driverColor(l.colorIndex) })),
    [livreursRaw],
  )

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [setTheme])

  const addLivreur = useCallback(
    (input: LivreurInput) => {
      const nom = input.nom.trim()
      const prenom = input.prenom.trim()
      if (!nom || !prenom) return
      setLivreurs((prev) => [
        ...prev,
        {
          id: makeStopId(),
          nom,
          prenom,
          telephone: input.telephone.trim(),
          colorIndex: nextColorIndex(prev.map((l) => l.colorIndex)),
        },
      ])
    },
    [setLivreurs],
  )

  const updateLivreur = useCallback(
    (id: string, patch: Partial<LivreurInput>) => {
      setLivreurs((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                ...(patch.nom !== undefined ? { nom: patch.nom.trim() } : {}),
                ...(patch.prenom !== undefined ? { prenom: patch.prenom.trim() } : {}),
                ...(patch.telephone !== undefined ? { telephone: patch.telephone.trim() } : {}),
              }
            : l,
        ),
      )
    },
    [setLivreurs],
  )

  const removeLivreur = useCallback(
    (id: string) => {
      setLivreurs((prev) => prev.filter((l) => l.id !== id))
      setTournees((prev) => prev.filter((t) => t.livreurId !== id))
    },
    [setLivreurs, setTournees],
  )

  // --- Tournées : implémentées en Task 7 (placeholders remplacés là-bas) ---
  const addTournee = useCallback(
    (input: { livreurId: string; date: string }) => {
      const id = makeStopId()
      setTournees((prev) => [...prev, { id, livreurId: input.livreurId, date: input.date, stops: [] }])
      return id
    },
    [setTournees],
  )

  const updateTournee = useCallback(
    (id: string, patch: { livreurId?: string; date?: string }) => {
      setTournees((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    },
    [setTournees],
  )

  const removeTournee = useCallback(
    (id: string) => setTournees((prev) => prev.filter((t) => t.id !== id)),
    [setTournees],
  )

  const addStopToTournee = useCallback(
    (tourneeId: string, s: Suggestion) => {
      const stop: Stop = { id: makeStopId(), label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }
      setTournees((prev) =>
        prev.map((t) => (t.id === tourneeId ? { ...t, stops: [...t.stops, stop], route: undefined } : t)),
      )
    },
    [setTournees],
  )

  const removeStopFromTournee = useCallback(
    (tourneeId: string, stopId: string) => {
      setTournees((prev) =>
        prev.map((t) =>
          t.id === tourneeId ? { ...t, stops: t.stops.filter((s) => s.id !== stopId), route: undefined } : t,
        ),
      )
    },
    [setTournees],
  )

  const reorderStops = useCallback(
    (tourneeId: string, from: number, to: number) => {
      setTournees((prev) =>
        prev.map((t) => {
          if (t.id !== tourneeId) return t
          const stops = t.stops.slice()
          const [moved] = stops.splice(from, 1)
          stops.splice(to, 0, moved)
          return { ...t, stops, route: undefined }
        }),
      )
    },
    [setTournees],
  )

  const optimizeTournee = useCallback(
    async (tourneeId: string) => {
      const t = tournees.find((x) => x.id === tourneeId)
      if (!t) return
      const { order, route } = await optimizeTrip(t.stops)
      const stops = order.map((i) => t.stops[i])
      setTournees((prev) => prev.map((x) => (x.id === tourneeId ? { ...x, stops, route } : x)))
    },
    [tournees, setTournees],
  )

  const refreshRoute = useCallback(
    async (tourneeId: string) => {
      const t = tournees.find((x) => x.id === tourneeId)
      if (!t) return
      const route = await computeRoute(t.stops)
      setTournees((prev) => prev.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
    },
    [tournees, setTournees],
  )

  const value: LivreurState = {
    theme,
    section,
    livreurs,
    tournees,
    provider,
    reduceMotion: !!reduceMotion,
    toggleTheme,
    setSection,
    addLivreur,
    updateLivreur,
    removeLivreur,
    addTournee,
    updateTournee,
    removeTournee,
    addStopToTournee,
    removeStopFromTournee,
    reorderStops,
    optimizeTournee,
    refreshRoute,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
```

- [ ] **Step 4: Lancer le test des livreurs**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/LivreurContext.tsx src/state/LivreurContext.test.tsx
git commit -m "feat: LivreurContext réécrit — livreurs CRUD + actions tournées"
```

---

## Task 7: Tests des tournées dans le contexte

**Files:**
- Modify: `src/state/LivreurContext.test.tsx` (ajout d'un bloc)

> L'implémentation des tournées a déjà été écrite en Task 6 ; ici on la couvre par des tests, dont l'optimisation (routing mocké).

- [ ] **Step 1: Ajouter le bloc de tests tournées**

Ajouter en haut du fichier de test (après les imports existants) le mock du routing :

```tsx
import { vi } from 'vitest'

vi.mock('../services/routing', () => ({
  optimizeTrip: vi.fn(async (stops: { id: string }[]) => ({
    order: stops.map((_, i) => stops.length - 1 - i), // inverse l'ordre, déterministe
    route: { km: 10, min: 15, geometry: [], optimized: true, approximate: false },
  })),
  computeRoute: vi.fn(async () => ({ km: 5, min: 8, geometry: [], optimized: false, approximate: false })),
}))
```

Puis ajouter ce bloc `describe` à la fin du fichier :

```tsx
const sugg = (label: string, lat: number, lng: number) => ({ id: label, label, ville: 'V', lat, lng })

describe('LivreurContext — tournées', () => {
  it('crée une tournée pour un livreur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    const lid = result.current.livreurs[0].id
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: lid, date: '2026-06-16' }) })
    expect(result.current.tournees).toHaveLength(1)
    expect(result.current.tournees[0]).toMatchObject({ id: tid, livreurId: lid, date: '2026-06-16', stops: [] })
  })

  it('ajoute / supprime des arrêts (route invalidée)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-16' }) })
    act(() => result.current.addStopToTournee(tid, sugg('A', 48.4, 1.6)))
    act(() => result.current.addStopToTournee(tid, sugg('B', 48.2, 1.9)))
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['A', 'B'])
    const sid = result.current.tournees[0].stops[0].id
    act(() => result.current.removeStopFromTournee(tid, sid))
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['B'])
  })

  it('réordonne les arrêts manuellement', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-16' }) })
    act(() => result.current.addStopToTournee(tid, sugg('A', 48.4, 1.6)))
    act(() => result.current.addStopToTournee(tid, sugg('B', 48.2, 1.9)))
    act(() => result.current.addStopToTournee(tid, sugg('C', 48.1, 2.0)))
    act(() => result.current.reorderStops(tid, 0, 2)) // A -> fin
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['B', 'C', 'A'])
  })

  it('optimise la tournée via le service (ordre + route)', async () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-16' }) })
    act(() => result.current.addStopToTournee(tid, sugg('A', 48.4, 1.6)))
    act(() => result.current.addStopToTournee(tid, sugg('B', 48.2, 1.9)))
    await act(async () => { await result.current.optimizeTournee(tid) })
    // mock inverse l'ordre
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['B', 'A'])
    expect(result.current.tournees[0].route).toMatchObject({ km: 10, min: 15, optimized: true })
  })

  it('supprimer un livreur supprime ses tournées (cascade)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    const lid = result.current.livreurs[0].id
    act(() => { result.current.addTournee({ livreurId: lid, date: '2026-06-16' }) })
    act(() => result.current.removeLivreur(lid))
    expect(result.current.tournees).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer toute la suite du contexte**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: PASS (livreurs + tournées).

- [ ] **Step 3: Commit**

```bash
git add src/state/LivreurContext.test.tsx
git commit -m "test: couverture tournées du contexte (CRUD, reorder, optimize, cascade)"
```

---

## Task 8: Supprimer l'ancien modèle (Dispatcher, DriverView, optimizer, seed, drivers)

**Files:**
- Delete: dossiers/fichiers legacy

- [ ] **Step 1: Supprimer les fichiers obsolètes**

```bash
git rm -r src/components/Dispatcher src/components/DriverView
git rm src/components/map/DispatcherMap.tsx src/components/map/PhoneMap.tsx src/components/map/RouteLayer.tsx
git rm src/services/routeOptimizer.ts src/services/routeOptimizer.test.ts
git rm src/data/seed.ts src/data/drivers.ts
```

- [ ] **Step 2: Corriger `BaseMap` (retirer la dépendance au dépôt Paris)**

Dans `src/components/map/BaseMap.tsx`, remplacer le centre par défaut. Ajouter l'import :
```ts
import { DEPOT } from '../../data/depot'
```
et remplacer :
```ts
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [48.81, 2.29]
```
par :
```ts
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [DEPOT.lat, DEPOT.lng]
```

- [ ] **Step 3: Vérifier qu'il ne reste pas d'import cassé vers les fichiers supprimés**

Run: `grep -rn "Dispatcher\|DriverView\|routeOptimizer\|data/seed\|data/drivers\|RouteLayer\|DispatcherMap\|PhoneMap" src --include=*.ts --include=*.tsx | grep -v "\.test\." || echo "OK: aucune référence legacy"`
Expected: `OK: aucune référence legacy` (App.tsx sera réécrit en Task 13 ; s'il référence encore Dispatcher ici, c'est attendu et corrigé là-bas — mais on supprime ces refs au Step 4).

- [ ] **Step 4: Neutraliser temporairement App.tsx pour compiler**

Remplacer `src/App.tsx` par un placeholder minimal (sera étoffé en Task 13) :

```tsx
import { LivreurProvider } from './state/LivreurContext'

export function App() {
  return (
    <LivreurProvider>
      <div className="app" />
    </LivreurProvider>
  )
}
```

- [ ] **Step 5: Compiler**

Run: `npx tsc -b --noEmit`
Expected: PASS (plus aucune erreur ; tout le code legacy a disparu).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: supprimer l'ancien modèle Dispatcher/DriverView/optimizer/seed"
```

---

## Task 9: Barre latérale de navigation

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Test: `src/components/layout/Sidebar.test.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LivreurProvider, useLivreur } from '../../state/LivreurContext'
import { Sidebar } from './Sidebar'

afterEach(() => localStorage.clear())

function Probe() {
  const { section } = useLivreur()
  return <span data-testid="section">{section}</span>
}

describe('Sidebar', () => {
  it('affiche les 3 sections et change la section active au clic', async () => {
    render(
      <LivreurProvider>
        <Sidebar />
        <Probe />
      </LivreurProvider>,
    )
    expect(screen.getByRole('button', { name: /Livreurs/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chauffeurs/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Livreurs/ }))
    expect(screen.getByTestId('section')).toHaveTextContent('livreurs')
  })
})
```

- [ ] **Step 2: Voir le test échouer**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx`
Expected: FAIL (`Sidebar` n'existe pas).

- [ ] **Step 3: Implémenter `src/components/layout/Sidebar.tsx`**

```tsx
import type { Section } from '../../types'
import { useLivreur } from '../../state/LivreurContext'
import { IcoMoon, IcoSun } from '../icons'

const ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'livreurs', label: 'Livreurs', icon: '👤' },
  { id: 'tournees', label: 'Tournées', icon: '🗺️' },
  { id: 'chauffeurs', label: 'Chauffeurs', icon: '📋' },
]

export function Sidebar() {
  const { section, setSection, theme, toggleTheme } = useLivreur()
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        Livreur
      </div>
      <ul className="sidebar-nav">
        {ITEMS.map((it) => (
          <li key={it.id}>
            <button
              className={'nav-item' + (section === it.id ? ' active' : '')}
              onClick={() => setSection(it.id)}
            >
              <span aria-hidden="true">{it.icon}</span> {it.label}
            </button>
          </li>
        ))}
      </ul>
      <button className="icon-btn sidebar-theme" onClick={toggleTheme} aria-label="Basculer le thème">
        {theme === 'light' ? <IcoMoon /> : <IcoSun />}
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: Voir le test passer**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx
git commit -m "feat: barre latérale de navigation (3 sections + thème)"
```

---

## Task 10: Section Livreurs (formulaire + liste)

**Files:**
- Create: `src/components/Livreurs/LivreurForm.tsx`
- Create: `src/components/Livreurs/LivreurList.tsx`
- Create: `src/components/Livreurs/LivreursSection.tsx`
- Test: `src/components/Livreurs/LivreursSection.test.tsx`

- [ ] **Step 1: Écrire le test de la section**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LivreurProvider } from '../../state/LivreurContext'
import { LivreursSection } from './LivreursSection'

afterEach(() => localStorage.clear())

const renderSection = () =>
  render(
    <LivreurProvider>
      <LivreursSection />
    </LivreurProvider>,
  )

describe('LivreursSection', () => {
  it('ajoute un livreur via le formulaire', async () => {
    renderSection()
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.type(screen.getByLabelText('Téléphone'), '0612345678')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
    expect(screen.getByText('0612345678')).toBeInTheDocument()
  })

  it('n’ajoute pas si nom ou prénom manquant', async () => {
    renderSection()
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.queryByText(/Benali/)).not.toBeInTheDocument()
  })

  it('supprime un livreur', async () => {
    renderSection()
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await userEvent.click(screen.getByRole('button', { name: /Supprimer/ }))
    expect(screen.queryByText('Karim Benali')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Voir le test échouer**

Run: `npx vitest run src/components/Livreurs/LivreursSection.test.tsx`
Expected: FAIL (composants absents).

- [ ] **Step 3: Implémenter `LivreurForm.tsx`**

```tsx
import { useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'

export function LivreurForm() {
  const { addLivreur } = useLivreur()
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [telephone, setTelephone] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !prenom.trim()) return
    addLivreur({ nom, prenom, telephone })
    setNom('')
    setPrenom('')
    setTelephone('')
  }

  return (
    <form className="livreur-form" onSubmit={submit}>
      <label className="field">
        <span>Nom</span>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <label className="field">
        <span>Prénom</span>
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
      </label>
      <label className="field">
        <span>Téléphone</span>
        <input
          type="tel"
          inputMode="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary">
        Enregistrer
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Implémenter `LivreurList.tsx`**

```tsx
import { useLivreur } from '../../state/LivreurContext'

export function LivreurList() {
  const { livreurs, tournees, removeLivreur } = useLivreur()

  if (!livreurs.length) {
    return <p className="empty">Aucun livreur. Ajoutez-en un avec le formulaire.</p>
  }

  function onRemove(id: string, nomComplet: string) {
    const count = tournees.filter((t) => t.livreurId === id).length
    const msg = count
      ? `Supprimer ${nomComplet} et ses ${count} tournée(s) ?`
      : `Supprimer ${nomComplet} ?`
    if (confirm(msg)) removeLivreur(id)
  }

  return (
    <ul className="livreur-list">
      {livreurs.map((l) => {
        const nomComplet = `${l.prenom} ${l.nom}`
        const count = tournees.filter((t) => t.livreurId === l.id).length
        return (
          <li key={l.id} className="livreur-row">
            <span className="dot" style={{ background: l.couleur }} />
            <span className="livreur-name">{nomComplet}</span>
            {l.telephone && <span className="livreur-tel">{l.telephone}</span>}
            <span className="livreur-count">{count} tournée(s)</span>
            <button className="btn-danger" onClick={() => onRemove(l.id, nomComplet)}>
              Supprimer
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 5: Implémenter `LivreursSection.tsx`**

```tsx
import { LivreurForm } from './LivreurForm'
import { LivreurList } from './LivreurList'

export function LivreursSection() {
  return (
    <section className="section">
      <h1>Livreurs</h1>
      <LivreurForm />
      <LivreurList />
    </section>
  )
}
```

- [ ] **Step 6: Voir le test passer**

Run: `npx vitest run src/components/Livreurs/LivreursSection.test.tsx`
Expected: PASS.

> Note : `confirm` est disponible dans jsdom et renvoie `true` par défaut sous Testing Library ; le test « supprime » passe donc sans stub. Si l'environnement renvoyait `false`, ajouter `vi.stubGlobal('confirm', () => true)` dans le test.

- [ ] **Step 7: Commit**

```bash
git add src/components/Livreurs
git commit -m "feat: section Livreurs (formulaire Nom/Prénom/Téléphone + liste + suppression)"
```

---

## Task 11: Carte d'une tournée (`TourneeMap`)

**Files:**
- Create: `src/components/map/TourneeMap.tsx`

> Composant carte basé sur `RouteResult.geometry` (tracé OSRM) + marqueurs numérotés + dépôt. Pas de test unitaire dédié (react-leaflet est lourd à monter en jsdom) ; couvert indirectement par le smoke test (Task 14, react-leaflet mocké).

- [ ] **Step 1: Implémenter `src/components/map/TourneeMap.tsx`**

```tsx
import { Marker, Polyline } from 'react-leaflet'
import type { LatLng, RouteResult, Stop } from '../../types'
import { DEPOT } from '../../data/depot'
import { BaseMap } from './BaseMap'
import { depotIcon, numberedIcon } from './pins'

export interface TourneeOnMap {
  id: string
  couleur: string
  stops: Stop[]
  route?: RouteResult
}

interface Props {
  tournees: TourneeOnMap[]
}

export function TourneeMap({ tournees }: Props) {
  const points: LatLng[] = [
    { lat: DEPOT.lat, lng: DEPOT.lng },
    ...tournees.flatMap((t) => t.stops),
  ]
  return (
    <div className="map-wrap">
      <BaseMap points={points}>
        <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} />
        {tournees.map((t) => {
          const line: [number, number][] =
            t.route && t.route.geometry.length > 1
              ? t.route.geometry
              : [[DEPOT.lat, DEPOT.lng], ...t.stops.map((s) => [s.lat, s.lng] as [number, number]), [DEPOT.lat, DEPOT.lng]]
          return (
            <span key={t.id}>
              <Polyline positions={line} pathOptions={{ color: t.couleur, weight: 4, opacity: 0.9 }} />
              {t.stops.map((s, i) => (
                <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(t.couleur, i + 1)} />
              ))}
            </span>
          )
        })}
      </BaseMap>
    </div>
  )
}
```

- [ ] **Step 2: Compiler**

Run: `npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/map/TourneeMap.tsx
git commit -m "feat: TourneeMap (tracé OSRM + marqueurs numérotés + dépôt)"
```

---

## Task 12: Section Tournées (liste + éditeur + arrêts drag & drop)

**Files:**
- Create: `src/components/Tournees/StopList.tsx`
- Create: `src/components/Tournees/TourneeEditor.tsx`
- Create: `src/components/Tournees/TourneeList.tsx`
- Create: `src/components/Tournees/TourneesSection.tsx`
- Test: `src/components/Tournees/StopList.test.tsx`
- Test: `src/components/Tournees/TourneesSection.test.tsx`

- [ ] **Step 1: Écrire le test de `StopList` (réordonnancement + suppression)**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StopList } from './StopList'
import type { Stop } from '../../types'

const stops: Stop[] = [
  { id: 'a', label: 'Arrêt A', ville: 'V', lat: 48.4, lng: 1.6 },
  { id: 'b', label: 'Arrêt B', ville: 'V', lat: 48.2, lng: 1.9 },
]

describe('StopList', () => {
  it('affiche départ/retour entrepôt verrouillés + arrêts numérotés', () => {
    render(<StopList stops={stops} onRemove={() => {}} onReorder={() => {}} />)
    expect(screen.getAllByText(/Letourville/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Arrêt A')).toBeInTheDocument()
    expect(screen.getByText('Arrêt B')).toBeInTheDocument()
  })

  it('supprime un arrêt', async () => {
    const onRemove = vi.fn()
    render(<StopList stops={stops} onRemove={onRemove} onReorder={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Arrêt A' }))
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('réordonne par drag & drop natif (onReorder avec from/to)', () => {
    const onReorder = vi.fn()
    render(<StopList stops={stops} onRemove={() => {}} onReorder={onReorder} />)
    const items = screen.getAllByRole('listitem')
    const dt = { getData: () => '0', setData: vi.fn(), dropEffect: '', effectAllowed: '' }
    // glisse l'arrêt 0 sur l'arrêt 1
    fireDrag(items[0], items[1], dt)
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })
})

import { fireEvent } from '@testing-library/react'
function fireDrag(from: HTMLElement, to: HTMLElement, dataTransfer: unknown) {
  fireEvent.dragStart(from, { dataTransfer })
  fireEvent.dragOver(to, { dataTransfer })
  fireEvent.drop(to, { dataTransfer })
}
```

- [ ] **Step 2: Voir le test échouer**

Run: `npx vitest run src/components/Tournees/StopList.test.tsx`
Expected: FAIL (`StopList` absent).

- [ ] **Step 3: Implémenter `StopList.tsx` (drag & drop natif)**

```tsx
import { useState } from 'react'
import type { Stop } from '../../types'
import { DEPOT } from '../../data/depot'

interface Props {
  stops: Stop[]
  onRemove: (stopId: string) => void
  onReorder: (from: number, to: number) => void
}

export function StopList({ stops, onRemove, onReorder }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  return (
    <ol className="stop-list">
      <li className="stop-row depot">
        <span className="stop-ico">🏭</span>
        <span className="stop-label">Départ — {DEPOT.label}</span>
        <span className="stop-ville">{DEPOT.ville}</span>
      </li>

      {stops.map((s, i) => (
        <li
          key={s.id}
          className={'stop-row' + (dragIndex === i ? ' dragging' : '')}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
            setDragIndex(null)
          }}
          onDragEnd={() => setDragIndex(null)}
        >
          <span className="stop-handle" aria-hidden="true">⋮⋮</span>
          <span className="stop-num">{i + 1}</span>
          <span className="stop-label">{s.label}</span>
          <span className="stop-ville">{s.ville}</span>
          <button className="stop-remove" aria-label={`Retirer ${s.label}`} onClick={() => onRemove(s.id)}>
            ✕
          </button>
        </li>
      ))}

      <li className="stop-row depot">
        <span className="stop-ico">🏭</span>
        <span className="stop-label">Retour — {DEPOT.label}</span>
        <span className="stop-ville">{DEPOT.ville}</span>
      </li>
    </ol>
  )
}
```

- [ ] **Step 4: Voir le test de StopList passer**

Run: `npx vitest run src/components/Tournees/StopList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implémenter `TourneeEditor.tsx`**

```tsx
import { useEffect } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { AddressAutocomplete } from '../AddressAutocomplete'
import { TourneeMap } from '../map/TourneeMap'
import { StopList } from './StopList'

interface Props {
  tourneeId: string
  onClose: () => void
}

export function TourneeEditor({ tourneeId, onClose }: Props) {
  const {
    livreurs,
    tournees,
    provider,
    updateTournee,
    addStopToTournee,
    removeStopFromTournee,
    reorderStops,
    optimizeTournee,
    refreshRoute,
  } = useLivreur()

  const tournee = tournees.find((t) => t.id === tourneeId)
  const livreur = livreurs.find((l) => l.id === tournee?.livreurId)

  // (re)calcule la route quand l'ordre des arrêts change et qu'aucune route n'est en cache
  useEffect(() => {
    if (tournee && tournee.stops.length > 0 && !tournee.route) {
      refreshRoute(tournee.id)
    }
  }, [tournee, refreshRoute])

  if (!tournee) return null

  return (
    <div className="tournee-editor">
      <div className="editor-form">
        <div className="editor-head">
          <button className="btn-ghost" onClick={onClose}>← Retour</button>
          <div className="field">
            <span>Livreur</span>
            <select
              value={tournee.livreurId}
              onChange={(e) => updateTournee(tournee.id, { livreurId: e.target.value })}
            >
              {livreurs.map((l) => (
                <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span>Date</span>
            <input
              type="date"
              value={tournee.date}
              onChange={(e) => updateTournee(tournee.id, { date: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <span>Ajouter un arrêt</span>
          <AddressAutocomplete provider={provider} onPick={(s) => addStopToTournee(tournee.id, s)} />
        </div>

        <StopList
          stops={tournee.stops}
          onRemove={(id) => removeStopFromTournee(tournee.id, id)}
          onReorder={(from, to) => reorderStops(tournee.id, from, to)}
        />

        <div className="editor-footer">
          <button className="btn-ghost" onClick={() => optimizeTournee(tournee.id)}>
            Ré-optimiser
          </button>
          <span className="total">
            {tournee.route
              ? `${tournee.route.km.toFixed(0)} km · ${Math.round(tournee.route.min)} min` +
                (tournee.route.approximate ? ' (approx. hors-ligne)' : '')
              : '—'}
          </span>
          <button className="btn-primary" onClick={onClose}>Enregistrer la tournée</button>
        </div>
      </div>

      <TourneeMap
        tournees={[{ id: tournee.id, couleur: livreur?.couleur ?? 'var(--c-1)', stops: tournee.stops, route: tournee.route }]}
      />
    </div>
  )
}
```

- [ ] **Step 6: Implémenter `TourneeList.tsx`**

```tsx
import { useLivreur } from '../../state/LivreurContext'

interface Props {
  onOpen: (tourneeId: string) => void
}

export function TourneeList({ onOpen }: Props) {
  const { tournees, livreurs, removeTournee } = useLivreur()

  if (!tournees.length) return <p className="empty">Aucune tournée. Créez-en une.</p>

  const sorted = [...tournees].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <ul className="tournee-list">
      {sorted.map((t) => {
        const l = livreurs.find((x) => x.id === t.livreurId)
        return (
          <li key={t.id} className="tournee-row" style={{ borderLeftColor: l?.couleur }}>
            <span className="tournee-date">{t.date}</span>
            <span className="tournee-livreur">{l ? `${l.prenom} ${l.nom}` : '—'}</span>
            <span className="tournee-stats">
              {t.stops.length} arrêt(s)
              {t.route ? ` · ${t.route.km.toFixed(0)} km · ${Math.round(t.route.min)} min` : ''}
            </span>
            <button className="btn-ghost" onClick={() => onOpen(t.id)}>Modifier</button>
            <button className="btn-danger" onClick={() => confirm('Supprimer cette tournée ?') && removeTournee(t.id)}>
              Supprimer
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 7: Implémenter `TourneesSection.tsx`**

```tsx
import { useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { TourneeList } from './TourneeList'
import { TourneeEditor } from './TourneeEditor'

const today = () => new Date().toISOString().slice(0, 10)

export function TourneesSection() {
  const { livreurs, addTournee } = useLivreur()
  const [editing, setEditing] = useState<string | null>(null)

  if (editing) return <TourneeEditor tourneeId={editing} onClose={() => setEditing(null)} />

  function create() {
    if (!livreurs.length) {
      alert('Ajoutez d’abord un livreur dans la section Livreurs.')
      return
    }
    const id = addTournee({ livreurId: livreurs[0].id, date: today() })
    setEditing(id)
  }

  return (
    <section className="section">
      <div className="section-head">
        <h1>Tournées</h1>
        <button className="btn-primary" onClick={create}>Nouvelle tournée</button>
      </div>
      <TourneeList onOpen={(id) => setEditing(id)} />
    </section>
  )
}
```

- [ ] **Step 8: Écrire le test d'intégration de la section (react-leaflet mocké)**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LivreurProvider } from '../../state/LivreurContext'
import { TourneesSection } from './TourneesSection'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

afterEach(() => localStorage.clear())

describe('TourneesSection', () => {
  it('crée une tournée et ouvre l’éditeur quand un livreur existe', async () => {
    function Seed() {
      return null
    }
    render(
      <LivreurProvider>
        <Seed />
        <TourneesSection />
      </LivreurProvider>,
    )
    // sans livreur : alerte
    vi.stubGlobal('alert', vi.fn())
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle tournée' }))
    expect(screen.queryByText(/Ajouter un arrêt/)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 9: Voir tous les tests Tournées passer**

Run: `npx vitest run src/components/Tournees`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/Tournees
git commit -m "feat: section Tournées (liste + éditeur + arrêts drag&drop + carte)"
```

---

## Task 13: Section Chauffeurs (vue d'ensemble par date)

**Files:**
- Create: `src/components/Chauffeurs/ChauffeurCard.tsx`
- Create: `src/components/Chauffeurs/ChauffeursSection.tsx`
- Test: `src/components/Chauffeurs/ChauffeursSection.test.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { LivreurProvider, useLivreur } from '../../state/LivreurContext'
import { ChauffeursSection } from './ChauffeursSection'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

afterEach(() => localStorage.clear())

function Seeder() {
  const { addLivreur, livreurs, addTournee } = useLivreur()
  return (
    <button
      onClick={() => {
        if (!livreurs.length) addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '0612' })
        else addTournee({ livreurId: livreurs[0].id, date: '2026-06-16' })
      }}
    >
      seed
    </button>
  )
}

describe('ChauffeursSection', () => {
  it('liste les chauffeurs et filtre par date', async () => {
    render(
      <LivreurProvider>
        <Seeder />
        <ChauffeursSection />
      </LivreurProvider>,
    )
    const seed = screen.getByText('seed')
    await act(async () => { seed.click() }) // livreur
    await act(async () => { seed.click() }) // tournée 2026-06-16
    // le filtre date par défaut = aujourd'hui ; on bascule sur la date de la tournée
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    await act(async () => {
      dateInput.value = '2026-06-16'
      dateInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Voir le test échouer**

Run: `npx vitest run src/components/Chauffeurs/ChauffeursSection.test.tsx`
Expected: FAIL (composants absents).

- [ ] **Step 3: Implémenter `ChauffeurCard.tsx`**

```tsx
import type { Tournee } from '../../types'
import type { LivreurWithColor } from '../../state/LivreurContext'

interface Props {
  livreur: LivreurWithColor
  tournees: Tournee[]
}

export function ChauffeurCard({ livreur, tournees }: Props) {
  const stopsTotal = tournees.reduce((n, t) => n + t.stops.length, 0)
  const kmTotal = tournees.reduce((n, t) => n + (t.route?.km ?? 0), 0)
  const minTotal = tournees.reduce((n, t) => n + (t.route?.min ?? 0), 0)

  return (
    <div className="chauffeur-card" style={{ borderLeftColor: livreur.couleur }}>
      <div className="chauffeur-head">
        <span className="dot" style={{ background: livreur.couleur }} />
        <b>{livreur.prenom} {livreur.nom}</b>
        {livreur.telephone && <span className="muted">· {livreur.telephone}</span>}
        <span className="chauffeur-stats">
          {tournees.length
            ? `${stopsTotal} arrêts · ${kmTotal.toFixed(0)} km · ${Math.round(minTotal)} min`
            : 'Aucune tournée ce jour'}
        </span>
      </div>
      {tournees.map((t) => (
        <div key={t.id} className="chauffeur-trip">
          🏭 {t.stops.map((s, i) => `→ ${i + 1}. ${s.ville || s.label}`).join(' ')} → 🏭
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implémenter `ChauffeursSection.tsx`**

```tsx
import { useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { ChauffeurCard } from './ChauffeurCard'
import { TourneeMap } from '../map/TourneeMap'

const today = () => new Date().toISOString().slice(0, 10)

export function ChauffeursSection() {
  const { livreurs, tournees } = useLivreur()
  const [date, setDate] = useState(today())

  const ofDay = tournees.filter((t) => t.date === date)

  return (
    <section className="section">
      <div className="section-head">
        <h1>Chauffeurs</h1>
        <label className="field inline">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {!livreurs.length && <p className="empty">Aucun livreur.</p>}

      <div className="chauffeur-cards">
        {livreurs.map((l) => (
          <ChauffeurCard key={l.id} livreur={l} tournees={ofDay.filter((t) => t.livreurId === l.id)} />
        ))}
      </div>

      {ofDay.length > 0 && (
        <TourneeMap
          tournees={ofDay.map((t) => ({
            id: t.id,
            couleur: livreurs.find((l) => l.id === t.livreurId)?.couleur ?? 'var(--c-1)',
            stops: t.stops,
            route: t.route,
          }))}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 5: Voir le test passer**

Run: `npx vitest run src/components/Chauffeurs/ChauffeursSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Chauffeurs
git commit -m "feat: section Chauffeurs (cartes par chauffeur + filtre date + carte commune)"
```

---

## Task 14: Coquille App + smoke test bout-en-bout

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx` (remplacement complet)

- [ ] **Step 1: Réécrire `src/App.tsx`**

```tsx
import { LivreurProvider, useLivreur } from './state/LivreurContext'
import { Sidebar } from './components/layout/Sidebar'
import { LivreursSection } from './components/Livreurs/LivreursSection'
import { TourneesSection } from './components/Tournees/TourneesSection'
import { ChauffeursSection } from './components/Chauffeurs/ChauffeursSection'

function Shell() {
  const { section } = useLivreur()
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {section === 'livreurs' && <LivreursSection />}
        {section === 'tournees' && <TourneesSection />}
        {section === 'chauffeurs' && <ChauffeursSection />}
      </main>
    </div>
  )
}

export function App() {
  return (
    <LivreurProvider>
      <Shell />
    </LivreurProvider>
  )
}
```

- [ ] **Step 2: Écrire le smoke test bout-en-bout**

Remplacer `src/App.test.tsx` par :

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

afterEach(() => localStorage.clear())

describe('App (smoke)', () => {
  it('créer un livreur → créer une tournée → le retrouver dans Chauffeurs', async () => {
    render(<App />)

    // 1. Section Livreurs : créer Karim Benali
    await userEvent.click(screen.getByRole('button', { name: /Livreurs/ }))
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()

    // 2. Section Tournées : nouvelle tournée (ouvre l'éditeur)
    await userEvent.click(screen.getByRole('button', { name: /Tournées/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle tournée' }))
    expect(screen.getByText(/Ajouter un arrêt/)).toBeInTheDocument()

    // règle la date sur une valeur connue puis revient à la liste
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-06-16')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la tournée' }))

    // 3. Section Chauffeurs : à la date de la tournée, Karim apparaît
    await userEvent.click(screen.getByRole('button', { name: /Chauffeurs/ }))
    const chDate = screen.getByLabelText('Date') as HTMLInputElement
    await userEvent.clear(chDate)
    await userEvent.type(chDate, '2026-06-16')
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Lancer le smoke test**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: coquille App (sidebar + routeur de section) + smoke test E2E"
```

---

## Task 15: Styles des 3 sections

**Files:**
- Modify: `src/styles/app.css`

> Réécriture de la mise en page autour de `.app` (grille sidebar + main) et des nouvelles classes. Les tokens (`--c-1..8`, couleurs de fond/texte) de `src/styles/tokens.css` sont conservés et réutilisés.

- [ ] **Step 1: Inspecter les variables disponibles**

Run: `grep -E "^\s*--" src/styles/tokens.css | head -40`
Expected: liste des variables (couleurs `--c-1..8`, fonds, textes). Utiliser ces noms dans le CSS ci-dessous (adapter si les noms diffèrent ; les classes ci-dessous n'utilisent que `--c-1` et des couleurs neutres génériques).

- [ ] **Step 2: Remplacer la mise en page principale dans `src/styles/app.css`**

Ajouter / remplacer le bloc de layout (laisser les styles `.ac`, `.add-row`, `.map-pin*`, `.brand-dot` existants en place s'ils existent) :

```css
.app {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 12px;
  background: var(--surface-2, #1f2533);
  color: var(--on-surface-2, #e6e9ef);
}
.sidebar-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 12px; }
.sidebar-nav { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  width: 100%; text-align: left; padding: 9px 12px; border: 0; border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer; font-size: 14px;
}
.nav-item:hover { background: rgba(255, 255, 255, 0.08); }
.nav-item.active { background: var(--c-1); color: #fff; }
.sidebar-theme { margin-top: auto; }

/* Main + sections */
.main { padding: 24px 28px; overflow: auto; }
.section { display: flex; flex-direction: column; gap: 16px; max-width: 1100px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.empty { opacity: 0.6; font-style: italic; }

/* Champs & boutons */
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.field.inline { flex-direction: row; align-items: center; gap: 8px; }
.field input, .field select { padding: 8px 10px; border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 8px; }
.btn-primary { padding: 9px 16px; border: 0; border-radius: 8px; background: var(--c-1); color: #fff; cursor: pointer; }
.btn-ghost { padding: 8px 12px; border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 8px; background: transparent; cursor: pointer; }
.btn-danger { padding: 7px 12px; border: 0; border-radius: 8px; background: #e5484d; color: #fff; cursor: pointer; }

/* Livreurs */
.livreur-form { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.livreur-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.livreur-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: rgba(128, 128, 128, 0.08); }
.livreur-name { font-weight: 600; }
.livreur-tel, .livreur-count, .muted { opacity: 0.65; font-size: 13px; }
.livreur-row .btn-danger { margin-left: auto; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex: none; }

/* Tournées */
.tournee-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tournee-row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-left: 4px solid var(--c-1); border-radius: 8px; background: rgba(128, 128, 128, 0.08); }
.tournee-date { font-weight: 700; font-variant-numeric: tabular-nums; }
.tournee-row .btn-ghost { margin-left: auto; }

.tournee-editor { display: grid; grid-template-columns: minmax(360px, 1fr) 1fr; gap: 20px; height: calc(100vh - 48px); }
.editor-form { display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.editor-head { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.editor-footer { display: flex; align-items: center; gap: 14px; margin-top: auto; padding-top: 12px; }
.editor-footer .total { font-weight: 700; }
.editor-footer .btn-primary { margin-left: auto; }

.stop-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.stop-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; background: rgba(128, 128, 128, 0.1); }
.stop-row.depot { background: rgba(34, 197, 94, 0.15); font-weight: 600; }
.stop-row.dragging { opacity: 0.5; }
.stop-handle { cursor: grab; opacity: 0.5; }
.stop-num { font-weight: 700; color: var(--c-1); width: 1.4em; }
.stop-ville { margin-left: auto; opacity: 0.6; font-size: 13px; }
.stop-remove { border: 0; background: transparent; cursor: pointer; opacity: 0.6; }
.map-wrap { min-height: 380px; height: 100%; border-radius: 12px; overflow: hidden; }

/* Chauffeurs */
.chauffeur-cards { display: flex; flex-direction: column; gap: 12px; }
.chauffeur-card { border-left: 4px solid var(--c-1); border-radius: 8px; padding: 12px 14px; background: rgba(128, 128, 128, 0.08); }
.chauffeur-head { display: flex; align-items: center; gap: 10px; }
.chauffeur-stats { margin-left: auto; font-weight: 700; }
.chauffeur-trip { margin-top: 8px; opacity: 0.85; font-size: 13px; }
```

- [ ] **Step 3: Lancer le build complet**

Run: `npm run build`
Expected: PASS (tsc + vite build sans erreur).

- [ ] **Step 4: Commit**

```bash
git add src/styles/app.css
git commit -m "feat: styles des sections Livreurs/Tournées/Chauffeurs + sidebar"
```

---

## Task 16: Vérification finale

- [ ] **Step 1: Toute la suite de tests**

Run: `npm test`
Expected: PASS (routing, contexte, sidebar, livreurs, tournées, chauffeurs, smoke App).

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: PASS sans erreur.

- [ ] **Step 3: Vérification manuelle rapide**

Run: `npm run dev`
Puis dans le navigateur : créer un livreur, créer une tournée, ajouter 2-3 adresses réelles (Eure-et-Loir), vérifier la boucle sur la carte et le total km/min, réordonner un arrêt, ré-optimiser, puis ouvrir la section Chauffeurs à la bonne date.
Expected: comportement conforme au design ; en cas d'échec OSRM, bandeau « approx. hors-ligne ».

- [ ] **Step 4: Mettre à jour le README**

Mettre à jour `README.md` pour décrire les 3 sections, le dépôt fixe et la dépendance OSRM/BAN (remplacer la description de l'ancien modèle Répartiteur/Vue chauffeur).

- [ ] **Step 5: Commit final**

```bash
git add README.md
git commit -m "docs: README aligné sur le modèle Livreurs/Tournées/Chauffeurs"
```

---

## Self-Review (effectuée à la rédaction)

- **Couverture spec :** dépôt fixe (Task 2) · modèle Livreur/Tournee/Stop/RouteResult (Task 1) · OSRM /trip+/route+fallback (Task 3) · localStorage v3 (Task 4) · CRUD livreurs + cascade (Tasks 6,7,10) · CRUD tournées + arrêts illimités + autocomplétion BAN + drag manuel + ré-optimisation + départ/arrivée verrouillés (Task 12) · section Chauffeurs filtrée par date + carte commune (Task 13) · sidebar 3 sections (Task 9) · suppression de l'ancien modèle (Task 8) · tests (chaque tâche) + smoke E2E (Task 14). ✔
- **Pas de placeholder** : tout le code est fourni intégralement.
- **Cohérence des types/signatures** : `optimizeTrip`/`computeRoute`, `addStopToTournee`/`removeStopFromTournee`/`reorderStops`/`optimizeTournee`/`refreshRoute`, `LivreurWithColor`, `TourneeOnMap` — noms identiques entre définition (contexte) et usages (composants/tests).
- **Hors périmètre** : pas de backend, pas de vue mobile livreur, pas d'OSRM auto-hébergé (conforme au spec).
