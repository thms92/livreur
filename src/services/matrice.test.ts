import { afterEach, describe, expect, it, vi } from 'vitest'
import { matriceDurees, MAX_PAIRES } from './matrice'
import type { LatLng } from '../types'

const pts = (n: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 48.3 + i * 0.01, lng: 1.7 + i * 0.01 }))

/** Mocke /sources_to_targets : renvoie une matrice remplie et retient les requêtes. */
function mockMatrice() {
  const corps: { sources: unknown[]; targets: unknown[]; costing_options: unknown }[] = []
  const f = vi.fn().mockImplementation((_u: string, init?: { body?: string }) => {
    const b = JSON.parse(init!.body!)
    corps.push(b)
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          sources_to_targets: b.sources.map((_: unknown, i: number) =>
            b.targets.map((_: unknown, j: number) => ({ time: 100 + i * 10 + j })),
          ),
        }),
    })
  })
  vi.stubGlobal('fetch', f)
  return { corps, f }
}

afterEach(() => vi.unstubAllGlobals())

describe('matriceDurees', () => {
  it('une seule requête quand le budget de paires le permet', async () => {
    const { corps } = mockMatrice()
    await matriceDurees(pts(9), true) // 9x9 = 81 paires
    expect(corps).toHaveLength(1)
  })

  it('découpe en colonnes dès que le budget est dépassé', async () => {
    const { corps } = mockMatrice()
    await matriceDurees(pts(14), true) // 14x14 = 196 paires
    expect(corps.length).toBeGreaterThan(1)
    for (const c of corps) {
      expect(c.sources.length * c.targets.length).toBeLessThanOrEqual(MAX_PAIRES)
    }
  })

  it('chaque requête porte toutes les sources, et les colonnes couvrent tout sans trou', async () => {
    const { corps } = mockMatrice()
    await matriceDurees(pts(14), true)
    let colonnes = 0
    for (const c of corps) {
      expect(c.sources).toHaveLength(14)
      colonnes += c.targets.length
    }
    expect(colonnes).toBe(14)
  })

  it('renvoie une matrice carrée complète', async () => {
    mockMatrice()
    const m = await matriceDurees(pts(14), true)
    expect(m).toHaveLength(14)
    for (const ligne of m) expect(ligne).toHaveLength(14)
  })

  it('transmet le mode péage à chaque tronçon de matrice', async () => {
    const { corps } = mockMatrice()
    await matriceDurees(pts(14), false)
    for (const c of corps) {
      expect(c.costing_options).toEqual({ auto: { use_tolls: 1 } })
    }
  })
})
