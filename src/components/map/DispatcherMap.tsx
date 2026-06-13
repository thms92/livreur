import type { DriverId, Routes, Stop } from '../../types'
import { DRIVERS, DEPOT } from '../../data/drivers'
import { pathD, pathLen } from '../../services/geometry'
import { MapDecor, VB_W, VB_H } from './MapDecor'
import { DepotMarker } from './DepotMarker'

interface Props {
  stops: Stop[]
  routes: Routes
  dispatched: boolean
  highlighted: DriverId | null
  onHover: (id: DriverId | null) => void
  reduceMotion: boolean
}

export function DispatcherMap({ stops, routes, dispatched, highlighted, onHover, reduceMotion }: Props) {
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet">
      <MapDecor />

      {dispatched &&
        DRIVERS.map((d, di) => {
          const arr = routes[d.id].stops
          if (!arr.length) return null
          const pts = [DEPOT, ...arr]
          const len = pathLen(pts)
          const dim = highlighted && highlighted !== d.id
          const delay = reduceMotion ? 0 : di * 0.4
          return (
            <g key={'route' + d.id} style={{ opacity: dim ? 0.16 : 1, transition: 'opacity .2s' }}>
              <path className="route-band" d={pathD(pts)} stroke={d.couleur} strokeWidth="30" opacity="0.10" />
              <path
                className="route-line" d={pathD(pts)} stroke={d.couleur} strokeWidth="3.5"
                strokeDasharray={len} strokeDashoffset={0}
                style={{ transitionDelay: delay + 's' }}
              />
            </g>
          )
        })}

      <DepotMarker depot={DEPOT} />

      {!dispatched &&
        stops.map((s) => (
          <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
            <circle className="stop-dot" r="6" fill="var(--map-dot-idle)" stroke="var(--map-bg)" strokeWidth="2.5" />
            <text className="stop-label" textAnchor="middle" dy="-15">{s.ville}</text>
          </g>
        ))}

      {dispatched &&
        DRIVERS.map((d) => {
          const dim = highlighted && highlighted !== d.id
          return (
            <g
              key={'stops' + d.id}
              style={{ opacity: dim ? 0.2 : 1, transition: 'opacity .2s' }}
              onMouseEnter={() => onHover(d.id)}
              onMouseLeave={() => onHover(null)}
            >
              {routes[d.id].stops.map((s, i) => (
                <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
                  <circle className="stop-dot" r="11" fill={d.couleur} stroke="var(--map-bg)" strokeWidth="2.5" />
                  <text className="stop-num" textAnchor="middle" dy="3.4">{i + 1}</text>
                  <text className="stop-label" textAnchor="middle" dy="-15">{s.ville}</text>
                </g>
              ))}
            </g>
          )
        })}
    </svg>
  )
}
