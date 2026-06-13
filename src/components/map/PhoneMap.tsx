import type { Driver, Stop } from '../../types'
import { DEPOT } from '../../data/drivers'
import { bbox, pathD, pathLen } from '../../services/geometry'

interface Props {
  driver: Driver
  stops: Stop[]
  currentIndex: number
}

export function PhoneMap({ driver, stops, currentIndex }: Props) {
  const pts = [DEPOT, ...stops]
  const box = bbox(pts, 56)
  const len = pathLen(pts)
  const diag = Math.hypot(box.w, box.h)
  const sw = diag * 0.016
  const dotR = diag * 0.022
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--map-bg)" />
      <path className="route-band" d={pathD(pts)} stroke={driver.couleur} strokeWidth={sw * 5} opacity="0.10" />
      <path
        d={pathD(pts)} fill="none" stroke={driver.couleur} strokeWidth={sw}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset="0"
      />
      <g transform={`translate(${DEPOT.x} ${DEPOT.y})`}>
        <rect
          x={-dotR * 0.8} y={-dotR * 0.8} width={dotR * 1.6} height={dotR * 1.6} rx={dotR * 0.3}
          transform="rotate(45)" fill="var(--surface)" stroke="var(--text)" strokeWidth={sw * 0.7}
        />
      </g>
      {stops.map((s, i) => {
        const done = i < currentIndex
        const cur = i === currentIndex
        return (
          <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
            {cur && (
              <circle r={dotR * 2.2} fill={driver.couleur} opacity="0.18">
                <animate attributeName="r" values={`${dotR * 1.4};${dotR * 2.6};${dotR * 1.4}`} dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.25;0.04;0.25" dur="1.8s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              r={cur ? dotR * 1.25 : dotR} fill={done ? 'var(--map-dot-idle)' : driver.couleur}
              stroke="var(--map-bg)" strokeWidth={sw * 0.8}
            />
            <text
              textAnchor="middle" dy={dotR * 0.42} fontFamily="var(--font-mono)"
              fontSize={dotR * 1.05} fontWeight="600" fill="#fff"
            >
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
