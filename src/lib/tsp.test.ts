import { describe, expect, it } from 'vitest'
import { ordreOptimise } from './tsp'

/** Matrice symétrique construite depuis des positions sur une ligne : d(i,j) = |xi - xj|. */
function matriceLigne(xs: number[]): number[][] {
  return xs.map((a) => xs.map((b) => Math.abs(a - b)))
}

describe('ordreOptimise', () => {
  it('sur une ligne, visite les points dans l’ordre géographique', () => {
    // Dépôt en 0, arrêts à 30, 10, 20 : le bon ordre est 10, 20, 30.
    const ordre = ordreOptimise(matriceLigne([0, 30, 10, 20]))
    expect(ordre).toEqual([2, 3, 1])
  })

  it('ne perd ni ne duplique aucun arrêt', () => {
    const ordre = ordreOptimise(matriceLigne([0, 50, 10, 40, 20, 30]))
    expect([...ordre].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('n’inclut jamais le dépôt dans l’ordre renvoyé', () => {
    const ordre = ordreOptimise(matriceLigne([0, 15, 5, 25]))
    expect(ordre).not.toContain(0)
  })

  it('défait un croisement que le plus proche voisin laisse (2-opt)', () => {
    // Quatre coins d'un carré : le trajet optimal fait le tour, 4 côtés.
    // Un ordre croisé coûterait strictement plus.
    const pts = [[0, 0], [0, 10], [10, 10], [10, 0]]
    const m = pts.map(([ax, ay]) => pts.map(([bx, by]) => Math.hypot(ax - bx, ay - by)))
    const ordre = ordreOptimise(m)
    const cycle = [0, ...ordre, 0]
    let total = 0
    for (let i = 0; i < cycle.length - 1; i++) total += m[cycle[i]][cycle[i + 1]]
    expect(total).toBeCloseTo(40) // le tour du carré, sans diagonale
  })

  it('aucun arrêt -> ordre vide', () => {
    expect(ordreOptimise([[0]])).toEqual([])
  })

  it('un seul arrêt -> aller-retour trivial', () => {
    expect(ordreOptimise(matriceLigne([0, 7]))).toEqual([1])
  })
})
