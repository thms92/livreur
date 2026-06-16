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
  const points: LatLng[] = [
    { lat: DEPOT.lat, lng: DEPOT.lng },
    ...tournees.flatMap((t) => t.stops),
  ]
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
