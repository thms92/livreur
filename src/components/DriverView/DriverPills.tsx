import type { CSSProperties } from 'react'
import type { Driver, DriverId, Routes } from '../../types'

interface Props {
  drivers: Driver[]
  driver: Driver
  routes: Routes
  setSelected: (id: DriverId) => void
}

export function DriverPills({ drivers, driver, routes, setSelected }: Props) {
  return (
    <div className="driver-pills">
      {drivers.map((d) => (
        <button
          key={d.id}
          className={'pill' + (d.id === driver.id ? ' active' : '')}
          style={{ '--col': d.couleur } as CSSProperties}
          onClick={() => setSelected(d.id)}
        >
          <span className="pill-dot" /> {d.nom}
          <span className="pill-cnt mono">{routes[d.id].stops.length}</span>
        </button>
      ))}
    </div>
  )
}
