import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import type { Livreur, Section, Stop, Suggestion, Theme, Tournee } from '../types'
import { driverColor } from '../data/palette'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { makeStopId } from '../services/stopId'
import { computeRoute, optimizeTrip } from '../services/routing'
import { sameStopOrder, sortStopsByTime } from '../lib/stopOrder'
import { api } from '../services/api'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()

export interface LivreurInput { nom: string; prenom: string; telephone: string }
export type LivreurWithColor = Livreur & { couleur: string }

export interface LivreurState {
  theme: Theme
  section: Section
  loading: boolean
  error: string | null
  livreurs: LivreurWithColor[]
  tournees: Tournee[]
  adresses: Suggestion[]
  provider: AddressProvider
  reduceMotion: boolean
  toggleTheme: () => void
  setSection: (s: Section) => void
  dismissError: () => void
  addLivreur: (input: LivreurInput) => Promise<void>
  updateLivreur: (id: string, patch: Partial<LivreurInput>) => Promise<void>
  removeLivreur: (id: string) => Promise<void>
  addTournee: (input: { livreurId: string; date: string }) => Promise<string>
  duplicateTournee: (sourceId: string, livreurId: string) => Promise<string>
  updateTournee: (id: string, patch: { livreurId?: string; date?: string }) => Promise<void>
  removeTournee: (id: string) => Promise<void>
  addStopToTournee: (tourneeId: string, s: Suggestion) => Promise<void>
  removeStopFromTournee: (tourneeId: string, stopId: string) => Promise<void>
  reorderStops: (tourneeId: string, from: number, to: number) => Promise<void>
  setStopHeure: (tourneeId: string, stopId: string, heure: string) => Promise<void>
  setTourneeHeure: (tourneeId: string, patch: { departHeure?: string; retourHeure?: string }) => Promise<void>
  sortTourneeByTime: (tourneeId: string) => Promise<void>
  optimizeTournee: (tourneeId: string) => Promise<void>
  refreshRoute: (tourneeId: string) => Promise<void>
  removeAdresse: (id: string) => Promise<void>
}

const Ctx = createContext<LivreurState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components -- hook colocalisé avec son provider
export function useLivreur(): LivreurState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLivreur doit être utilisé dans <LivreurProvider>')
  return v
}

export function LivreurProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<Theme>('theme', 'light')
  const [section, setSection] = usePersistentState<Section>('section', 'tournees')
  const [livreursRaw, setLivreursRaw] = useState<Livreur[]>([])
  const [tournees, setTournees] = useState<Tournee[]>([])
  const [adresses, setAdresses] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])

  // chargement initial
  useEffect(() => {
    let alive = true
    api.getState()
      .then((s) => { if (alive) { setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses) } })
      .catch(() => { if (alive) setError('Chargement impossible. Vérifiez votre connexion et rechargez.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const livreurs = useMemo<LivreurWithColor[]>(
    () => livreursRaw.map((l) => ({ ...l, couleur: driverColor(l.colorIndex) })),
    [livreursRaw],
  )

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [setTheme])
  const dismissError = useCallback(() => setError(null), [])
  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : 'Échec de l’enregistrement'), [])

  const addLivreur = useCallback(async (input: LivreurInput) => {
    if (!input.nom.trim() || !input.prenom.trim()) return
    const prev = livreursRaw
    try {
      const created = await api.createLivreur({
        nom: input.nom.trim(), prenom: input.prenom.trim(), telephone: input.telephone.trim(),
      })
      setLivreursRaw((p) => [...p, created])
    } catch (e) {
      setLivreursRaw(prev)
      fail(e)
    }
  }, [livreursRaw, fail])

  const updateLivreur = useCallback(async (id: string, patch: Partial<LivreurInput>) => {
    const prev = livreursRaw
    setLivreursRaw((p) => p.map((l) => (l.id === id ? {
      ...l,
      ...(patch.nom !== undefined ? { nom: patch.nom.trim() } : {}),
      ...(patch.prenom !== undefined ? { prenom: patch.prenom.trim() } : {}),
      ...(patch.telephone !== undefined ? { telephone: patch.telephone.trim() } : {}),
    } : l)))
    try { await api.updateLivreur(id, patch) } catch (e) { setLivreursRaw(prev); fail(e) }
  }, [livreursRaw, fail])

  const removeLivreur = useCallback(async (id: string) => {
    const prevL = livreursRaw, prevT = tournees
    setLivreursRaw((p) => p.filter((l) => l.id !== id))
    setTournees((p) => p.filter((t) => t.livreurId !== id))
    try { await api.deleteLivreur(id) } catch (e) { setLivreursRaw(prevL); setTournees(prevT); fail(e) }
  }, [livreursRaw, tournees, fail])

  const addTournee = useCallback(async (input: { livreurId: string; date: string }) => {
    try {
      const created = await api.createTournee(input)
      setTournees((p) => [...p, created])
      return created.id
    } catch (e) { fail(e); return '' }
  }, [fail])

  // Crée une copie d'une tournée (mêmes date/arrêts, arrêts ré-identifiés) pour un autre livreur.
  const duplicateTournee = useCallback(async (sourceId: string, livreurId: string) => {
    const src = tournees.find((t) => t.id === sourceId)
    if (!src) return ''
    try {
      const created = await api.createTournee({ livreurId, date: src.date })
      const stops = src.stops.map((s) => ({ ...s, id: makeStopId() }))
      const route = src.route
      const heures = {
        departHeure: src.departHeure,
        retourHeure: src.retourHeure,
        ordreManuel: src.ordreManuel,
      }
      setTournees((p) => [...p, { ...created, stops, route, ...heures }])
      await api.updateTournee(created.id, { stops, route: route ?? null, ...heures })
      return created.id
    } catch (e) { fail(e); return '' }
  }, [tournees, fail])

  const updateTournee = useCallback(async (id: string, patch: { livreurId?: string; date?: string }) => {
    const prev = tournees
    setTournees((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try { await api.updateTournee(id, patch) } catch (e) { setTournees(prev); fail(e) }
  }, [tournees, fail])

  const removeTournee = useCallback(async (id: string) => {
    const prev = tournees
    setTournees((p) => p.filter((t) => t.id !== id))
    try { await api.deleteTournee(id) } catch (e) { setTournees(prev); fail(e) }
  }, [tournees, fail])

  // Champs de tournée persistables en plus des stops/route (heures, verrou d'ordre).
  type TourneeExtra = { departHeure?: string; retourHeure?: string; ordreManuel?: boolean }

  // Persiste stops + route (+ champs annexes) d'une tournée donnée.
  const persistStops = useCallback(
    async (id: string, stops: Stop[], route: Tournee['route'], prev: Tournee[], extra?: TourneeExtra) => {
      try {
        await api.updateTournee(id, { stops, route: route ?? null, ...extra })
      } catch (e) { setTournees(prev); fail(e) }
    },
    [fail],
  )

  // Applique un nouvel ordre d'arrêts : maj optimiste, recalcul du trajet (OSRM /route), persistance.
  const recompute = useCallback(
    async (tourneeId: string, stops: Stop[], prev: Tournee[], extra?: TourneeExtra) => {
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, ...extra, stops, route: undefined } : x)))
      const route = await computeRoute(stops)
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
      try {
        await api.updateTournee(tourneeId, { stops, route, ...extra })
      } catch (e) { setTournees(prev); fail(e) }
    },
    [fail],
  )

  const addStopToTournee = useCallback(async (tourneeId: string, s: Suggestion) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stop: Stop = { id: makeStopId(), label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }
    // Ordre chronologique par défaut ; on respecte un ordre figé manuellement.
    const stops = t.ordreManuel ? [...t.stops, stop] : sortStopsByTime([...t.stops, stop])
    if (!adresses.some((a) => a.id === s.id)) {
      setAdresses((p) => [...p, { id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }])
      api.upsertAdresse({ id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }).catch(() => {})
    }
    await recompute(tourneeId, stops, prev)
  }, [tournees, adresses, recompute])

  const removeStopFromTournee = useCallback(async (tourneeId: string, stopId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stops = t.stops.filter((s) => s.id !== stopId)
    await recompute(tourneeId, stops, prev)
  }, [tournees, recompute])

  // Glisser-déposer : fige l'ordre manuellement (ordreManuel = true).
  const reorderStops = useCallback(async (tourneeId: string, from: number, to: number) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stops = t.stops.slice()
    const [m] = stops.splice(from, 1)
    stops.splice(to, 0, m)
    await recompute(tourneeId, stops, prev, { ordreManuel: true })
  }, [tournees, recompute])

  // Édite l'heure de livraison d'un arrêt ; re-trie si l'ordre est en mode auto.
  const setStopHeure = useCallback(async (tourneeId: string, stopId: string, heure: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const updated = t.stops.map((s) => (s.id === stopId ? { ...s, heure: heure || undefined } : s))
    const stops = t.ordreManuel ? updated : sortStopsByTime(updated)
    if (sameStopOrder(stops, t.stops)) {
      // L'ordre ne bouge pas : le trajet est inchangé, on persiste juste les heures.
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops } : x)))
      await persistStops(tourneeId, stops, t.route, prev)
    } else {
      await recompute(tourneeId, stops, prev)
    }
  }, [tournees, persistStops, recompute])

  // Bornes dépôt (départ/retour) : champs de tournée, sans impact sur le trajet.
  const setTourneeHeure = useCallback(
    async (tourneeId: string, patch: { departHeure?: string; retourHeure?: string }) => {
      const prev = tournees
      const norm: TourneeExtra = {}
      if (patch.departHeure !== undefined) norm.departHeure = patch.departHeure || undefined
      if (patch.retourHeure !== undefined) norm.retourHeure = patch.retourHeure || undefined
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, ...norm } : x)))
      try { await api.updateTournee(tourneeId, norm) } catch (e) { setTournees(prev); fail(e) }
    },
    [tournees, fail],
  )

  // Rebascule en tri chronologique automatique (annule l'ordre manuel).
  const sortTourneeByTime = useCallback(async (tourneeId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stops = sortStopsByTime(t.stops)
    await recompute(tourneeId, stops, prev, { ordreManuel: false })
  }, [tournees, recompute])

  const optimizeTournee = useCallback(async (tourneeId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const { order, route } = await optimizeTrip(t.stops)
    const stops = order.map((i) => t.stops[i])
    // L'optimisation géographique impose un ordre : on le considère comme manuel.
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops, route, ordreManuel: true } : x)))
    await persistStops(tourneeId, stops, route, prev, { ordreManuel: true })
  }, [tournees, persistStops])

  const refreshRoute = useCallback(async (tourneeId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const route = await computeRoute(t.stops)
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
    await persistStops(tourneeId, t.stops, route, prev)
  }, [tournees, persistStops])

  const removeAdresse = useCallback(async (id: string) => {
    const prev = adresses
    setAdresses((p) => p.filter((a) => a.id !== id))
    try { await api.deleteAdresse(id) } catch (e) { setAdresses(prev); fail(e) }
  }, [adresses, fail])

  const value: LivreurState = {
    theme, section, loading, error, livreurs, tournees, adresses, provider: defaultProvider,
    reduceMotion: !!reduceMotion, toggleTheme, setSection, dismissError,
    addLivreur, updateLivreur, removeLivreur,
    addTournee, duplicateTournee, updateTournee, removeTournee,
    addStopToTournee, removeStopFromTournee, reorderStops,
    setStopHeure, setTourneeHeure, sortTourneeByTime,
    optimizeTournee, refreshRoute, removeAdresse,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
