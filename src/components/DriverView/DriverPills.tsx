import type { CSSProperties } from 'react'
import type { Driver, DriverId, Routes } from '../../types'
import { DRIVERS } from '../../data/drivers'

interface Props {
  driver: Driver
  routes: Routes
  setSelected: (id: DriverId) => void
}

export function DriverPills({ driver, routes, setSelected }: Props) {
  return (
    <div className="driver-pills">
      {DRIVERS.map((d) => (
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
