import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

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
