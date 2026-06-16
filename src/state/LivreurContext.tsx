import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  // tournées
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
