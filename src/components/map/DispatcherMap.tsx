import { Marker } from 'react-leaflet'
import type { Driver, DriverId, Routes, Stop } from '../../types'
import { DEPOT } from '../../data/drivers'
import { BaseMap } from './BaseMap'
import { RouteLayer } from './RouteLayer'
import { depotIcon, idleIcon } from './pins'

interface Props {
  stops: Stop[]
  drivers: Driver[]
  routes: Routes
  highlighted: DriverId | null
  onHover: (id: DriverId | null) => void
  reduceMotion: boolean
}

export function DispatcherMap({ stops, drivers, routes, highlighted, onHover, reduceMotion }: Props) {
  const allPoints = [DEPOT, ...stops]
  const unassigned = stops.filter((s) => !s.driver)
  return (
    <BaseMap points={allPoints}>
      <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} />

      {unassigned.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={idleIcon()} />
      ))}

      {drivers.map((d, i) => (
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
