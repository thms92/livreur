import { Fragment } from 'react'
import { DRIVERS } from '../../data/drivers'
import { DispatcherMap } from '../map/DispatcherMap'
import { DriverCard } from './DriverCard'
import { StopsPanel } from './StopsPanel'
import { IcoInfo, IcoReset, IcoZone } from '../icons'
import { useLivreur } from '../../state/LivreurContext'

export function Dispatcher() {
  const {
    stops,
    routes,
    assign,
    dispatched,
    setDispatched,
    highlighted,
    setHighlighted,
    openDriver,
    addStop,
    addBulk,
    removeStop,
    reduceMotion,
    provider,
  } = useLivreur()

  return (
    <div className="dispatch">
      <div className="dispatch-map">
        <div className="map-shell">
          <DispatcherMap
            stops={stops} routes={routes} dispatched={dispatched}
            highlighted={highlighted} onHover={setHighlighted} reduceMotion={reduceMotion}
          />
          <div className="map-badge">
            <span>SO Paris</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="mono">{stops.length} arrêts</span>
          </div>
          {dispatched && (
            <div className="map-legend">
              {DRIVERS.map((d) => (
                <div className="legend-row" key={d.id}>
                  <span className="legend-dot" style={{ background: d.couleur }} />
                  {d.nom}{' '}
                  <span className="mono" style={{ color: 'var(--text-3)', marginLeft: 2 }}>
                    {routes[d.id].stops.length}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dispatch-side">
        <div className="side-head">
          <div className="side-title">Répartition des tournées</div>
          <div className="side-status">
            {dispatched ? (
              <Fragment>
                <b>{stops.length}</b> arrêts répartis sur <b>3</b> chauffeurs
              </Fragment>
            ) : (
              <Fragment>
                <b>{stops.length}</b> arrêts à répartir
              </Fragment>
            )}
          </div>
        </div>

        <div className="side-action">
          {!dispatched ? (
            <button className="btn btn-primary" onClick={() => setDispatched(true)} disabled={!stops.length}>
              <IcoZone /> Répartir par zone
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setDispatched(false)
                setHighlighted(null)
              }}
            >
              <IcoReset /> Modifier les arrêts
            </button>
          )}
          <div className="side-hint">
            <IcoInfo />
            <span>
              Une tournée continue et optimisée par chauffeur, sans limite d'arrêts. Google Maps n'est utilisé que pour le
              trajet vers l'arrêt en cours.
            </span>
          </div>
        </div>

        {dispatched && (
          <div className="drivers">
            <div className="drivers-label">Chauffeurs</div>
            {DRIVERS.map((d) => (
              <DriverCard
                key={d.id} d={d} route={routes[d.id]}
                dim={!!highlighted && highlighted !== d.id}
                onHover={setHighlighted} onOpen={openDriver}
              />
            ))}
          </div>
        )}

        <div className="drivers" style={{ paddingTop: dispatched ? 0 : 12 }}>
          <StopsPanel
            stops={stops} assign={assign} dispatched={dispatched} provider={provider}
            addStop={addStop} addBulk={addBulk} removeStop={removeStop}
          />
        </div>
      </div>
    </div>
  )
}
