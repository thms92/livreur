import { describe, expect, it } from 'vitest'
import { decodePolyline6 } from './polyline'

// Fragment réel renvoyé par Valhalla (début d'un trajet au départ du dépôt),
// décodé indépendamment par une implémentation de référence pour servir d'oracle.
const FRAGMENT = 'qkvc{Amg{gBjO`CdW~C'

describe('decodePolyline6', () => {
  it('décode une polyligne Valhalla en [lat, lng]', () => {
    expect(decodePolyline6(FRAGMENT)).toEqual([
      [48.312009, 1.718407],
      [48.311747, 1.718342],
      [48.31136, 1.718262],
    ])
  })

  it('chaîne vide -> aucun point', () => {
    expect(decodePolyline6('')).toEqual([])
  })

  it('gère les deltas négatifs (le trajet revient vers l’ouest)', () => {
    const pts = decodePolyline6(FRAGMENT)
    expect(pts[1][1]).toBeLessThan(pts[0][1])
    expect(pts[1][0]).toBeLessThan(pts[0][0])
  })
})
