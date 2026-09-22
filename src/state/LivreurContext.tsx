import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { Livreur, Section, Stop, Suggestion, Theme, Tournee } from '../types'
import { driverColor } from '../data/palette'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { makeStopId } from '../services/stopId'
import { computeRoute, optimizeTrip } from '../services/routing'
import { sameStopOrder, sortStopsByTime } from '../lib/stopOrder'
import { api, ConflitError } from '../services/api'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()

/** Champs de tournée persistables en plus des stops/route (heures, verrou d'ordre, péage). */
type TourneeExtra = {
  departHeure?: string; retourHeure?: string; ordreManuel?: boolean; sansPeage?: boolean
}

/**
 * Mode d'itinéraire à utiliser pour un recalcul : celui que la bascule vient d'imposer,
 * sinon celui stocké sur la tournée, sinon le défaut (sans péage).
 * Pure et hors composant : rien à réinstancier à chaque rendu.
 */
const modeOf = (t: Tournee | undefined, extra?: TourneeExtra) => ({
  sansPeage: extra?.sansPeage ?? t?.sansPeage ?? true,
})

/** Ce qu'une écriture de tournée peut modifier (la version est ajoutée par `ecrireTournee`). */
type PatchTournee = {
  livreurId?: string; date?: string; stops?: Stop[]; route?: Tournee['route'] | null
} & TourneeExtra

/**
 * Réduit le résumé de synchro à un seul nombre comparable : « le serveur a-t-il bougé ? ».
 * Le nombre de livreurs vivants tient sur les unités, l'horodatage occupe le reste.
 */
const clefSync = (stamp: number, livreurs: number) => stamp * 1000 + livreurs

/** Intervalle de sondage : assez court pour ne pas travailler longtemps sur une vue périmée. */
const PERIODE_SONDAGE_MS = 60_000

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
  setSansPeage: (tourneeId: string, sansPeage: boolean) => Promise<void>
  removeAdresse: (id: string) => Promise<void>
  recharger: () => Promise<void>
  restaurer: (id: string, type: 'tournee' | 'livreur') => Promise<void>
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

  // Écritures en vol : on ne sonde pas tant qu'une requête est en cours, sinon un état
  // serveur antérieur écraserait brièvement une mise à jour optimiste pas encore confirmée.
  const enVol = useRef(0)
  // Dernier résumé de synchro vu (clefSync), pour ne recharger que sur un vrai changement.
  const dernierStamp = useRef(0)

  /** Encadre une écriture serveur : le sondage se tait tant qu'elle est en vol. */
  const ecrire = useCallback(async <T,>(appel: () => Promise<T>): Promise<T> => {
    enVol.current++
    try { return await appel() } finally { enVol.current-- }
  }, [])

  /**
   * Note le résumé serveur comme « déjà vu ». Appelé après chaque lecture complète de
   * l'état — dont le tout premier chargement : sans cet amorçage, le marqueur partirait
   * de 0, le premier sondage verrait forcément une différence et rapatrierait les 3,4 Mo
   * de `/api/state` pour rien.
   */
  const marquerVu = useCallback(async () => {
    try {
      const { stamp, livreurs: n } = await api.getSync()
      dernierStamp.current = clefSync(stamp, n)
    } catch { /* hors-ligne : au pire un sondage rechargera une fois pour rien */ }
  }, [])

  /** Relit tout l'état serveur et l'adopte tel quel (il fait foi). */
  const recharger = useCallback(async () => {
    const s = await api.getState()
    setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses)
    await marquerVu()
  }, [marquerVu])

  // chargement initial, puis amorçage du marqueur de sondage
  useEffect(() => {
    let alive = true
    api.getState()
      .then(async (s) => {
        if (!alive) return
        setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses)
        await marquerVu()
      })
      .catch(() => { if (alive) setError('Chargement impossible. Vérifiez votre connexion et rechargez.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [marquerVu])

  /**
   * Sonde le résumé (quelques octets) plutôt que l'état complet (3,4 Mo), et ne recharge
   * que si le serveur a effectivement bougé. Le marqueur est posé avant le rechargement :
   * un second sondage déclenché entre-temps ne relance pas une deuxième lecture complète.
   */
  const sonder = useCallback(async () => {
    if (enVol.current > 0 || document.visibilityState !== 'visible') return
    try {
      const { stamp, livreurs: n } = await api.getSync()
      const clef = clefSync(stamp, n)
      if (clef === dernierStamp.current) return
      // Une écriture a pu partir pendant le sondage : on laisse le marqueur intact (donc
      // ce changement sera revu au prochain tour) plutôt que d'écraser une mise à jour
      // optimiste encore en vol avec un état serveur qui la précède.
      if (enVol.current > 0) return
      dernierStamp.current = clef
      await recharger()
    } catch { /* hors-ligne : on retentera au prochain tour */ }
  }, [recharger])

  useEffect(() => {
    const onVisible = () => { void sonder() }
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(() => { void sonder() }, PERIODE_SONDAGE_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [sonder])

  const livreurs = useMemo<LivreurWithColor[]>(
    () => livreursRaw.map((l) => ({ ...l, couleur: driverColor(l.colorIndex) })),
    [livreursRaw],
  )

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [setTheme])
  const dismissError = useCallback(() => setError(null), [])

  /**
   * Traite l'échec d'une écriture. Un refus typé du serveur (version périmée ou tournée
   * partie à la corbeille) n'est pas une panne : l'appelant vient d'annuler sa mise à jour
   * optimiste, on prévient dans les mots de l'utilisateur et on relit la vérité du serveur
   * — l'écran ne doit jamais rester sur une modification que le serveur a refusée.
   */
  const fail = useCallback((e: unknown) => {
    if (e instanceof ConflitError) {
      setError(
        e.type === 'conflit'
          ? 'Cette tournée a été modifiée ailleurs. Les données ont été rechargées.'
          : 'Cette tournée a été supprimée ailleurs. Les données ont été rechargées.',
      )
      void recharger()
      return
    }
    setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
  }, [recharger])

  /**
   * Écriture d'une tournée. Elle porte la version détenue localement — c'est elle qui arme
   * le verrou optimiste : sans version, le serveur écrit sans contrôle et le travail de
   * l'autre poste peut être écrasé en silence. La version renvoyée remplace aussitôt celle
   * de l'état, sinon l'écriture suivante repartirait d'une version périmée et se
   * refuserait elle-même.
   */
  const ecrireTournee = useCallback(async (id: string, patch: PatchTournee, version?: number) => {
    const rendue = await ecrire(() => api.updateTournee(id, { ...patch, version }))
    setTournees((p) => p.map((t) => (t.id === id ? { ...t, version: rendue.version } : t)))
  }, [ecrire])

  const restaurer = useCallback(async (id: string, type: 'tournee' | 'livreur') => {
    try {
      await ecrire(() => api.restore(id, type))
      await recharger()
    } catch (e) { fail(e) }
  }, [ecrire, recharger, fail])

  const addLivreur = useCallback(async (input: LivreurInput) => {
    if (!input.nom.trim() || !input.prenom.trim()) return
    const prev = livreursRaw
    try {
      const created = await ecrire(() => api.createLivreur({
        nom: input.nom.trim(), prenom: input.prenom.trim(), telephone: input.telephone.trim(),
      }))
      setLivreursRaw((p) => [...p, created])
    } catch (e) {
      setLivreursRaw(prev)
      fail(e)
    }
  }, [livreursRaw, ecrire, fail])

  const updateLivreur = useCallback(async (id: string, patch: Partial<LivreurInput>) => {
    const prev = livreursRaw
    setLivreursRaw((p) => p.map((l) => (l.id === id ? {
      ...l,
      ...(patch.nom !== undefined ? { nom: patch.nom.trim() } : {}),
      ...(patch.prenom !== undefined ? { prenom: patch.prenom.trim() } : {}),
      ...(patch.telephone !== undefined ? { telephone: patch.telephone.trim() } : {}),
    } : l)))
    try { await ecrire(() => api.updateLivreur(id, patch)) } catch (e) { setLivreursRaw(prev); fail(e) }
  }, [livreursRaw, ecrire, fail])

  const removeLivreur = useCallback(async (id: string) => {
    const prevL = livreursRaw, prevT = tournees
    setLivreursRaw((p) => p.filter((l) => l.id !== id))
    setTournees((p) => p.filter((t) => t.livreurId !== id))
    try { await ecrire(() => api.deleteLivreur(id)) } catch (e) { setLivreursRaw(prevL); setTournees(prevT); fail(e) }
  }, [livreursRaw, tournees, ecrire, fail])

  const addTournee = useCallback(async (input: { livreurId: string; date: string }) => {
    try {
      const created = await ecrire(() => api.createTournee(input))
      setTournees((p) => [...p, created])
      return created.id
    } catch (e) { fail(e); return '' }
  }, [ecrire, fail])

  // Crée une copie d'une tournée (mêmes date/arrêts, arrêts ré-identifiés) pour un autre livreur.
  const duplicateTournee = useCallback(async (sourceId: string, livreurId: string) => {
    const src = tournees.find((t) => t.id === sourceId)
    if (!src) return ''
    try {
      const created = await ecrire(() => api.createTournee({ livreurId, date: src.date }))
      const stops = src.stops.map((s) => ({ ...s, id: makeStopId() }))
      const route = src.route
      const heures = {
        departHeure: src.departHeure,
        retourHeure: src.retourHeure,
        ordreManuel: src.ordreManuel,
      }
      setTournees((p) => [...p, { ...created, stops, route, ...heures }])
      // La copie vient de naître : sa version est celle que le serveur vient de donner.
      await ecrireTournee(created.id, { stops, route: route ?? null, ...heures }, created.version)
      return created.id
    } catch (e) { fail(e); return '' }
  }, [tournees, ecrire, ecrireTournee, fail])

  const updateTournee = useCallback(async (id: string, patch: { livreurId?: string; date?: string }) => {
    const prev = tournees
    setTournees((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      await ecrireTournee(id, patch, prev.find((t) => t.id === id)?.version)
    } catch (e) { setTournees(prev); fail(e) }
  }, [tournees, ecrireTournee, fail])

  const removeTournee = useCallback(async (id: string) => {
    const prev = tournees
    setTournees((p) => p.filter((t) => t.id !== id))
    try { await ecrire(() => api.deleteTournee(id)) } catch (e) { setTournees(prev); fail(e) }
  }, [tournees, ecrire, fail])

  // Persiste stops + route (+ champs annexes) d'une tournée donnée.
  const persistStops = useCallback(
    async (id: string, stops: Stop[], route: Tournee['route'], prev: Tournee[], extra?: TourneeExtra) => {
      try {
        // `prev` est l'état d'avant la mise à jour optimiste : c'est là que vit la
        // version réellement détenue (une mise à jour optimiste n'en invente pas).
        await ecrireTournee(id, { stops, route: route ?? null, ...extra }, prev.find((x) => x.id === id)?.version)
      } catch (e) { setTournees(prev); fail(e) }
    },
    [ecrireTournee, fail],
  )

  // Applique un nouvel ordre d'arrêts : maj optimiste, recalcul du trajet, persistance.
  const recompute = useCallback(
    async (tourneeId: string, stops: Stop[], prev: Tournee[], extra?: TourneeExtra) => {
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, ...extra, stops, route: undefined } : x)))
      const route = await computeRoute(stops, modeOf(prev.find((x) => x.id === tourneeId), extra))
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
      try {
        await ecrireTournee(tourneeId, { stops, route, ...extra }, prev.find((x) => x.id === tourneeId)?.version)
      } catch (e) { setTournees(prev); fail(e) }
    },
    [ecrireTournee, fail],
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
      ecrire(() => api.upsertAdresse({
        id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng,
      })).catch(() => {})
    }
    await recompute(tourneeId, stops, prev)
  }, [tournees, adresses, ecrire, recompute])

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
      try {
        await ecrireTournee(tourneeId, norm, prev.find((x) => x.id === tourneeId)?.version)
      } catch (e) { setTournees(prev); fail(e) }
    },
    [tournees, ecrireTournee, fail],
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
    const { order, route } = await optimizeTrip(t.stops, modeOf(t))
    const stops = order.map((i) => t.stops[i])
    // L'optimisation géographique impose un ordre : on le considère comme manuel.
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops, route, ordreManuel: true } : x)))
    await persistStops(tourneeId, stops, route, prev, { ordreManuel: true })
  }, [tournees, persistStops])

  const refreshRoute = useCallback(async (tourneeId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const route = await computeRoute(t.stops, modeOf(t))
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
    await persistStops(tourneeId, t.stops, route, prev)
  }, [tournees, persistStops])

  /** Bascule péage / sans péage : recalcule l'itinéraire dans le nouveau mode et le persiste. */
  const setSansPeage = useCallback(async (tourneeId: string, sansPeage: boolean) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    await recompute(tourneeId, t.stops, prev, { sansPeage })
  }, [tournees, recompute])

  const removeAdresse = useCallback(async (id: string) => {
    const prev = adresses
    setAdresses((p) => p.filter((a) => a.id !== id))
    try { await ecrire(() => api.deleteAdresse(id)) } catch (e) { setAdresses(prev); fail(e) }
  }, [adresses, ecrire, fail])

  const value: LivreurState = {
    theme, section, loading, error, livreurs, tournees, adresses, provider: defaultProvider,
    reduceMotion: !!reduceMotion, toggleTheme, setSection, dismissError,
    addLivreur, updateLivreur, removeLivreur,
    addTournee, duplicateTournee, updateTournee, removeTournee,
    addStopToTournee, removeStopFromTournee, reorderStops,
    setStopHeure, setTourneeHeure, sortTourneeByTime,
    optimizeTournee, refreshRoute, setSansPeage, removeAdresse,
    recharger, restaurer,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
