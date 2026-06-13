import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BanProvider } from './addressProvider'

function mockFetchOnce(json: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(json),
  } as Response)
}

const BAN_SAMPLE = {
  features: [
    {
      properties: { id: 'abc', label: '11 Rue du Loup Pendu 92350 Le Plessis-Robinson', city: 'Le Plessis-Robinson' },
      geometry: { type: 'Point', coordinates: [2.2596, 48.7784] },
    },
  ],
}

describe('BanProvider', () => {
  beforeEach(() => vi.stubGlobal('fetch', mockFetchOnce(BAN_SAMPLE)))
  afterEach(() => vi.unstubAllGlobals())

  it('suggest : mappe les features BAN vers Suggestion', async () => {
    const p = new BanProvider()
    const res = await p.suggest('11 rue du loup pendu')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({
      id: 'abc',
      label: '11 Rue du Loup Pendu 92350 Le Plessis-Robinson',
      ville: 'Le Plessis-Robinson',
      lat: 48.7784,
      lng: 2.2596,
    })
  })

  it('suggest : renvoie [] sous 3 caractères sans appeler fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const p = new BanProvider()
    expect(await p.suggest('11')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('suggest : renvoie [] si le réseau échoue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    const p = new BanProvider()
    expect(await p.suggest('adresse valide')).toEqual([])
  })

  it('geocodeFirst : renvoie la première Suggestion', async () => {
    const p = new BanProvider()
    const r = await p.geocodeFirst('11 rue du loup pendu, Le Plessis-Robinson')
    expect(r?.ville).toBe('Le Plessis-Robinson')
  })
})
