import type { Stop } from '../types'

/**
 * Trie les arrêts par heure de livraison croissante (tri stable).
 * Les heures sont des chaînes "HH:MM" (24h), comparées lexicographiquement — ce qui
 * équivaut à un ordre chronologique. Les arrêts sans heure sont placés après les arrêts
 * datés, en conservant leur ordre d'insertion.
 */
export function sortStopsByTime(stops: Stop[]): Stop[] {
  return stops
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ha = a.s.heure
      const hb = b.s.heure
      if (ha && hb) return ha === hb ? a.i - b.i : ha < hb ? -1 : 1
      if (ha) return -1 // a daté, b non → a avant
      if (hb) return 1 // b daté, a non → b avant
      return a.i - b.i // les deux sans heure → ordre d'origine
    })
    .map((x) => x.s)
}

/** Vrai si les deux listes ont les mêmes arrêts dans le même ordre (comparaison par id). */
export function sameStopOrder(a: Stop[], b: Stop[]): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id)
}
