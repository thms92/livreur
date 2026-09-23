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
  /** Livreurs actifs : les listes et les sélecteurs d'affectation ne voient que ceux-là. */
  livreurs: LivreurWithColor[]
  /** Tous les livreurs, corbeille comprise : sert à nommer le livreur d'une tournée. */
  livreursTous: LivreurWithColor[]
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
  // Nombre total d'écritures lancées depuis le démarrage. Sert de jeton : une lecture
  // complète qui voit ce compteur bouger sait qu'elle a doublé une écriture et s'abstient.
  const ecrituresLancees = useRef(0)
  // Dernier résumé de synchro vu (clefSync), pour ne recharger que sur un vrai changement.
  const dernierStamp = useRef(0)
  // Version détenue pour chaque tournée. Elle vit dans une ref, pas dans l'état React :
  // il faut pouvoir la lire à l'instant de l'envoi (une copie figée dans la closure d'un
  // appelant serait déjà périmée si une autre écriture est passée entre-temps) et elle ne
  // doit pas être emportée par l'annulation optimiste d'une écriture voisine.
  const versions = useRef(new Map<string, number>())
  // Une écriture en cours par tournée : deux modifications rapprochées sur la même tournée
  // partent l'une après l'autre, sinon la seconde emporterait la version d'avant la
  // première et le serveur la refuserait — un conflit avec soi-même.
  const filesEcriture = useRef(new Map<string, Promise<unknown>>())

  /** Enregistre les versions détenues d'après un état serveur complet. */
  const adopterVersions = useCallback((ts: Tournee[]) => {
    const m = new Map<string, number>()
    for (const t of ts) if (t.version !== undefined) m.set(t.id, t.version)
    versions.current = m
  }, [])

  /** Encadre une écriture serveur : le sondage se tait tant qu'elle est en vol. */
  const ecrire = useCallback(async <T,>(appel: () => Promise<T>): Promise<T> => {
    enVol.current++
    ecrituresLancees.current++
    try { return await appel() } finally { enVol.current-- }
  }, [])

  /** Lit le résumé de synchro, réduit en clef ; `undefined` si le serveur est injoignable. */
  const lireResume = useCallback(async (): Promise<number | undefined> => {
    try {
      const { stamp, livreurs: n } = await api.getSync()
      return clefSync(stamp, n)
    } catch { return undefined }
  }, [])

  /**
   * Relit tout l'état serveur et l'adopte — sauf si une écriture est partie pendant la
   * lecture. `/api/state` pèse 3,4 Mo et met plusieurs secondes : une modification faite
   * pendant ce temps n'est pas forcément dans la réponse, et l'adopter l'effacerait de
   * l'écran alors qu'elle est bel et bien enregistrée, sans que rien ne la ramène.
   * Renvoie `true` si l'état a été adopté.
   */
  const relire = useCallback(async (): Promise<boolean> => {
    const jeton = ecrituresLancees.current
    const s = await api.getState()
    if (ecrituresLancees.current !== jeton || enVol.current > 0) return false
    setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses)
    adopterVersions(s.tournees)
    return true
  }, [adopterVersions])

  const recharger = useCallback(async () => { await relire() }, [relire])

  // Chargement initial. Le résumé est lu AVANT l'état : le marqueur ne doit jamais être
  // plus récent que l'état qu'il marque, sinon un changement arrivé pendant le chargement
  // serait tenu pour déjà vu et n'apparaîtrait jamais. Sans cet amorçage, à l'inverse, le
  // marqueur partirait de 0 et le premier sondage rapatrierait les 3,4 Mo pour rien.
  useEffect(() => {
    let alive = true
    void (async () => {
      const clef = await lireResume()
      try {
        const s = await api.getState()
        if (!alive) return
        setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses)
        adopterVersions(s.tournees)
        if (clef !== undefined) dernierStamp.current = clef
      } catch {
        if (alive) setError('Chargement impossible. Vérifiez votre connexion et rechargez.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [lireResume, adopterVersions])

  /**
   * Sonde le résumé (quelques octets) plutôt que l'état complet (3,4 Mo), et ne recharge
   * que si le serveur a effectivement bougé. Le marqueur est posé avant la lecture — il ne
   * doit jamais être plus récent qu'elle — et repris si la lecture échoue ou n'est pas
   * adoptée : un rechargement raté qui laisserait le changement marqué « vu » le rendrait
   * invisible pour de bon. Un rechargement en trop coûte de la bande passante ; un
   * changement manqué est une perte.
   */
  const sonder = useCallback(async () => {
    if (enVol.current > 0 || document.visibilityState !== 'visible') return
    const clef = await lireResume()
    if (clef === undefined || clef === dernierStamp.current) return
    if (enVol.current > 0) return // une écriture est partie pendant le sondage
    const precedent = dernierStamp.current
    dernierStamp.current = clef // un second sondage ne relance pas la même lecture
    let adopte = false
    try {
      adopte = await relire()
    } catch { /* hors-ligne : on retentera au prochain tour */ } finally {
      if (!adopte && dernierStamp.current === clef) dernierStamp.current = precedent
    }
  }, [lireResume, relire])

  useEffect(() => {
    const onVisible = () => { void sonder() }
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(() => { void sonder() }, PERIODE_SONDAGE_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [sonder])

  // Deux vues : les actifs pilotent les listes et l'affectation ; la liste complète
  // sert à résoudre le nom d'un livreur sur une tournée ancienne, même après son retrait.
  const livreursTous = useMemo<LivreurWithColor[]>(
    () => livreursRaw.map((l) => ({ ...l, couleur: driverColor(l.colorIndex) })),
    [livreursRaw],
  )
  const livreurs = useMemo<LivreurWithColor[]>(
    () => livreursTous.filter((l) => !l.deletedAt),
    [livreursTous],
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
      const cause = e.type === 'conflit'
        ? 'Cette tournée a été modifiée ailleurs.'
        : 'Cette tournée a été supprimée ailleurs.'
      // Le bandeau ne promet pas ce qui n'a pas encore eu lieu : la relecture est lancée,
      // elle peut échouer (réseau coupé au moment du refus) ou renoncer à adopter (une
      // écriture est repartie entre-temps). Son rejet est rattrapé — sans quoi il partait
      // en rejet non traité — et l'échec se dit, au lieu de laisser croire à une remise
      // à jour qui n'a pas eu lieu.
      setError(`${cause} Votre modification n’a pas été enregistrée ; relecture des données en cours.`)
      void recharger().catch(() => {
        setError(
          `${cause} Votre modification n’a pas été enregistrée, et les données n’ont pas pu` +
          ' être relues : vérifiez votre connexion.',
        )
      })
      return
    }
    setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
  }, [recharger])

  /**
   * Écriture d'une tournée. Elle porte la version détenue — c'est elle qui arme le verrou
   * optimiste : sans version, le serveur écrit sans contrôle et le travail de l'autre poste
   * peut être écrasé en silence. Cette version est lue dans `versions` à l'instant de
   * l'envoi, et l'écriture attend celle qui la précède sur la même tournée : partir avec
   * une version d'avant une écriture à nous provoquerait un 409 qui accuserait l'autre
   * poste à tort, annulerait le travail de l'utilisateur et déclencherait un rechargement.
   * La version renvoyée est rangée aussitôt, pour l'écriture suivante.
   */
  const ecrireTournee = useCallback(async (id: string, patch: PatchTournee) => {
    const precedente = filesEcriture.current.get(id)
    const envoi = (async () => {
      if (precedente) await precedente // son échec est déjà neutralisé (cf. ci-dessous)
      const rendue = await ecrire(() => api.updateTournee(id, { ...patch, version: versions.current.get(id) }))
      versions.current.set(id, rendue.version)
      setTournees((p) => p.map((t) => (t.id === id ? { ...t, version: rendue.version } : t)))
    })()
    // La file ne retient qu'un jalon d'ordre : un échec y est neutralisé pour ne pas
    // entraîner l'écriture suivante, qui a son propre `catch` chez son appelant.
    filesEcriture.current.set(id, envoi.catch(() => {}))
    await envoi
  }, [ecrire])

  /**
   * Annule la mise à jour optimiste d'UNE tournée, à sa place d'origine. On ne restaure
   * pas le tableau entier : les autres tournées ont pu voir leur version rafraîchie par
   * une écriture voisine réussie, et la repousser armerait là-bas le faux conflit qu'on
   * vient d'éviter ici.
   */
  const annuler = useCallback((id: string, prev: Tournee[]) => {
    const i = prev.findIndex((t) => t.id === id)
    setTournees((p) => {
      const autres = p.filter((t) => t.id !== id)
      if (i < 0) return autres // elle n'existait pas avant l'écriture ratée
      const avant: Tournee = { ...prev[i], version: versions.current.get(id) ?? prev[i].version }
      autres.splice(Math.min(i, autres.length), 0, avant)
      return autres
    })
  }, [])

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

  /**
   * Mise à la corbeille d'un livreur. Le serveur le marque et garde ses tournées : la
   * mise à jour optimiste doit faire de même, sinon l'écran cascade là où le serveur ne
   * cascade plus — les tournées disparaîtraient pour revenir seules au prochain sondage,
   * et l'écran démentirait la confirmation qu'il vient d'afficher. Le marqueur local suffit
   * à le sortir des listes ; l'horodatage exact viendra du serveur à la prochaine lecture.
   */
  const removeLivreur = useCallback(async (id: string) => {
    const prevL = livreursRaw
    setLivreursRaw((p) => p.map((l) => (l.id === id ? { ...l, deletedAt: Date.now() } : l)))
    try { await ecrire(() => api.deleteLivreur(id)) } catch (e) { setLivreursRaw(prevL); fail(e) }
  }, [livreursRaw, ecrire, fail])

  const addTournee = useCallback(async (input: { livreurId: string; date: string }) => {
    try {
      const created = await ecrire(() => api.createTournee(input))
      if (created.version !== undefined) versions.current.set(created.id, created.version)
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
      // La copie vient de naître : sa version est celle que le serveur vient de donner.
      if (created.version !== undefined) versions.current.set(created.id, created.version)
      const stops = src.stops.map((s) => ({ ...s, id: makeStopId() }))
      const route = src.route
      const heures = {
        departHeure: src.departHeure,
        retourHeure: src.retourHeure,
        ordreManuel: src.ordreManuel,
      }
      setTournees((p) => [...p, { ...created, stops, route, ...heures }])
      await ecrireTournee(created.id, { stops, route: route ?? null, ...heures })
      return created.id
    } catch (e) { fail(e); return '' }
  }, [tournees, ecrire, ecrireTournee, fail])

  const updateTournee = useCallback(async (id: string, patch: { livreurId?: string; date?: string }) => {
    const prev = tournees
    setTournees((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      await ecrireTournee(id, patch)
    } catch (e) { annuler(id, prev); fail(e) }
  }, [tournees, ecrireTournee, annuler, fail])

  const removeTournee = useCallback(async (id: string) => {
    const prev = tournees
    setTournees((p) => p.filter((t) => t.id !== id))
    try { await ecrire(() => api.deleteTournee(id)) } catch (e) { annuler(id, prev); fail(e) }
  }, [tournees, ecrire, annuler, fail])

  // Persiste stops + route (+ champs annexes) d'une tournée donnée.
  const persistStops = useCallback(
    async (id: string, stops: Stop[], route: Tournee['route'], prev: Tournee[], extra?: TourneeExtra) => {
      try {
        await ecrireTournee(id, { stops, route: route ?? null, ...extra })
      } catch (e) { annuler(id, prev); fail(e) }
    },
    [ecrireTournee, annuler, fail],
  )

  // Applique un nouvel ordre d'arrêts : maj optimiste, recalcul du trajet, persistance.
  const recompute = useCallback(
    async (tourneeId: string, stops: Stop[], prev: Tournee[], extra?: TourneeExtra) => {
      // La mise à jour optimiste ci-dessous précède l'appel réseau (`ecrire`, dans
      // `ecrireTournee`) de plusieurs secondes — le temps que `computeRoute` réponde.
      // `enVol` doit donc être levé dès ici, pas seulement pendant l'appel réseau : sinon
      // `relire()`, qui ne regarde `enVol` qu'une fois sa propre lecture terminée, ne
      // verrait rien en cours pendant cette fenêtre et effacerait une modification pas
      // encore envoyée. `ecrituresLancees` couvre le cas complémentaire (l'édition démarre
      // *et* se termine pendant la lecture de `relire`) ; les deux compteurs sont
      // nécessaires, l'un pour « en cours maintenant », l'autre pour « un événement a eu
      // lieu pendant l'attente ».
      enVol.current++
      ecrituresLancees.current++
      try {
        setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, ...extra, stops, route: undefined } : x)))
        const route = await computeRoute(stops, modeOf(prev.find((x) => x.id === tourneeId), extra))
        setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
        try {
          await ecrireTournee(tourneeId, { stops, route, ...extra })
        } catch (e) { annuler(tourneeId, prev); fail(e) }
      } finally {
        enVol.current--
      }
    },
    [ecrireTournee, annuler, fail],
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
      // La chaîne vide est conservée telle quelle : c'est un effacement voulu, et le
      // serveur le traite (`patch.departHeure || null` → NULL). La ramener à `undefined`
      // la faisait disparaître du corps au `JSON.stringify` : l'écran montrait l'heure
      // effacée, le serveur gardait l'ancienne, et le rechargement suivant la remettait —
      // une feuille imprimée pouvait alors porter une heure de départ qu'on croyait
      // retirée. À l'affichage, `''` et `undefined` sont indiscernables (`?? ''` côté
      // saisie, test de vérité côté feuille imprimée).
      const norm: TourneeExtra = {}
      if (patch.departHeure !== undefined) norm.departHeure = patch.departHeure
      if (patch.retourHeure !== undefined) norm.retourHeure = patch.retourHeure
      setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, ...norm } : x)))
      try {
        await ecrireTournee(tourneeId, norm)
      } catch (e) { annuler(tourneeId, prev); fail(e) }
    },
    [tournees, ecrireTournee, annuler, fail],
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
    theme, section, loading, error, livreurs, livreursTous, tournees, adresses,
    provider: defaultProvider,
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
