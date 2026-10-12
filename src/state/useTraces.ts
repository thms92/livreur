import { useEffect, useState } from 'react'
import { useLivreur } from './LivreurContext'
import type { TourneeOnMap } from '../components/map/TourneeMap'

/**
 * Complète des tournées avec leur tracé, chargé à la demande.
 *
 * Depuis l'allègement de /api/state, les tracés (98 % de sa charge utile) n'arrivent
 * plus avec la liste : la carte les réclame elle-même, pour les seules tournées
 * qu'elle affiche. Le rendu se fait d'abord sans tracé, puis avec — plutôt que de
 * retarder toute la carte.
 */
export function useTraces(tournees: TourneeOnMap[]): TourneeOnMap[] {
  const { geometrieDe } = useLivreur()
  const [traces, setTraces] = useState<Record<string, [number, number][]>>({})
  const cles = tournees.map((t) => t.id).join(',')

  useEffect(() => {
    let vivant = true
    void Promise.all(
      tournees
        .filter((t) => t.route && !t.route.geometry.length)
        .map(async (t) => [t.id, await geometrieDe(t.id)] as const),
    ).then((paires) => {
      if (!vivant || !paires.length) return
      setTraces((p) => ({ ...p, ...Object.fromEntries(paires) }))
    })
    return () => { vivant = false }
    // `cles` suffit : on ne recharge que lorsque l'ensemble affiché change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cles, geometrieDe])

  return tournees.map((t) =>
    t.route && !t.route.geometry.length && traces[t.id]
      ? { ...t, route: { ...t.route, geometry: traces[t.id] } }
      : t,
  )
}
