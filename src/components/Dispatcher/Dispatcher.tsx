import { useState } from 'react'
import { DispatcherMap } from '../map/DispatcherMap'
import { DriverCard } from './DriverCard'
import { StopsPanel } from './StopsPanel'
import { IcoInfo, IcoPlus, IcoZone } from '../icons'
import { useLivreur } from '../../state/LivreurContext'

export function Dispatcher() {
  const {
    stops, drivers, routes, assign, highlighted, setHighlighted,
    activeDriver, setActiveDriver, openDriver,
    addStop, addBulk, removeStop, assignStop, autoAssign,
    addDriver, renameDriver, removeDriver, reduceMotion, provider,
  } = useLivreur()

  const [newName, setNewName] = useState('')
  const activeColor = drivers.find((d) => d.id === activeDriver)?.couleur ?? 'var(--c-1)'
  const unassigned = stops.filter((s) => !s.driver).length

  function submitNew() {
    if (newName.trim()) {
      addDriver(newName)
      setNewName('')
    }
  }

  return (
    <div className="dispatch">
      <div className="dispatch-map">
        <div className="map-shell">
          <DispatcherMap
            stops={stops} drivers={drivers} routes={routes}
            highlighted={highlighted} onHover={setHighlighted} reduceMotion={reduceMotion}
          />
          <div className="map-badge">
            <span>SO Paris</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="mono">{stops.length} arrêts</span>
          </div>
          <div className="map-legend">
            {drivers.map((d) => (
              <div className="legend-row" key={d.id}>
                <span className="legend-dot" style={{ background: d.couleur }} />
                {d.nom}{' '}
                <span className="mono" style={{ color: 'var(--text-3)', marginLeft: 2 }}>
                  {routes[d.id].stops.length}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dispatch-side">
        <div className="side-head">
          <div className="side-title">Répartition des tournées</div>
          <div className="side-status">
            <b>{stops.length}</b> arrêts · <b>{unassigned}</b> non affecté{unassigned > 1 ? 's' : ''}
          </div>
        </div>

        <div className="side-action">
          <button className="btn btn-primary" onClick={autoAssign} disabled={!unassigned}>
            <IcoZone /> Répartir par zone
          </button>
          <div className="side-hint">
            <IcoInfo />
            <span>
              Choisissez un chauffeur (carte active), puis cliquez ses arrêts. « Répartir par zone »
              remplit automatiquement les arrêts non affectés.
            </span>
          </div>
        </div>

        <div className="drivers">
          <div className="drivers-label">
            Chauffeurs · actif : {drivers.find((d) => d.id === activeDriver)?.nom}
          </div>
          {drivers.map((d) => (
            <DriverCard
              key={d.id} d={d} route={routes[d.id]}
              active={d.id === activeDriver}
              dim={!!highlighted && highlighted !== d.id}
              canDelete={drivers.length > 1}
              onSelectActive={setActiveDriver}
              onRename={renameDriver}
              onRemove={removeDriver}
              onHover={setHighlighted}
              onOpen={openDriver}
            />
          ))}
          <div className="add-row">
            <input
              className="add-input" value={newName} placeholder="Nom du chauffeur…"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNew()
              }}
            />
            <button className="add-btn" onClick={submitNew} title="Ajouter un chauffeur" aria-label="Ajouter un chauffeur">
              <IcoPlus />
            </button>
          </div>
        </div>

        <div className="drivers" style={{ paddingTop: 0 }}>
          <StopsPanel
            stops={stops} assign={assign} provider={provider} activeColor={activeColor}
            addStop={addStop} addBulk={addBulk} removeStop={removeStop}
            assignStop={(id) => assignStop(id, activeDriver)}
          />
        </div>
      </div>
    </div>
  )
}
