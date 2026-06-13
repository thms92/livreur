import type { Point } from '../../types'

export function DepotMarker({ depot }: { depot: Point }) {
  return (
    <g transform={`translate(${depot.x} ${depot.y})`}>
      <rect
        x="-8" y="-8" width="16" height="16" rx="3" transform="rotate(45)"
        fill="var(--surface)" stroke="var(--text)" strokeWidth="2"
      />
      <circle r="2.6" fill="var(--text)" />
      <text x="0" y="-16" textAnchor="middle" className="stop-label" style={{ fontSize: 12, fontWeight: 600 }}>
        Dépôt
      </text>
    </g>
  )
}
