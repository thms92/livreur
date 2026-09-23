import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { LivreurProvider, useLivreur } from './LivreurContext'

vi.mock('../services/routing', () => ({
  optimizeTrip: vi.fn(async (stops: { id: string }[]) => ({
    order: stops.map((_, i) => i),
    route: { km: 10, min: 15, geometry: [], optimized: true, approximate: false },
  })),
  computeRoute: vi.fn(async () => ({ km: 5, min: 8, geometry: [], optimized: false, approximate: false })),
}))

// On ne simule que le transport : `ConflitError` reste la vraie classe, sinon
// l'`instanceof` du contexte ne reconnaitrait pas les refus du serveur.
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api')
  return {
    ConflitError: actual.ConflitError,
    api: {
      getState: vi.fn(async () => ({ livreurs: [], tournees: [], adresses: [] })),
      createLivreur: vi.fn(async (i: { nom: string; prenom: string; telephone: string }) => ({
        id: 'L' + Math.random().toString(36).slice(2, 6), ...i, colorIndex: 0,
      })),
      updateLivreur: vi.fn(async () => ({ ok: true })),
      deleteLivreur: vi.fn(async () => ({ ok: true })),
      createTournee: vi.fn(async (i: { livreurId: string; date: string }) => ({
        id: 'T' + Math.random().toString(36).slice(2, 6), ...i, stops: [], version: 1,
      })),
      updateTournee: vi.fn(async () => ({ ok: true, version: 2 })),
      deleteTournee: vi.fn(async () => ({ ok: true })),
      upsertAdresse: vi.fn(async () => ({ ok: true })),
      deleteAdresse: vi.fn(async () => ({ ok: true })),
      getSync: vi.fn(async () => ({ stamp: 1, livreurs: 0 })),
      getCorbeille: vi.fn(async () => ({ tournees: [], livreurs: [] })),
      restore: vi.fn(async () => ({ ok: true })),
    },
  }
})

import { api, ConflitError } from '../services/api'
import type { AppState } from '../services/api'
import { computeRoute, optimizeTrip } from '../services/routing'
import type { RouteResult } from '../types'

const wrapper = ({ children }: { children: ReactNode }) => <LivreurProvider>{children}</LivreurProvider>

beforeEach(() => vi.clearAllMocks())
afterEach(() => localStorage.clear())

async function ready() {
  const hook = renderHook(() => useLivreur(), { wrapper })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('LivreurContext (API)', () => {
  it('charge l’état via getState au démarrage', async () => {
    const { result } = await ready()
    expect(api.getState).toHaveBeenCalled()
    expect(result.current.livreurs).toEqual([])
  })

  it('addLivreur : crée via l’API et l’ajoute à l’état (couleur dérivée)', async () => {
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '' }) })
    expect(api.createLivreur).toHaveBeenCalled()
    expect(result.current.livreurs.map((l) => l.nom)).toEqual(['Benali'])
    expect(result.current.livreurs[0].couleur).toBe('var(--c-1)')
  })

  it('rollback si l’API échoue', async () => {
    vi.mocked(api.createLivreur).mockRejectedValueOnce(new Error('boom'))
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'X', prenom: 'Y', telephone: '' }) })
    expect(result.current.livreurs).toEqual([])
    expect(result.current.error).toBeTruthy()
  })

  it('addStopToTournee mémorise l’adresse (upsert) et persiste', async () => {
    const { result } = await ready()
    await act(async () => {
      await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' })
    })
    let tid = ''
    await act(async () => {
      tid = await result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-18' })
    })
    await act(async () => {
      await result.current.addStopToTournee(tid, { id: 'ban-1', label: 'A', ville: 'V', lat: 48, lng: 1 })
    })
    expect(api.upsertAdresse).toHaveBeenCalled()
    expect(api.updateTournee).toHaveBeenCalled()
    expect(result.current.adresses.map((a) => a.id)).toEqual(['ban-1'])
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['A'])
  })

  it('duplicateTournee copie les arrêts vers un autre livreur (original intact)', async () => {
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'A', prenom: 'A', telephone: '' }) })
    await act(async () => { await result.current.addLivreur({ nom: 'B', prenom: 'B', telephone: '' }) })
    const a = result.current.livreurs[0], b = result.current.livreurs[1]
    let srcId = ''
    await act(async () => { srcId = await result.current.addTournee({ livreurId: a.id, date: '2026-06-18' }) })
    await act(async () => {
      await result.current.addStopToTournee(srcId, { id: 'ban-1', label: 'X', ville: 'V', lat: 48, lng: 1 })
    })
    let dupId = ''
    await act(async () => { dupId = await result.current.duplicateTournee(srcId, b.id) })
    expect(result.current.tournees).toHaveLength(2)
    const dup = result.current.tournees.find((t) => t.id === dupId)!
    expect(dup.livreurId).toBe(b.id)
    expect(dup.stops.map((s) => s.label)).toEqual(['X'])
    const src = result.current.tournees.find((t) => t.id === srcId)!
    expect(src.livreurId).toBe(a.id)
    expect(src.stops.map((s) => s.label)).toEqual(['X'])
  })

  it('removeLivreur met le livreur à la corbeille et conserve ses tournées (optimiste)', async () => {
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }) })
    const id = result.current.livreurs[0].id
    await act(async () => {
      await result.current.addTournee({ livreurId: id, date: '2026-06-18' })
    })
    await act(async () => { await result.current.removeLivreur(id) })
    expect(api.deleteLivreur).toHaveBeenCalledWith(id)
    // Le serveur ne cascade plus : il marque le livreur et laisse ses tournées. L'écran
    // doit montrer exactement cela, sinon il dément la confirmation qu'il vient d'afficher
    // — et les tournées réapparaîtraient toutes seules au prochain sondage.
    expect(result.current.livreurs).toEqual([])
    expect(result.current.livreursTous.map((l) => l.id)).toEqual([id])
    expect(result.current.tournees).toHaveLength(1)
  })

  async function tourneeAvecArret() {
    const hook = await ready()
    const { result } = hook
    await act(async () => { await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }) })
    let tid = ''
    await act(async () => {
      tid = await result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-08-19' })
    })
    await act(async () => {
      await result.current.addStopToTournee(tid, { id: 'ban-1', label: 'A', ville: 'V', lat: 48, lng: 1 })
    })
    return { result, tid }
  }

  it('setSansPeage : recalcule dans le mode demandé et le persiste', async () => {
    const { result, tid } = await tourneeAvecArret()
    vi.mocked(computeRoute).mockClear()

    await act(async () => { await result.current.setSansPeage(tid, false) })

    expect(computeRoute).toHaveBeenCalledWith(expect.anything(), { sansPeage: false })
    expect(result.current.tournees[0].sansPeage).toBe(false)
    expect(vi.mocked(api.updateTournee).mock.calls.at(-1)?.[1]).toMatchObject({ sansPeage: false })
  })

  it('les recalculs ultérieurs conservent le mode de la tournée', async () => {
    const { result, tid } = await tourneeAvecArret()
    await act(async () => { await result.current.setSansPeage(tid, false) })
    vi.mocked(computeRoute).mockClear()

    await act(async () => { await result.current.refreshRoute(tid) })

    expect(computeRoute).toHaveBeenCalledWith(expect.anything(), { sansPeage: false })
  })

  it('l’optimisation d’ordre respecte aussi le mode', async () => {
    const { result, tid } = await tourneeAvecArret()
    await act(async () => { await result.current.setSansPeage(tid, false) })
    vi.mocked(optimizeTrip).mockClear()

    await act(async () => { await result.current.optimizeTournee(tid) })

    expect(optimizeTrip).toHaveBeenCalledWith(expect.anything(), { sansPeage: false })
  })
})

describe('LivreurContext — travail à deux', () => {
  /** Un livreur et une tournée fraîchement créés (la tournée porte la version 1). */
  async function tourneeNeuve() {
    const hook = await ready()
    const { result } = hook
    await act(async () => { await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }) })
    let tid = ''
    await act(async () => {
      tid = await result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-09-22' })
    })
    return { result, tid, livreurId: result.current.livreurs[0].id }
  }

  it('relit l’état quand l’onglet redevient visible et que le serveur a bougé', async () => {
    const { result } = await ready()
    // Le serveur bouge après l’amorçage du marqueur : c’est ce saut qui doit déclencher la relecture.
    vi.mocked(api.getSync).mockResolvedValueOnce({ stamp: 999, livreurs: 0 })
    vi.mocked(api.getState).mockClear()

    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(api.getState).toHaveBeenCalled())
    expect(result.current.error).toBeNull()
  })

  it('ne relit pas si le serveur n’a pas bougé', async () => {
    await ready()
    // Le marqueur est amorcé dès le chargement : le premier sondage ne doit rien rapatrier.
    expect(api.getSync).toHaveBeenCalled()
    vi.mocked(api.getState).mockClear()

    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 20))

    expect(api.getState).not.toHaveBeenCalled()
  })

  it('un conflit annule la modification locale, prévient et recharge', async () => {
    const { result, tid, livreurId } = await tourneeNeuve()
    vi.mocked(api.updateTournee).mockRejectedValueOnce(new ConflitError('conflit', 'modifiée ailleurs'))
    // Le rechargement ramène la vérité du serveur : la date refusée n’y figure pas.
    vi.mocked(api.getState).mockResolvedValueOnce({
      livreurs: [],
      tournees: [{ id: tid, livreurId, date: '2026-09-22', stops: [], version: 4 }],
      adresses: [],
    })
    const appelsAvant = vi.mocked(api.getState).mock.calls.length

    await act(async () => { await result.current.updateTournee(tid, { date: '2026-09-23' }) })

    expect(result.current.error).toMatch(/modifiée ailleurs/i)
    // Le message est celui destiné à l’utilisateur, pas le brut du serveur.
    expect(result.current.error).toMatch(/rechargé/i)
    // Pas de compte absolu : on exige un appel *supplémentaire* après le conflit.
    await waitFor(() => expect(vi.mocked(api.getState).mock.calls.length).toBeGreaterThan(appelsAvant))
    await waitFor(() => expect(result.current.tournees[0]?.date).toBe('2026-09-22'))
  })

  it('une écriture de tournée porte la version détenue (le verrou est armé)', async () => {
    const { result, tid } = await tourneeNeuve()

    await act(async () => { await result.current.updateTournee(tid, { date: '2026-09-23' }) })

    expect(vi.mocked(api.updateTournee).mock.calls.at(-1)?.[1]).toMatchObject({ version: 1 })
  })

  it('la version renvoyée par le serveur remplace celle de l’état', async () => {
    const { result, tid } = await tourneeNeuve()
    vi.mocked(api.updateTournee).mockResolvedValueOnce({ ok: true, version: 7 })

    await act(async () => { await result.current.updateTournee(tid, { date: '2026-09-23' }) })
    expect(result.current.tournees[0].version).toBe(7)

    // L’écriture suivante repart de la version rendue, sinon elle se heurterait au verrou.
    await act(async () => { await result.current.setTourneeHeure(tid, { departHeure: '08:00' }) })
    expect(vi.mocked(api.updateTournee).mock.calls.at(-1)?.[1]).toMatchObject({ version: 7 })
  })

  it('le marqueur n’est jamais plus récent que l’état qu’il marque', async () => {
    await ready()

    // Le résumé est lu AVANT l’état : un changement qui arriverait pendant la lecture des
    // 3,4 Mo serait sinon marqué « vu » sans avoir jamais été reçu, donc invisible.
    expect(vi.mocked(api.getSync).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.getState).mock.invocationCallOrder[0])
  })

  it('le sondage n’adopte pas un état antérieur à une écriture faite pendant la lecture', async () => {
    const { result, tid, livreurId } = await tourneeNeuve()
    let repondreEtat: ((s: AppState) => void) | undefined
    vi.mocked(api.getState).mockImplementationOnce(() => new Promise<AppState>((r) => { repondreEtat = r }))
    vi.mocked(api.getSync).mockResolvedValueOnce({ stamp: 999, livreurs: 0 })

    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(repondreEtat).toBeDefined()) // la lecture des 3,4 Mo est en vol

    // L’utilisateur modifie pendant cette lecture, et son écriture aboutit.
    await act(async () => { await result.current.setTourneeHeure(tid, { departHeure: '08:00' }) })
    // Le serveur répond enfin — avec un état d’avant cette modification.
    await act(async () => {
      repondreEtat?.({
        livreurs: [],
        tournees: [{ id: tid, livreurId, date: '2026-09-22', stops: [], version: 1 }],
        adresses: [],
      })
    })

    // Sa modification est enregistrée côté serveur : elle doit rester à l’écran.
    expect(result.current.tournees[0].departHeure).toBe('08:00')

    // Et le changement serveur, lui, n’a pas été reçu : il ne doit pas rester marqué « vu ».
    vi.mocked(api.getSync).mockResolvedValueOnce({ stamp: 999, livreurs: 0 })
    vi.mocked(api.getState).mockClear()
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
  })

  it('recharger n’adopte pas un état antérieur à une modification optimiste dont l’écriture n’est pas encore partie (fenêtre computeRoute)', async () => {
    const { result, tid, livreurId } = await tourneeNeuve()
    let resoudreRoute: ((r: RouteResult) => void) | undefined
    vi.mocked(computeRoute).mockImplementationOnce(
      () => new Promise((r) => { resoudreRoute = r }),
    )

    // L’ajout d’un arrêt applique la mise à jour optimiste des `stops` puis attend
    // `computeRoute` avant d’envoyer quoi que ce soit au serveur : aucune écriture n’est
    // en vol pendant cette fenêtre, et c’est précisément elle que `recharger` doit respecter.
    let ajout: Promise<void> | undefined
    await act(async () => {
      ajout = result.current.addStopToTournee(tid, { id: 'ban-1', label: 'A', ville: 'V', lat: 48, lng: 1 })
    })
    await waitFor(() => expect(resoudreRoute).toBeDefined())
    expect(result.current.tournees[0].stops).toHaveLength(1)

    // Le serveur répond à `recharger` avec un état d’avant cet ajout.
    vi.mocked(api.getState).mockResolvedValueOnce({
      livreurs: [],
      tournees: [{ id: tid, livreurId, date: '2026-09-22', stops: [], version: 1 }],
      adresses: [],
    })
    await act(async () => { await result.current.recharger() })

    // L’ajout local, pas encore envoyé, doit rester à l’écran.
    expect(result.current.tournees[0].stops).toHaveLength(1)

    await act(async () => {
      resoudreRoute?.({ km: 5, min: 8, geometry: [], optimized: false, approximate: false })
      await ajout
    })
  })

  it('une seconde écriture pendant la première ne se heurte pas à elle-même', async () => {
    const { result, tid } = await tourneeNeuve()
    let repondre: ((r: { ok: true; version: number }) => void) | undefined
    vi.mocked(api.updateTournee).mockImplementationOnce(
      () => new Promise<{ ok: true; version: number }>((r) => { repondre = r }),
    )

    let premiere: Promise<void> | undefined
    await act(async () => { premiere = result.current.setTourneeHeure(tid, { departHeure: '08:00' }) })
    await waitFor(() => expect(repondre).toBeDefined())

    let seconde: Promise<void> | undefined
    await act(async () => { seconde = result.current.updateTournee(tid, { date: '2026-09-23' }) })
    // Elle attend son tour : partir maintenant, ce serait partir avec la version d’avant.
    expect(api.updateTournee).toHaveBeenCalledTimes(1)

    await act(async () => {
      repondre?.({ ok: true, version: 2 })
      await premiere
      await seconde
    })

    // Elle est partie avec la version rapportée par la première : pas de 409 contre soi-même.
    expect(vi.mocked(api.updateTournee).mock.calls[1][1]).toMatchObject({ version: 2 })
    expect(result.current.error).toBeNull()
    expect(result.current.tournees[0].date).toBe('2026-09-23')
    expect(result.current.tournees[0].departHeure).toBe('08:00')
  })

  it('restaurer remet l’élément puis relit l’état', async () => {
    const { result } = await ready()
    const appelsAvant = vi.mocked(api.getState).mock.calls.length

    await act(async () => { await result.current.restaurer('T1', 'tournee') })

    expect(api.restore).toHaveBeenCalledWith('T1', 'tournee')
    expect(vi.mocked(api.getState).mock.calls.length).toBeGreaterThan(appelsAvant)
  })

  it('un livreur supprimé sort des listes mais reste résoluble par son nom', async () => {
    vi.mocked(api.getState).mockResolvedValueOnce({
      livreurs: [
        { id: 'l1', nom: 'ACTIF', prenom: 'A', telephone: '', colorIndex: 0 },
        { id: 'l2', nom: 'PARTI', prenom: 'P', telephone: '', colorIndex: 1, deletedAt: 1758500000000 },
      ],
      tournees: [],
      adresses: [],
    })
    const { result } = await ready()

    expect(result.current.livreurs.map((l) => l.nom)).toEqual(['ACTIF'])
    expect(result.current.livreursTous.map((l) => l.nom)).toEqual(['ACTIF', 'PARTI'])
  })
})
