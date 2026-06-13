# Chauffeurs dynamiques + affectation manuelle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'ajouter/renommer/supprimer des chauffeurs et d'affecter les arrêts à la main (« chauffeur actif » puis clic sur les arrêts), tout en gardant « Répartir par zone » comme auto-remplissage ; et retirer le drapeau ukrainien de l'attribution Leaflet.

**Architecture:** `DriverId` devient `string` ; les chauffeurs sont un état persisté (`drivers`) au lieu d'un const. Couleurs via une palette CSS `--c-1..--c-8`. L'optimiseur est scindé en fonctions pures (`buildRoutes`, `autoAssign`, `assignToDriver`). Le contexte porte les actions chauffeurs + affectation ; `dispatched` est supprimé. Les composants itèrent `drivers` du contexte.

**Tech Stack:** React 19, Vite, TS strict (`verbatimModuleSyntax`), Vitest + RTL, react-leaflet.

**Réf spec:** `docs/superpowers/specs/2026-06-13-affectation-manuelle-design.md`.

**Note refactor:** `DriverId: string` casse temporairement `tsc -b` jusqu'à la dernière tâche de câblage (T11). Les tests Vitest (transpilés sans typecheck global) restent verts par tâche. La validation `tsc -b` + build complète est en T11.

---

## Task 1: Palette de couleurs (tokens + helper) (TDD)

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/data/palette.ts`, `src/data/palette.test.ts`

- [ ] **Step 1: Mettre à jour la palette dans `src/styles/tokens.css`**

Dans le bloc `:root`, remplacer les 3 lignes `--c-karim/--c-lea/--c-sofiane` par la palette
complète + alias :

```css
  /* palette chauffeurs (8 couleurs) — signature : 1 couleur = 1 chauffeur */
  --c-1: oklch(0.58 0.17 256);
  --c-2: oklch(0.70 0.14 66);
  --c-3: oklch(0.62 0.13 152);
  --c-4: oklch(0.60 0.16 300);
  --c-5: oklch(0.62 0.12 200);
  --c-6: oklch(0.60 0.18 25);
  --c-7: oklch(0.64 0.16 350);
  --c-8: oklch(0.66 0.14 110);
  --c-karim: var(--c-1);
  --c-lea: var(--c-2);
  --c-sofiane: var(--c-3);
```

Dans le bloc `[data-theme="dark"]`, remplacer de même les 3 lignes par :

```css
  --c-1: oklch(0.66 0.16 256);
  --c-2: oklch(0.76 0.14 66);
  --c-3: oklch(0.70 0.13 152);
  --c-4: oklch(0.68 0.15 300);
  --c-5: oklch(0.70 0.12 200);
  --c-6: oklch(0.68 0.17 25);
  --c-7: oklch(0.72 0.15 350);
  --c-8: oklch(0.74 0.14 110);
  --c-karim: var(--c-1);
  --c-lea: var(--c-2);
  --c-sofiane: var(--c-3);
```

- [ ] **Step 2: Écrire le test `src/data/palette.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { driverColor, PALETTE_SIZE } from './palette'

describe('driverColor', () => {
  it('mappe l’index sur la variable CSS de palette (1-based)', () => {
    expect(driverColor(0)).toBe('var(--c-1)')
    expect(driverColor(2)).toBe('var(--c-3)')
  })
  it('cycle modulo la taille de palette', () => {
    expect(driverColor(PALETTE_SIZE)).toBe('var(--c-1)')
    expect(driverColor(PALETTE_SIZE + 1)).toBe('var(--c-2)')
  })
})
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npx vitest run src/data/palette.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 4: Implémenter `src/data/palette.ts`**

```ts
export const PALETTE_SIZE = 8

export function driverColor(colorIndex: number): string {
  const n = ((colorIndex % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE
  return `var(--c-${n + 1})`
}

/** Plus petit index de couleur non utilisé (peut dépasser PALETTE_SIZE, driverColor cycle). */
export function nextColorIndex(used: number[]): number {
  const set = new Set(used)
  let i = 0
  while (set.has(i)) i++
  return i
}
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npx vitest run src/data/palette.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: palette de couleurs --c-1..8 + helper driverColor"
```

---

## Task 2: Types — DriverId string, Driver, DriverConfig

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Mettre à jour `src/types.ts`**

Remplacer la ligne `export type DriverId = 'karim' | 'lea' | 'sofiane'` par `export type DriverId = string`,
et remplacer l'interface `Driver` (qui contenait `couleur`, `couleurHex`, `center`) par :

```ts
export type DriverId = string

export interface DriverConfig {
  id: DriverId
  nom: string
  colorIndex: number
}

export interface Driver extends DriverConfig {
  couleur: string
}
```

(Garder `ScreenId`, `Theme`, `LatLng`, `Stop`, `RouteResult`, `Routes = Record<DriverId, RouteResult>`,
`Suggestion` inchangés. Supprimer toute mention de `couleurHex`/`center`.)

- [ ] **Step 2: Vérifier rapidement le fichier**

Run: `grep -n "couleurHex\|center" src/types.ts || echo "OK propre"`
Expected: `OK propre`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: DriverId string + DriverConfig/Driver (palette)"
```

---

## Task 3: Données — DEFAULT_DRIVERS + DEPOT

**Files:**
- Modify: `src/data/drivers.ts`

- [ ] **Step 1: Réécrire `src/data/drivers.ts`**

```ts
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
```

- [ ] **Step 2: Vérifier qu'il ne reste pas de référence à l'ancien `DRIVERS`/`center` dans data**

Run: `grep -rn "center\|couleurHex\|export const DRIVERS" src/data/ || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: DEFAULT_DRIVERS (DriverConfig, sans center) ; DEPOT conservé"
```

---

## Task 4: Optimiseur — buildRoutes / autoAssign / assignToDriver (TDD)

**Files:**
- Modify: `src/services/routeOptimizer.ts`, `src/services/routeOptimizer.test.ts`

- [ ] **Step 1: Réécrire le test `src/services/routeOptimizer.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildRoutes, autoAssign, assignToDriver, centroid } from './routeOptimizer'
import { DEFAULT_DRIVERS } from '../data/drivers'
import { driverColor } from '../data/palette'
import { SEED_STOPS } from '../data/seed'
import type { Driver, Stop } from '../types'

const DRIVERS: Driver[] = DEFAULT_DRIVERS.map((d) => ({ ...d, couleur: driverColor(d.colorIndex) }))

describe('buildRoutes', () => {
  it('groupe par chauffeur, trie par order, calcule km/min', () => {
    const r = buildRoutes(SEED_STOPS, DRIVERS)
    expect(r.karim.stops.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(r.karim.km).toMatch(/^\d+\.\d$/)
    expect(Number(r.karim.min)).toBeGreaterThan(0)
  })
  it('ignore les arrêts non affectés', () => {
    const extra: Stop = { id: 'x', driver: null, ville: 'X', label: 'X', lat: 48.8, lng: 2.29 }
    const r = buildRoutes([...SEED_STOPS, extra], DRIVERS)
    const total = r.karim.stops.length + r.lea.stops.length + r.sofiane.stops.length
    expect(total).toBe(12)
  })
})

describe('centroid', () => {
  it('renvoie la moyenne lat/lng, null si vide', () => {
    expect(centroid([])).toBeNull()
    const c = centroid([{ lat: 48.8, lng: 2.2 } as Stop, { lat: 48.6, lng: 2.4 } as Stop])
    expect(c).toEqual({ lat: 48.7, lng: 2.3 })
  })
})

describe('autoAssign', () => {
  it('affecte les non-affectés au chauffeur le plus proche, sans écraser l’existant', () => {
    const extra: Stop = { id: 'x', driver: null, ville: 'Sceaux', label: 'test', lat: 48.7785, lng: 2.2882 }
    const out = autoAssign([...SEED_STOPS, extra], DRIVERS)
    const got = out.find((s) => s.id === 'x')!
    expect(got.driver).toBe('sofiane') // proche du cluster sud
    // les seed gardent leur chauffeur
    expect(out.find((s) => s.id === 's1')!.driver).toBe('karim')
  })
})

describe('assignToDriver', () => {
  it('affecte un arrêt à un chauffeur et réindexe order', () => {
    const extra: Stop = { id: 'x', driver: null, ville: 'X', label: 'X', lat: 48.815, lng: 2.30 }
    const out = assignToDriver([...SEED_STOPS, extra], 'x', 'lea')
    const lea = out.filter((s) => s.driver === 'lea').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    expect(lea.some((s) => s.id === 'x')).toBe(true)
    expect(lea.map((s) => s.order)).toEqual(lea.map((_, i) => i)) // order 0..n contigu
  })
  it('désaffecte avec driverId null', () => {
    const out = assignToDriver(SEED_STOPS, 's1', null)
    expect(out.find((s) => s.id === 's1')!.driver).toBeNull()
  })
  it('retire l’arrêt de son ancien chauffeur quand on le réaffecte', () => {
    const out = assignToDriver(SEED_STOPS, 's1', 'lea')
    expect(out.find((s) => s.id === 's1')!.driver).toBe('lea')
    expect(out.filter((s) => s.driver === 'karim').some((s) => s.id === 's1')).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/services/routeOptimizer.test.ts`
Expected: FAIL — `buildRoutes`/`autoAssign`/`assignToDriver`/`centroid` non exportés.

- [ ] **Step 3: Réécrire `src/services/routeOptimizer.ts`**

```ts
import type { Driver, DriverId, LatLng, Routes, Stop } from '../types'
import { DEPOT } from '../data/drivers'
import { haversine, routeLengthKm } from './geo'

const MIN_PER_KM = 2.3
const STOP_MIN = 4

function sortByOrder(stops: Stop[]): Stop[] {
  return stops.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function centroid(stops: LatLng[]): LatLng | null {
  if (!stops.length) return null
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length
  return { lat, lng }
}

export function cheapestInsertIndex(route: Stop[], stop: LatLng): number {
  let bestI = route.length
  let bestC = Infinity
  for (let i = 0; i <= route.length; i++) {
    const prev: LatLng = i === 0 ? DEPOT : route[i - 1]
    const next: LatLng | null = i === route.length ? null : route[i]
    const c = next
      ? haversine(prev, stop) + haversine(stop, next) - haversine(prev, next)
      : haversine(prev, stop)
    if (c < bestC) {
      bestC = c
      bestI = i
    }
  }
  return bestI
}

/** Groupe les arrêts par chauffeur (triés par order) et calcule les stats. */
export function buildRoutes(stops: Stop[], drivers: Driver[]): Routes {
  const result = {} as Routes
  drivers.forEach((dr) => {
    const arr = sortByOrder(stops.filter((s) => s.driver === dr.id))
    const km = routeLengthKm([DEPOT, ...arr])
    const min = Math.round(km * MIN_PER_KM + arr.length * STOP_MIN)
    result[dr.id] = { stops: arr, km: km.toFixed(1), min: String(min) }
  })
  return result
}

/** Affecte ou réaffecte un arrêt à un chauffeur (insertion moindre coût + réindex order). */
export function assignToDriver(stops: Stop[], stopId: string, driverId: DriverId | null): Stop[] {
  const target = stops.find((s) => s.id === stopId)
  if (!target) return stops
  if (driverId === null) {
    return stops.map((s) => (s.id === stopId ? { ...s, driver: null } : s))
  }
  const route = sortByOrder(stops.filter((s) => s.driver === driverId && s.id !== stopId))
  const idx = cheapestInsertIndex(route, target)
  route.splice(idx, 0, { ...target, driver: driverId })
  const orderMap = new Map(route.map((s, i) => [s.id, i]))
  return stops.map((s) => {
    if (s.id === stopId) return { ...s, driver: driverId, order: orderMap.get(s.id) }
    if (s.driver === driverId && orderMap.has(s.id)) return { ...s, order: orderMap.get(s.id) }
    return s
  })
}

/** Auto-remplissage : affecte les arrêts NON affectés au chauffeur dont le centroïde est le plus proche. */
export function autoAssign(stops: Stop[], drivers: Driver[]): Stop[] {
  const centers: Record<string, LatLng> = {}
  drivers.forEach((d) => {
    centers[d.id] = centroid(stops.filter((s) => s.driver === d.id)) ?? DEPOT
  })
  let out = stops
  for (const s of stops.filter((s) => !s.driver)) {
    let best = drivers[0]?.id
    let bd = Infinity
    for (const d of drivers) {
      const dd = haversine(s, centers[d.id])
      if (dd < bd) {
        bd = dd
        best = d.id
      }
    }
    if (best != null) out = assignToDriver(out, s.id, best)
  }
  return out
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/services/routeOptimizer.test.ts`
Expected: PASS (tous).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: optimiseur buildRoutes/autoAssign/assignToDriver/centroid + tests"
```

---

## Task 5: Contexte — chauffeurs dynamiques + affectation (TDD)

**Files:**
- Modify: `src/state/LivreurContext.tsx`, `src/state/LivreurContext.test.tsx`

- [ ] **Step 1: Réécrire le test `src/state/LivreurContext.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <LivreurProvider>{children}</LivreurProvider>

describe('LivreurContext — chauffeurs dynamiques', () => {
  beforeEach(() => localStorage.clear())

  it('démarre avec 3 chauffeurs et les 12 arrêts seed groupés', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    expect(result.current.drivers.map((d) => d.id)).toEqual(['karim', 'lea', 'sofiane'])
    expect(result.current.routes.karim.stops.length).toBe(4)
  })

  it('addDriver ajoute un chauffeur avec une couleur libre', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addDriver('Michel'))
    const michel = result.current.drivers.find((d) => d.nom === 'Michel')!
    expect(michel).toBeTruthy()
    expect(michel.couleur).toBe('var(--c-4)')
    expect(result.current.routes[michel.id].stops.length).toBe(0)
  })

  it('renameDriver renomme', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.renameDriver('karim', 'Karim B.'))
    expect(result.current.drivers.find((d) => d.id === 'karim')!.nom).toBe('Karim B.')
  })

  it('removeDriver supprime et repasse ses arrêts en non affectés', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.removeDriver('karim'))
    expect(result.current.drivers.some((d) => d.id === 'karim')).toBe(false)
    expect(result.current.stops.filter((s) => s.driver === 'karim').length).toBe(0)
    // les ex-arrêts de karim sont maintenant non affectés
    expect(result.current.stops.some((s) => s.id === 's1' && s.driver === null)).toBe(true)
  })

  it('ne supprime pas le dernier chauffeur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => {
      result.current.removeDriver('karim')
      result.current.removeDriver('lea')
      result.current.removeDriver('sofiane')
    })
    expect(result.current.drivers.length).toBeGreaterThanOrEqual(1)
  })

  it('assignStop affecte un arrêt au chauffeur actif puis le désaffecte', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.assignStop('s5', 'karim')) // s5 est à lea au départ
    expect(result.current.stops.find((s) => s.id === 's5')!.driver).toBe('karim')
    act(() => result.current.assignStop('s5', null))
    expect(result.current.stops.find((s) => s.id === 's5')!.driver).toBeNull()
  })

  it('autoAssign réaffecte les arrêts non affectés', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.assignStop('s5', null))
    act(() => result.current.autoAssign())
    expect(result.current.stops.find((s) => s.id === 's5')!.driver).not.toBeNull()
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: FAIL — API absente (`drivers`, `addDriver`, …) + `dispatch` supprimé.

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
import type { Driver, DriverConfig, DriverId, Routes, ScreenId, Stop, Suggestion, Theme } from '../types'
import { DEFAULT_DRIVERS } from '../data/drivers'
import { SEED_STOPS } from '../data/seed'
import { driverColor, nextColorIndex } from '../data/palette'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { makeStopId } from '../services/stopId'
import { assignToDriver, autoAssign as autoAssignStops, buildRoutes } from '../services/routeOptimizer'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()

export interface LivreurState {
  theme: Theme
  screen: ScreenId
  selected: DriverId
  activeDriver: DriverId
  highlighted: DriverId | null
  progress: Record<DriverId, number>
  stops: Stop[]
  drivers: Driver[]
  routes: Routes
  assign: Record<string, string>
  provider: AddressProvider
  toggleTheme: () => void
  setScreen: (s: ScreenId) => void
  setSelected: (id: DriverId) => void
  setActiveDriver: (id: DriverId) => void
  setHighlighted: (id: DriverId | null) => void
  addDriver: (nom: string) => void
  renameDriver: (id: DriverId, nom: string) => void
  removeDriver: (id: DriverId) => void
  addStop: (s: Suggestion) => void
  addBulk: (text: string) => Promise<void>
  removeStop: (id: string) => void
  assignStop: (stopId: string, driverId: DriverId | null) => void
  autoAssign: () => void
  openDriver: (id: DriverId) => void
  goDriver: () => void
  advance: (id: DriverId) => void
  resetTour: (id: DriverId) => void
  reduceMotion: boolean
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
  const [screen, setScreen] = usePersistentState<ScreenId>('screen', 'dispatch')
  const [configs, setConfigs] = usePersistentState<DriverConfig[]>('drivers', DEFAULT_DRIVERS)
  const [stops, setStops] = usePersistentState<Stop[]>('stops', SEED_STOPS)
  const [progress, setProgress] = usePersistentState<Record<DriverId, number>>('progress', {
    karim: 0,
    lea: 0,
    sofiane: 0,
  })
  const [selectedRaw, setSelected] = usePersistentState<DriverId>('selected', 'karim')
  const [activeRaw, setActiveDriver] = useState<DriverId>(() => configs[0]?.id ?? 'karim')
  const [highlighted, setHighlighted] = useState<DriverId | null>(null)

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const drivers = useMemo<Driver[]>(
    () => configs.map((c) => ({ ...c, couleur: driverColor(c.colorIndex) })),
    [configs],
  )

  // garde-fous : selected/activeDriver doivent désigner un chauffeur existant
  const selected = drivers.some((d) => d.id === selectedRaw) ? selectedRaw : (drivers[0]?.id ?? 'karim')
  const activeDriver = drivers.some((d) => d.id === activeRaw) ? activeRaw : (drivers[0]?.id ?? 'karim')

  const routes = useMemo(() => buildRoutes(stops, drivers), [stops, drivers])
  const assign = useMemo(() => {
    const m: Record<string, string> = {}
    drivers.forEach((d) => routes[d.id].stops.forEach((s) => {
      m[s.id] = d.couleur
    }))
    return m
  }, [routes, drivers])

  const addDriver = useCallback((nom: string) => {
    const label = nom.trim()
    if (!label) return
    setConfigs((prev) => [
      ...prev,
      { id: makeStopId(), nom: label, colorIndex: nextColorIndex(prev.map((c) => c.colorIndex)) },
    ])
  }, [setConfigs])

  const renameDriver = useCallback((id: DriverId, nom: string) => {
    const label = nom.trim()
    if (!label) return
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, nom: label } : c)))
  }, [setConfigs])

  const removeDriver = useCallback((id: DriverId) => {
    setConfigs((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)))
    setStops((prev) => prev.map((s) => (s.driver === id ? { ...s, driver: null } : s)))
  }, [setConfigs, setStops])

  const addStop = useCallback((s: Suggestion) => {
    setStops((prev) => [
      ...prev,
      { id: makeStopId(), driver: null, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng },
    ])
  }, [setStops])

  const addBulk = useCallback(
    async (text: string) => {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      const results = await Promise.all(lines.map((l) => provider.geocodeFirst(l)))
      const items: Stop[] = results
        .filter((r): r is NonNullable<typeof r> => r != null)
        .map((r) => ({ id: makeStopId(), driver: null, label: r.label, ville: r.ville, lat: r.lat, lng: r.lng }))
      if (items.length) setStops((prev) => [...prev, ...items])
    },
    [provider, setStops],
  )

  const removeStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id))
  }, [setStops])

  const assignStop = useCallback((stopId: string, driverId: DriverId | null) => {
    setStops((prev) => assignToDriver(prev, stopId, driverId))
  }, [setStops])

  const autoAssign = useCallback(() => {
    setStops((prev) => autoAssignStops(prev, drivers))
  }, [drivers, setStops])

  const openDriver = useCallback((id: DriverId) => {
    setSelected(id)
    setScreen('driver')
  }, [setSelected, setScreen])

  const goDriver = useCallback(() => setScreen('driver'), [setScreen])

  const advance = useCallback((id: DriverId) => {
    const n = routes[id]?.stops.length ?? 0
    setProgress((p) => ({ ...p, [id]: Math.min((p[id] ?? 0) + 1, n) }))
  }, [routes, setProgress])

  const resetTour = useCallback(
    (id: DriverId) => setProgress((p) => ({ ...p, [id]: 0 })),
    [setProgress],
  )

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    [setTheme],
  )

  const value: LivreurState = {
    theme, screen, selected, activeDriver, highlighted, progress, stops, drivers, routes, assign, provider,
    toggleTheme, setScreen, setSelected, setActiveDriver, setHighlighted,
    addDriver, renameDriver, removeDriver,
    addStop, addBulk, removeStop, assignStop, autoAssign,
    openDriver, goDriver, advance, resetTour,
    reduceMotion: !!reduceMotion,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: PASS (tous).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: contexte — chauffeurs dynamiques, assignStop/autoAssign, suppression dispatched"
```

---

## Task 6: Fix drapeau — attribution Leaflet sans préfixe

**Files:**
- Modify: `src/components/map/BaseMap.tsx`

- [ ] **Step 1: Mettre à jour `src/components/map/BaseMap.tsx`**

Remplacer l'import react-leaflet et le `MapContainer` pour désactiver le contrôle d'attribution
par défaut (qui porte le « Leaflet 🇺🇦 ») et rendre un `AttributionControl` sans préfixe :

```tsx
import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, AttributionControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useLivreur } from '../../state/LivreurContext'
import type { LatLng } from '../../types'

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}
const ATTR = '&copy; OpenStreetMap, &copy; CARTO'

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [map, points])
  return null
}

function Resizer() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(t)
  }, [map])
  return null
}

interface Props {
  points: LatLng[]
  interactive?: boolean
  children?: ReactNode
}

export function BaseMap({ points, interactive = true, children }: Props) {
  const { theme } = useLivreur()
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [48.81, 2.29]
  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={interactive}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      attributionControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <AttributionControl position="bottomright" prefix={false} />
      <TileLayer key={theme} url={theme === 'dark' ? TILES.dark : TILES.light} attribution={ATTR} />
      <FitBounds points={points} />
      <Resizer />
      {children}
    </MapContainer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "fix: retire le drapeau Leaflet de l'attribution (prefix=false), garde OSM/CARTO"
```

---

## Task 7: Carte — DispatcherMap reçoit `drivers` en prop

**Files:**
- Modify: `src/components/map/DispatcherMap.tsx`

(RouteLayer et PhoneMap reçoivent déjà un `driver`/des stops en props — inchangés. Seul
`DispatcherMap` importait le const `DRIVERS` ; on le passe désormais en prop.)

- [ ] **Step 1: Réécrire `src/components/map/DispatcherMap.tsx`**

```tsx
import { Marker } from 'react-leaflet'
import type { Driver, DriverId, Routes, Stop } from '../../types'
import { DEPOT } from '../../data/drivers'
import { BaseMap } from './BaseMap'
import { RouteLayer } from './RouteLayer'
import { depotIcon, idleIcon } from './pins'

interface Props {
  stops: Stop[]
  drivers: Driver[]
  routes: Routes
  highlighted: DriverId | null
  onHover: (id: DriverId | null) => void
  reduceMotion: boolean
}

export function DispatcherMap({ stops, drivers, routes, highlighted, onHover, reduceMotion }: Props) {
  const allPoints = [DEPOT, ...stops]
  const unassigned = stops.filter((s) => !s.driver)
  return (
    <BaseMap points={allPoints}>
      <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} />

      {unassigned.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={idleIcon()} />
      ))}

      {drivers.map((d, i) => (
        <RouteLayer
          key={d.id}
          driver={d}
          stops={routes[d.id].stops}
          index={i}
          dim={!!highlighted && highlighted !== d.id}
          reduceMotion={reduceMotion}
          onHover={onHover}
        />
      ))}
    </BaseMap>
  )
}
```

- [ ] **Step 2: Vérifier que `DispatcherMap` n'importe plus le const DRIVERS**

Run: `grep -n "DRIVERS" src/components/map/DispatcherMap.tsx || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: DispatcherMap — drivers en prop, arrêts non affectés en gris"
```

---

## Task 8: Vue chauffeur — DriverPills & DriverView via contexte

**Files:**
- Modify: `src/components/DriverView/DriverPills.tsx`, `src/components/DriverView/DriverView.tsx`

- [ ] **Step 1: Réécrire `src/components/DriverView/DriverPills.tsx`**

```tsx
import type { CSSProperties } from 'react'
import type { Driver, DriverId, Routes } from '../../types'

interface Props {
  drivers: Driver[]
  driver: Driver
  routes: Routes
  setSelected: (id: DriverId) => void
}

export function DriverPills({ drivers, driver, routes, setSelected }: Props) {
  return (
    <div className="driver-pills">
      {drivers.map((d) => (
        <button
          key={d.id}
          className={'pill' + (d.id === driver.id ? ' active' : '')}
          style={{ '--col': d.couleur } as CSSProperties}
          onClick={() => setSelected(d.id)}
        >
          <span className="pill-dot" /> {d.nom}
          <span className="pill-cnt mono">{routes[d.id].stops.length}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Mettre à jour `src/components/DriverView/DriverView.tsx`**

Récupérer `drivers` du contexte, choisir le chauffeur via cette liste, et passer `drivers` aux pills.
Remplacer le début de `DriverView` et l'usage de `DriverPills` :

```tsx
import { Fragment, type CSSProperties } from 'react'
import { PhoneMap } from '../map/PhoneMap'
import { IcoCheck, IcoLink } from '../icons'
import { DriverPills } from './DriverPills'
import { CurrentStop } from './CurrentStop'
import { StopList } from './StopList'
import { useLivreur } from '../../state/LivreurContext'

export function DriverView() {
  const { drivers, routes, selected, setSelected, progress, advance, resetTour } = useLivreur()
  const driver = drivers.find((d) => d.id === selected) ?? drivers[0]
  const route = routes[driver.id]
  const arrets = route.stops
  const total = arrets.length
  const idx = Math.min(progress[driver.id] ?? 0, total)
  const fini = idx >= total
  const courant = fini ? null : arrets[idx]
  const now = new Date()
  const heure = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  return (
    <div className="driver-screen">
      <DriverPills drivers={drivers} driver={driver} routes={routes} setSelected={setSelected} />
```

(Le reste du JSX de `DriverView` — bloc `.phone`, etc. — reste inchangé.)

- [ ] **Step 3: Vérifier qu'aucune vue chauffeur n'importe le const DRIVERS**

Run: `grep -rn "from '../../data/drivers'" src/components/DriverView/ | grep -i drivers ; grep -rn "DRIVERS" src/components/DriverView/ || echo "OK"`
Expected: aucune mention de `DRIVERS` (le const) — `OK`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: vue chauffeur — chauffeurs via contexte (DriverPills/DriverView)"
```

---

## Task 9: Carte chauffeur — sélection active, renommage, suppression

**Files:**
- Modify: `src/components/Dispatcher/DriverCard.tsx`

- [ ] **Step 1: Réécrire `src/components/Dispatcher/DriverCard.tsx`**

```tsx
import { useState, type CSSProperties } from 'react'
import type { Driver, DriverId, RouteResult } from '../../types'
import { IcoArrow, IcoX } from '../icons'

interface Props {
  d: Driver
  route: RouteResult
  active: boolean
  dim: boolean
  canDelete: boolean
  onSelectActive: (id: DriverId) => void
  onRename: (id: DriverId, nom: string) => void
  onRemove: (id: DriverId) => void
  onHover: (id: DriverId | null) => void
  onOpen: (id: DriverId) => void
}

export function DriverCard({
  d, route, active, dim, canDelete, onSelectActive, onRename, onRemove, onHover, onOpen,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(d.nom)

  function commit() {
    setEditing(false)
    if (name.trim() && name.trim() !== d.nom) onRename(d.id, name.trim())
    else setName(d.nom)
  }

  return (
    <div
      className={'dcard dispatched' + (active ? ' active' : '') + (dim ? ' dim' : '')}
      style={{ '--col': d.couleur } as CSSProperties}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelectActive(d.id)}
    >
      <div className="dcard-top">
        <span className="dcard-dot" />
        {editing ? (
          <input
            className="dcard-name-input"
            value={name}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setName(d.nom)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className="dcard-name"
            title="Renommer"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {d.nom}
          </span>
        )}
        {active && <span className="dcard-tag">ACTIF</span>}
        {canDelete && (
          <button
            className="stopitem-x"
            title="Supprimer le chauffeur"
            aria-label="Supprimer le chauffeur"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(d.id)
            }}
          >
            <IcoX />
          </button>
        )}
      </div>
      <div className="dcard-stats">
        <div className="stat"><div className="stat-num">{route.stops.length}</div><div className="stat-lbl">arrêts</div></div>
        <div className="stat"><div className="stat-num">{route.km}</div><div className="stat-lbl">km</div></div>
        <div className="stat"><div className="stat-num">{route.min}</div><div className="stat-lbl">min</div></div>
      </div>
      <button
        className="btn btn-route"
        onClick={(e) => {
          e.stopPropagation()
          onOpen(d.id)
        }}
        disabled={!route.stops.length}
      >
        Voir la tournée <IcoArrow />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: DriverCard — sélection active, renommage inline, suppression"
```

---

## Task 10: Dispatcher (gestion chauffeurs + affectation) + StopsPanel + styles + App

**Files:**
- Modify: `src/components/Dispatcher/Dispatcher.tsx`, `src/components/Dispatcher/StopsPanel.tsx`, `src/components/Dispatcher/StopsPanel.test.tsx`, `src/styles/app.css`, `src/App.tsx`

- [ ] **Step 1: Réécrire le test `src/components/Dispatcher/StopsPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopsPanel } from './StopsPanel'
import { SEED_STOPS } from '../../data/seed'
import type { AddressProvider } from '../../services/addressProvider'

const provider: AddressProvider = {
  suggest: vi.fn().mockResolvedValue([]),
  geocodeFirst: vi.fn(),
}

const base = {
  stops: SEED_STOPS,
  assign: {} as Record<string, string>,
  provider,
  activeColor: 'var(--c-1)',
  addStop: vi.fn(),
  addBulk: vi.fn(),
  removeStop: vi.fn(),
}

describe('StopsPanel', () => {
  it('clic sur un arrêt l’affecte au chauffeur actif', () => {
    const assignStop = vi.fn()
    render(<StopsPanel {...base} assignStop={assignStop} />)
    fireEvent.click(screen.getByText('Malakoff'))
    expect(assignStop).toHaveBeenCalledWith('s1')
  })

  it('clic sur la croix retire l’arrêt', () => {
    const removeStop = vi.fn()
    render(<StopsPanel {...base} assignStop={vi.fn()} removeStop={removeStop} />)
    fireEvent.click(screen.getAllByLabelText('Retirer')[0])
    expect(removeStop).toHaveBeenCalledWith('s1')
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/components/Dispatcher/StopsPanel.test.tsx`
Expected: FAIL — `StopsPanel` n'a pas encore `assignStop`/`activeColor` ni l'arrêt cliquable.

- [ ] **Step 3: Réécrire `src/components/Dispatcher/StopsPanel.tsx`**

```tsx
import { useState, type CSSProperties } from 'react'
import type { Stop, Suggestion } from '../../types'
import type { AddressProvider } from '../../services/addressProvider'
import { IcoList, IcoX } from '../icons'
import { AddressAutocomplete } from './AddressAutocomplete'

interface Props {
  stops: Stop[]
  assign: Record<string, string>
  provider: AddressProvider
  activeColor: string
  addStop: (s: Suggestion) => void
  addBulk: (text: string) => void
  removeStop: (id: string) => void
  assignStop: (id: string) => void
}

export function StopsPanel({ stops, assign, provider, activeColor, addStop, addBulk, removeStop, assignStop }: Props) {
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')

  function submitBulk() {
    if (bulk.trim()) {
      addBulk(bulk)
      setBulk('')
      setBulkOpen(false)
    }
  }
  const bulkCount = bulk.split('\n').filter((l) => l.trim()).length

  return (
    <div className="stops-panel">
      <div className="stops-head">
        <span className="drivers-label" style={{ padding: 0 }}>
          Arrêts à livrer · <span className="mono">{stops.length}</span>
        </span>
        <button className="link-btn" onClick={() => setBulkOpen((o) => !o)}>
          <IcoList /> Coller une liste
        </button>
      </div>

      <AddressAutocomplete provider={provider} onPick={addStop} />

      {bulkOpen && (
        <div className="bulk">
          <textarea
            className="bulk-area" value={bulk}
            placeholder={'Une adresse par ligne, ex.\n5 rue du Marché, Clamart\n18 av. Pasteur, Sceaux'}
            onChange={(e) => setBulk(e.target.value)} rows={4}
          />
          <button className="btn btn-primary" onClick={submitBulk} style={{ padding: '9px 14px', fontSize: 13 }}>
            Ajouter {bulkCount || ''} arrêt{bulkCount > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <div className="add-hint">Cliquez un arrêt pour l’affecter au chauffeur actif. La croix le retire.</div>

      <div className="stop-list">
        {stops.map((s) => {
          const col = assign[s.id] ?? null
          return (
            <div
              className={'stopitem stopitem-click' + (col ? '' : ' unassigned')}
              key={s.id}
              style={(col ? { '--col': col } : { '--col': activeColor }) as CSSProperties}
              onClick={() => assignStop(s.id)}
              title="Affecter au chauffeur actif"
            >
              <span className={'stopitem-dot' + (col ? ' on' : '')} />
              <div className="stopitem-body">
                <div className="stopitem-ville">{s.ville}</div>
                <div className="stopitem-adr">{s.label}</div>
              </div>
              <button
                className="stopitem-x"
                onClick={(e) => {
                  e.stopPropagation()
                  removeStop(s.id)
                }}
                title="Retirer"
                aria-label="Retirer"
              >
                <IcoX />
              </button>
            </div>
          )
        })}
        {!stops.length && <div className="stop-empty mono">Aucun arrêt — ajoutez une adresse ci-dessus.</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/components/Dispatcher/StopsPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Réécrire `src/components/Dispatcher/Dispatcher.tsx`**

```tsx
import { useState } from 'react'
import { DispatcherMap } from '../map/DispatcherMap'
import { DriverCard } from './DriverCard'
import { StopsPanel } from './StopsPanel'
import { IcoInfo, IcoPlus, IcoZone } from '../icons'
import { useLivreur } from '../../state/LivreurContext'

export function Dispatcher() {
  const {
    stops, drivers, routes, assign, highlighted, setHighlighted,
    activeDriver, setActiveDriver, openDriver,
    addStop, addBulk, removeStop, assignStop, autoAssign,
    addDriver, renameDriver, removeDriver, reduceMotion, provider,
  } = useLivreur()

  const [newName, setNewName] = useState('')
  const activeColor = drivers.find((d) => d.id === activeDriver)?.couleur ?? 'var(--c-1)'
  const unassigned = stops.filter((s) => !s.driver).length

  function submitNew() {
    if (newName.trim()) {
      addDriver(newName)
      setNewName('')
    }
  }

  return (
    <div className="dispatch">
      <div className="dispatch-map">
        <div className="map-shell">
          <DispatcherMap
            stops={stops} drivers={drivers} routes={routes}
            highlighted={highlighted} onHover={setHighlighted} reduceMotion={reduceMotion}
          />
          <div className="map-badge">
            <span>SO Paris</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="mono">{stops.length} arrêts</span>
          </div>
          <div className="map-legend">
            {drivers.map((d) => (
              <div className="legend-row" key={d.id}>
                <span className="legend-dot" style={{ background: d.couleur }} />
                {d.nom}{' '}
                <span className="mono" style={{ color: 'var(--text-3)', marginLeft: 2 }}>
                  {routes[d.id].stops.length}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dispatch-side">
        <div className="side-head">
          <div className="side-title">Répartition des tournées</div>
          <div className="side-status">
            <b>{stops.length}</b> arrêts · <b>{unassigned}</b> non affecté{unassigned > 1 ? 's' : ''}
          </div>
        </div>

        <div className="side-action">
          <button className="btn btn-primary" onClick={autoAssign} disabled={!unassigned}>
            <IcoZone /> Répartir par zone
          </button>
          <div className="side-hint">
            <IcoInfo />
            <span>
              Choisissez un chauffeur (carte active), puis cliquez ses arrêts. « Répartir par zone »
              remplit automatiquement les arrêts non affectés.
            </span>
          </div>
        </div>

        <div className="drivers">
          <div className="drivers-label">Chauffeurs · actif : {drivers.find((d) => d.id === activeDriver)?.nom}</div>
          {drivers.map((d) => (
            <DriverCard
              key={d.id} d={d} route={routes[d.id]}
              active={d.id === activeDriver}
              dim={!!highlighted && highlighted !== d.id}
              canDelete={drivers.length > 1}
              onSelectActive={setActiveDriver}
              onRename={renameDriver}
              onRemove={removeDriver}
              onHover={setHighlighted}
              onOpen={openDriver}
            />
          ))}
          <div className="add-row">
            <input
              className="add-input" value={newName} placeholder="Nom du chauffeur…"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNew()
              }}
            />
            <button className="add-btn" onClick={submitNew} title="Ajouter un chauffeur" aria-label="Ajouter un chauffeur">
              <IcoPlus />
            </button>
          </div>
        </div>

        <div className="drivers" style={{ paddingTop: 0 }}>
          <StopsPanel
            stops={stops} assign={assign} provider={provider} activeColor={activeColor}
            addStop={addStop} addBulk={addBulk} removeStop={removeStop}
            assignStop={(id) => assignStop(id, activeDriver)}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Ajouter les styles dans `src/styles/app.css`**

Ajouter à la fin du fichier :

```css
/* ---- Chauffeurs : sélection active, renommage, affectation ---- */
.dcard { cursor: pointer; }
.dcard.active { border-color: var(--col); box-shadow: inset 0 0 0 1px var(--col); }
.dcard-name-input {
  flex: 1; min-width: 0; font-family: var(--font-ui); font-size: 15px; font-weight: 600;
  border: 1px solid var(--border-2); border-radius: 6px; padding: 2px 6px;
  background: var(--surface); color: var(--text); letter-spacing: -0.01em;
}
.dcard-name-input:focus { outline: none; border-color: var(--col); }
.dcard-name { cursor: text; }
.stopitem-click { cursor: pointer; transition: border-color .14s, background .14s; }
.stopitem-click:hover { border-color: color-mix(in oklab, var(--col) 45%, var(--border)); }
.stopitem.unassigned { border-style: dashed; }
```

- [ ] **Step 7: Mettre à jour `src/App.tsx`** (retrait de toute dépendance à `dispatched`)

Le `Shell` lit déjà `goDriver` du contexte (qui n'écrit plus `dispatched`). Vérifier que `App.tsx`
n'utilise pas `dispatched`/`setDispatched`. Si une ligne y fait référence, la retirer. Le segmented
control « Vue chauffeur » appelle `goDriver` (inchangé). Aucune autre modification attendue.

Run: `grep -n "dispatched" src/App.tsx || echo "OK App propre"`
Expected: `OK App propre`.

- [ ] **Step 8: Lancer les tests Dispatcher**

Run: `npx vitest run src/components/Dispatcher/`
Expected: PASS (AddressAutocomplete 2 + StopsPanel 2 + useAddressAutocomplete 2).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Dispatcher — gestion chauffeurs + affectation manuelle ; StopsPanel cliquable + styles"
```

---

## Task 11: Câblage final — tsc, build, smoke tests, README

**Files:**
- Modify: `src/App.test.tsx`, `README.md`

- [ ] **Step 1: Mettre à jour `src/App.test.tsx`** (le mock react-leaflet doit inclure `AttributionControl`)

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  AttributionControl: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('affiche le répartiteur et les arrêts seed', () => {
    render(<App />)
    expect(screen.getByText('Répartition des tournées')).toBeInTheDocument()
    expect(screen.getByText('Malakoff')).toBeInTheDocument()
  })

  it('ajoute un chauffeur « Michel »', () => {
    render(<App />)
    const input = screen.getByPlaceholderText('Nom du chauffeur…')
    fireEvent.change(input, { target: { value: 'Michel' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Michel')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le smoke test**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 3: Lancer toute la suite**

Run: `npx vitest run`
Expected: tous les fichiers PASS.

- [ ] **Step 4: Typecheck complet (le vrai gate du refactor DriverId→string)**

Run: `npx tsc -b`
Expected: exit 0. Corriger toute erreur résiduelle (références à l'ancien `DRIVERS` const, à
`d.center`/`d.couleurHex`, à `dispatched`/`setDispatched`, props manquantes). Endroits probables :
`DriverView.tsx`, `DriverPills.tsx`, `Dispatcher.tsx`, `App.tsx`. Aligner sur les nouvelles
signatures définies aux tâches précédentes.

- [ ] **Step 5: Build de production**

Run: `npm run build`
Expected: succès, `dist/` généré.

- [ ] **Step 6: Mettre à jour `README.md`**

Dans la section Architecture, indiquer : chauffeurs **dynamiques** (état persisté `livreur:v2:drivers`,
ajout/renommage/suppression), couleurs via **palette** `--c-1..--c-8`, **affectation manuelle** des
arrêts (chauffeur actif + clic) avec « Répartir par zone » en auto-remplissage, et que l'optimiseur
expose `buildRoutes`/`autoAssign`/`assignToDriver`. Retirer la mention de l'ancien `dispatched`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: câblage final chauffeurs dynamiques + affectation ; tsc/build verts + README"
```

---

## Task 12: Vérification manuelle

**Files:** aucun (vérification)

- [ ] **Step 1: Lancer le dev server**

Run: `npm run dev`

- [ ] **Step 2: Checklist**

- [ ] Ajouter un chauffeur « Michel » (champ « Nom du chauffeur… » + Entrée) → sa carte apparaît avec une nouvelle couleur (violet).
- [ ] Renommer un chauffeur (clic sur le nom → input) ; supprimer un chauffeur (✕) → ses arrêts repassent en gris (non affectés) sur la carte et en pointillés dans la liste.
- [ ] Cliquer une carte chauffeur → devient « ACTIF » (bordure colorée).
- [ ] Cliquer un arrêt dans la liste → il s'affecte au chauffeur actif (pastille colorée) et apparaît dans sa tournée sur la carte ; re-cliquer avec un autre actif → réaffecté.
- [ ] « Répartir par zone » → les arrêts non affectés rejoignent le chauffeur de zone le plus proche, sans toucher aux affectations manuelles.
- [ ] Le **drapeau ukrainien** a disparu du coin bas-droite de la carte (reste « © OpenStreetMap, © CARTO »).
- [ ] Thème clair/sombre, responsive, persistance (rechargement conserve chauffeurs + affectations).

- [ ] **Step 3: Commit éventuel des correctifs**

```bash
git add -A
git commit -m "fix: ajustements post-vérification affectation manuelle"
```

---

## Self-Review (effectué)

- **Couverture spec :** palette+driverColor (T1), DriverId string + Driver/DriverConfig (T2), DEFAULT_DRIVERS sans center (T3), optimiseur buildRoutes/autoAssign/assignToDriver/centroid (T4), contexte drivers+addDriver/renameDriver/removeDriver+activeDriver+assignStop+autoAssign + suppression dispatched (T5), fix drapeau Leaflet (T6), DispatcherMap drivers en prop + non-affectés gris (T7), DriverPills/DriverView via contexte (T8), DriverCard sélection active/renommage/suppression (T9), Dispatcher gestion+affectation + StopsPanel cliquable + styles + App (T10), tsc/build/README (T11), vérif manuelle (T12).
- **Placeholders :** aucun — code complet à chaque étape.
- **Cohérence des types :** `DriverConfig{id,nom,colorIndex}`, `Driver=DriverConfig&{couleur}`, `Routes=Record<string,RouteResult>`. Contexte expose `drivers`, `activeDriver`, `setActiveDriver`, `assignStop(stopId,driverId|null)`, `autoAssign()`, `addDriver/renameDriver/removeDriver`. `DispatcherMap` prend `drivers` (T7) ; `Dispatcher` le fournit (T10). `DriverCard` props (active/canDelete/onSelectActive/onRename/onRemove) cohérentes T9↔T10. `StopsPanel` props (activeColor, assignStop:(id)=>void) cohérentes T10 (le contexte fournit `assignStop(id, activeDriver)`). `buildRoutes/autoAssign/assignToDriver/centroid` signatures identiques T4↔T5. `driverColor/nextColorIndex/PALETTE_SIZE` T1↔T5. Plus aucune référence au const `DRIVERS`, à `d.center`, `couleurHex`, `dispatched`.
