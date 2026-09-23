import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ConflitError } from './api'
import { setOperateur } from '../state/operateur'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(json) })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('api client', () => {
  it('getState appelle GET /api/state', async () => {
    const fn = mockFetch({ livreurs: [], tournees: [], adresses: [] })
    const state = await api.getState()
    expect(fn).toHaveBeenCalledWith('/api/state', expect.objectContaining({ method: 'GET' }))
    expect(state).toEqual({ livreurs: [], tournees: [], adresses: [] })
  })

  it('createLivreur POST avec le corps JSON et renvoie le livreur', async () => {
    const fn = mockFetch({ id: 'l1', nom: 'B', prenom: 'K', telephone: '', colorIndex: 0 }, true, 201)
    const l = await api.createLivreur({ nom: 'B', prenom: 'K', telephone: '' })
    expect(fn).toHaveBeenCalledWith('/api/livreurs', expect.objectContaining({ method: 'POST' }))
    expect(l.id).toBe('l1')
  })

  it('lève une erreur si la réponse n’est pas ok', async () => {
    mockFetch({ error: 'boom' }, false, 400)
    await expect(api.createTournee({ livreurId: 'l1', date: '2026-06-18' })).rejects.toThrow('boom')
  })
})

describe('api — travail à deux', () => {
  beforeEach(() => localStorage.clear())

  it('joint le nom de l’opérateur à chaque écriture', async () => {
    setOperateur('Thomas')
    const fn = mockFetch({ ok: true, version: 2 })
    await api.updateTournee('t1', { date: '2026-09-23' })
    const init = fn.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers['X-Operateur']).toBe('Thomas')
  })

  it('n’envoie pas d’en-tête X-Operateur tant qu’aucun nom n’est mémorisé', async () => {
    const fn = mockFetch({ ok: true, version: 2 })
    await api.updateTournee('t1', { date: '2026-09-23' })
    const init = fn.mock.calls[0][1] as { headers: Record<string, string> }
    expect('X-Operateur' in init.headers).toBe(false)
  })

  it('traduit un 409 en conflit exploitable', async () => {
    mockFetch({ error: 'modifiée ailleurs' }, false, 409)
    await expect(api.updateTournee('t1', { date: 'x' })).rejects.toBeInstanceOf(ConflitError)
  })

  it('traduit un 410 en disparition', async () => {
    mockFetch({ error: 'supprimée' }, false, 410)
    // Assertion sur le rejet lui-même : un `expect` posé dans un `.catch()` ne s'exécute
    // pas si la promesse cesse d'être rejetée — le test passerait alors sans rien vérifier.
    await expect(api.updateTournee('t1', { date: 'x' })).rejects.toMatchObject({ type: 'absente' })
  })
})
