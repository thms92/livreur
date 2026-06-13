import { Fragment, type CSSProperties } from 'react'
import { PhoneMap } from '../map/PhoneMap'
import { IcoCheck, IcoLink } from '../icons'
import { DriverPills } from './DriverPills'
import { CurrentStop } from './CurrentStop'
import { StopList } from './StopList'
import { useLivreur } from '../../state/LivreurContext'

export function DriverView() {
  const { drivers, routes, selected, setSelected, progress, advance, resetTour } = useLivreur()
  const driver = drivers.find((d) => d.id === selected) ?? drivers[0]
  const route = routes[driver.id]
  const arrets = route.stops
  const total = arrets.length
  const idx = Math.min(progress[driver.id] ?? 0, total)
  const fini = idx >= total
  const courant = fini ? null : arrets[idx]
  const now = new Date()
  const heure = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  return (
    <div className="driver-screen">
      <DriverPills drivers={drivers} driver={driver} routes={routes} setSelected={setSelected} />

      <div className="phone" style={{ '--col': driver.couleur } as CSSProperties}>
        <div className="phone-status">
          <span>{heure}</span>
          <span className="dots">
            <i />
            <i />
            <i /> 4G&nbsp;·&nbsp;87%
          </span>
        </div>

        <div className="phone-head">
          <div className="phone-driver">
            <span className="d" />
            <span className="n">{driver.nom}</span>
          </div>
          <div className="phone-total mono">
            <b>{total}</b> arrêts&nbsp;·&nbsp;<b>{route.km}</b> km&nbsp;·&nbsp;<b>{route.min}</b> min
          </div>
        </div>

        {total === 0 ? (
          <div className="done-card">
            <div className="t">Aucun arrêt</div>
            <div className="s">Ce chauffeur n'a pas encore d'arrêt affecté.</div>
          </div>
        ) : (
          <Fragment>
            <div className="phone-map">
              <span className="tag">tournée continue</span>
              <PhoneMap driver={driver} stops={arrets} currentIndex={idx} />
            </div>

            {fini ? (
              <div className="done-card">
                <div className="done-check">
                  <IcoCheck />
                </div>
                <div className="t">Tournée terminée</div>
                <div className="s mono">
                  {total} arrêts livrés · {route.km} km · {route.min} min
                </div>
                <button className="btn btn-ghost" onClick={() => resetTour(driver.id)}>
                  Recommencer la tournée
                </button>
              </div>
            ) : (
              <CurrentStop courant={courant!} idx={idx} total={total} onAdvance={() => advance(driver.id)} />
            )}

            <StopList arrets={arrets} idx={idx} total={total} fini={fini} />
          </Fragment>
        )}

        <div className="phone-note">
          <IcoLink />
          <span>
            Une seule tournée continue, sans limite d'arrêts. Maps ne sert qu'au trajet vers l'arrêt en cours — jamais à
            une liste de stops.
          </span>
        </div>
      </div>
    </div>
  )
}
