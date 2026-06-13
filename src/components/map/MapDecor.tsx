export const VB_W = 960
export const VB_H = 720

export function MapDecor() {
  const lines = []
  for (let x = 0; x <= VB_W; x += 48)
    lines.push(<line key={'vx' + x} x1={x} y1="0" x2={x} y2={VB_H} stroke="var(--map-grid)" strokeWidth="1" />)
  for (let y = 0; y <= VB_H; y += 48)
    lines.push(<line key={'hz' + y} x1="0" y1={y} x2={VB_W} y2={y} stroke="var(--map-grid)" strokeWidth="1" />)
  return (
    <g>
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="var(--map-bg)" />
      {lines}
      <path
        d="M -20 24 C 120 70, 150 140, 250 150 C 340 159, 380 96, 330 52 C 300 24, 250 28, 230 60"
        fill="none" stroke="var(--map-seine)" strokeWidth="16" strokeLinecap="round" opacity="0.9"
      />
      <path
        d="M 250 150 C 360 162, 470 150, 620 168 C 760 184, 880 150, 980 176"
        fill="none" stroke="var(--map-seine)" strokeWidth="13" strokeLinecap="round" opacity="0.7"
      />
      <line x1="0" y1="300" x2="960" y2="336" stroke="var(--map-road)" strokeWidth="3" />
      <line x1="430" y1="0" x2="500" y2="720" stroke="var(--map-road)" strokeWidth="3" />
      <line x1="120" y1="520" x2="900" y2="470" stroke="var(--map-road)" strokeWidth="2" />
    </g>
  )
}
