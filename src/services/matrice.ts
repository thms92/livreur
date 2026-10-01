import type { LatLng } from '../types'

const VALHALLA = 'https://valhalla1.openstreetmap.de'

/**
 * Budget de l'instance publique sur /sources_to_targets : 100 **paires**
 * (sources × cibles), et non 100 points — le message d'erreur « Exceeded max
 * locations: 100 » est trompeur. Mesuré : 10×10 passe, 11×11 échoue.
 */
export const MAX_PAIRES = 100

interface Case { time: number | null }

/**
 * Matrice des durées (en secondes) entre tous les points, découpée en autant de
 * requêtes que le budget l'impose. On garde toutes les sources dans chaque appel
 * et on tranche en colonnes : une tournée de 13 arrêts tient ainsi en 2 requêtes.
 */
export async function matriceDurees(pts: LatLng[], sansPeage: boolean): Promise<number[][]> {
  const n = pts.length
  const locs = pts.map((p) => ({ lat: p.lat, lon: p.lng }))
  const matrice: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const parAppel = Math.max(1, Math.floor(MAX_PAIRES / n))

  for (let debut = 0; debut < n; debut += parAppel) {
    const fin = Math.min(debut + parAppel, n)
    const res = await fetch(`${VALHALLA}/sources_to_targets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sources: locs,
        targets: locs.slice(debut, fin),
        costing: 'auto',
        costing_options: { auto: { use_tolls: sansPeage ? 0 : 1 } },
      }),
    })
    if (!res.ok) throw new Error('valhalla-matrice')
    const data = (await res.json()) as { sources_to_targets?: Case[][] }
    if (!data.sources_to_targets) throw new Error('valhalla-matrice')
    data.sources_to_targets.forEach((ligne, i) => {
      ligne.forEach((c, j) => {
        // Une case sans trajet (time null) devient prohibitive plutôt que gratuite.
        matrice[i][debut + j] = c.time ?? Number.MAX_SAFE_INTEGER
      })
    })
  }
  return matrice
}
