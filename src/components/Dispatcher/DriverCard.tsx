import type { CSSProperties } from 'react'
import type { Driver, DriverId, RouteResult } from '../../types'
import { IcoArrow } from '../icons'

interface Props {
  d: Driver
  route: RouteResult
  dim: boolean
  onHover: (id: DriverId | null) => void
  onOpen: (id: DriverId) => void
}

export function DriverCard({ d, route, dim, onHover, onOpen }: Props) {
  return (
    <div
      className={'dcard dispatched' + (dim ? ' dim' : '')}
      style={{ '--col': d.couleur } as CSSProperties}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="dcard-top">
        <span className="dcard-dot" />
        <span className="dcard-name">{d.nom}</span>
        <span className="dcard-tag">{route.stops.length ? 'RÉPARTI' : '—'}</span>
      </div>
      <div className="dcard-stats">
        <div className="stat"><div className="stat-num">{route.stops.length}</div><div className="stat-lbl">arrêts</div></div>
        <div className="stat"><div className="stat-num">{route.km}</div><div className="stat-lbl">km</div></div>
        <div className="stat"><div className="stat-num">{route.min}</div><div className="stat-lbl">min</div></div>
      </div>
      <button className="btn btn-route" onClick={() => onOpen(d.id)} disabled={!route.stops.length}>
        Voir la tournée <IcoArrow />
      </button>
    </div>
  )
}
