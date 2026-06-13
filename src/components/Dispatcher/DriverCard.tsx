import { useState, type CSSProperties } from 'react'
import type { Driver, DriverId, RouteResult } from '../../types'
import { IcoArrow, IcoX } from '../icons'

interface Props {
  d: Driver
  route: RouteResult
  active: boolean
  dim: boolean
  canDelete: boolean
  onSelectActive: (id: DriverId) => void
  onRename: (id: DriverId, nom: string) => void
  onRemove: (id: DriverId) => void
  onHover: (id: DriverId | null) => void
  onOpen: (id: DriverId) => void
}

export function DriverCard({
  d, route, active, dim, canDelete, onSelectActive, onRename, onRemove, onHover, onOpen,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(d.nom)

  function commit() {
    setEditing(false)
    if (name.trim() && name.trim() !== d.nom) onRename(d.id, name.trim())
    else setName(d.nom)
  }

  return (
    <div
      className={'dcard dispatched' + (active ? ' active' : '') + (dim ? ' dim' : '')}
      style={{ '--col': d.couleur } as CSSProperties}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelectActive(d.id)}
    >
      <div className="dcard-top">
        <span className="dcard-dot" />
        {editing ? (
          <input
            className="dcard-name-input"
            value={name}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setName(d.nom)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className="dcard-name"
            title="Renommer"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {d.nom}
          </span>
        )}
        {active && <span className="dcard-tag">ACTIF</span>}
        {canDelete && (
          <button
            className="stopitem-x"
            title="Supprimer le chauffeur"
            aria-label="Supprimer le chauffeur"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(d.id)
            }}
          >
            <IcoX />
          </button>
        )}
      </div>
      <div className="dcard-stats">
        <div className="stat"><div className="stat-num">{route.stops.length}</div><div className="stat-lbl">arrêts</div></div>
        <div className="stat"><div className="stat-num">{route.km}</div><div className="stat-lbl">km</div></div>
        <div className="stat"><div className="stat-num">{route.min}</div><div className="stat-lbl">min</div></div>
      </div>
      <button
        className="btn btn-route"
        onClick={(e) => {
          e.stopPropagation()
          onOpen(d.id)
        }}
        disabled={!route.stops.length}
      >
        Voir la tournée <IcoArrow />
      </button>
    </div>
  )
}
