import { useEffect, useRef } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import type { Driver, LatLng, Stop } from '../../types'
import { DEPOT } from '../../data/drivers'
import { numberedIcon } from './pins'

interface Props {
  driver: Driver
  stops: Stop[]
  index: number          // pour le délai de tracé échelonné
  dim: boolean
  reduceMotion: boolean
  onHover?: (id: Driver['id'] | null) => void
}

export function RouteLayer({ driver, stops, index, dim, reduceMotion, onHover }: Props) {
  const lineRef = useRef<L.Polyline | null>(null)
  const positions: [number, number][] = [DEPOT, ...stops].map((p: LatLng) => [p.lat, p.lng])

  useEffect(() => {
    const layer = lineRef.current
    if (!layer) return
    const el = layer.getElement() as SVGPathElement | null
    if (!el) return
    if (reduceMotion) {
      el.style.strokeDasharray = ''
      el.style.strokeDashoffset = ''
      return
    }
    const len = el.getTotalLength()
    el.style.transition = 'none'
    el.style.strokeDasharray = String(len)
    el.style.strokeDashoffset = String(len)
    // force reflow puis anime
    void el.getBoundingClientRect()
    el.style.transition = `stroke-dashoffset 1s ease ${index * 0.4}s`
    el.style.strokeDashoffset = '0'
  }, [positions.length, reduceMotion, index, driver.id])

  if (!stops.length) return null
  const opacity = dim ? 0.16 : 1

  return (
    <>
      <Polyline positions={positions} pathOptions={{ color: driver.couleur, weight: 22, opacity: 0.12 * (dim ? 0.4 : 1) }} />
      <Polyline ref={lineRef} positions={positions} pathOptions={{ color: driver.couleur, weight: 4, opacity }} />
      {stops.map((s, i) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={numberedIcon(driver.couleur, i + 1)}
          opacity={opacity}
          eventHandlers={{
            mouseover: () => onHover?.(driver.id),
            mouseout: () => onHover?.(null),
          }}
        />
      ))}
    </>
  )
}
