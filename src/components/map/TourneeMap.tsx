import { useMemo } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import type { LatLng, RouteResult, Stop } from '../../types'
import { DEPOT } from '../../data/depot'
import { BaseMap } from './BaseMap'
import { depotIcon, numberedIcon } from './pins'

export interface TourneeOnMap {
  id: string
  couleur: string
  stops: Stop[]
  route?: RouteResult
}

interface Props {
  tournees: TourneeOnMap[]
}

export function TourneeMap({ tournees }: Props) {
  // Référence stable tant que les coordonnées ne changent pas : évite que la carte
  // ne se recadre (fitBounds) à chaque re-rendu (ex. saisie dans le formulaire).
  const coordKey = tournees
    .flatMap((t) => t.stops.map((s) => `${s.lat},${s.lng}`))
    .join('|')
  const points: LatLng[] = useMemo(
    () => [{ lat: DEPOT.lat, lng: DEPOT.lng }, ...tournees.flatMap((t) => t.stops)],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcule uniquement quand les coordonnées changent
    [coordKey],
  )
  return (
    <div className="map-wrap">
      <BaseMap points={points}>
        <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} />
        {tournees.map((t) => {
          const line: [number, number][] =
            t.route && t.route.geometry.length > 1
              ? t.route.geometry
              : [[DEPOT.lat, DEPOT.lng], ...t.stops.map((s) => [s.lat, s.lng] as [number, number]), [DEPOT.lat, DEPOT.lng]]
          return (
            <span key={t.id}>
              <Polyline positions={line} pathOptions={{ color: t.couleur, weight: 4, opacity: 0.9 }} />
              {t.stops.map((s, i) => (
                <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(t.couleur, i + 1)} />
              ))}
            </span>
          )
        })}
      </BaseMap>
    </div>
  )
}
