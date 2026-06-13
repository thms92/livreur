import { Marker } from 'react-leaflet'
import type { DriverId, Routes, Stop } from '../../types'
import { DRIVERS, DEPOT } from '../../data/drivers'
import { BaseMap } from './BaseMap'
import { RouteLayer } from './RouteLayer'
import { depotIcon, idleIcon } from './pins'

interface Props {
  stops: Stop[]
  routes: Routes
  dispatched: boolean
  highlighted: DriverId | null
  onHover: (id: DriverId | null) => void
  reduceMotion: boolean
}

export function DispatcherMap({ stops, routes, dispatched, highlighted, onHover, reduceMotion }: Props) {
  const allPoints = [DEPOT, ...stops]
  return (
    <BaseMap points={allPoints}>
      <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} />

      {!dispatched &&
        stops.map((s) => <Marker key={s.id} position={[s.lat, s.lng]} icon={idleIcon()} />)}

      {dispatched &&
        DRIVERS.map((d, i) => (
          <RouteLayer
            key={d.id}
            driver={d}
            stops={routes[d.id].stops}
            index={i}
            dim={!!highlighted && highlighted !== d.id}
            reduceMotion={reduceMotion}
            onHover={onHover}
          />
        ))}
    </BaseMap>
  )
}
