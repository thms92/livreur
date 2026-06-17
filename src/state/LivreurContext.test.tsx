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

vi.mock('../services/api', () => {
  return {
    api: {
      getState: vi.fn(async () => ({ livreurs: [], tournees: [], adresses: [] })),
      createLivreur: vi.fn(async (i: { nom: string; prenom: string; telephone: string }) => ({
        id: 'L' + Math.random().toString(36).slice(2, 6), ...i, colorIndex: 0,
      })),
      updateLivreur: vi.fn(async () => ({ ok: true })),
      deleteLivreur: vi.fn(async () => ({ ok: true })),
      createTournee: vi.fn(async (i: { livreurId: string; date: string }) => ({
        id: 'T' + Math.random().toString(36).slice(2, 6), ...i, stops: [],
      })),
      updateTournee: vi.fn(async () => ({ ok: true })),
      deleteTournee: vi.fn(async () => ({ ok: true })),
      upsertAdresse: vi.fn(async () => ({ ok: true })),
      deleteAdresse: vi.fn(async () => ({ ok: true })),
    },
  }
})

import { api } from '../services/api'

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

  it('removeLivreur supprime le livreur et ses tournées (optimiste)', async () => {
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }) })
    const id = result.current.livreurs[0].id
    await act(async () => {
      await result.current.addTournee({ livreurId: id, date: '2026-06-18' })
    })
    await act(async () => { await result.current.removeLivreur(id) })
    expect(api.deleteLivreur).toHaveBeenCalledWith(id)
    expect(result.current.livreurs).toEqual([])
    expect(result.current.tournees).toEqual([])
  })
})
