import { Marker, Polyline } from 'react-leaflet'
import type { Driver, Stop } from '../../types'
import { DEPOT } from '../../data/drivers'
import { BaseMap } from './BaseMap'
import { numberedIcon, depotIcon } from './pins'

interface Props {
  driver: Driver
  stops: Stop[]
  currentIndex: number
}

export function PhoneMap({ driver, stops, currentIndex }: Props) {
  const points = [DEPOT, ...stops]
  const positions: [number, number][] = points.map((p) => [p.lat, p.lng])
  return (
    <BaseMap points={points} interactive={false}>
      <Polyline positions={positions} pathOptions={{ color: driver.couleur, weight: 22, opacity: 0.12 }} />
      <Polyline positions={positions} pathOptions={{ color: driver.couleur, weight: 3.5 }} />
      <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} />
      {stops.map((s, i) => {
        const done = i < currentIndex
        const cur = i === currentIndex
        const color = done ? 'var(--map-dot-idle)' : driver.couleur
        return <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(color, i + 1, cur)} />
      })}
    </BaseMap>
  )
}
