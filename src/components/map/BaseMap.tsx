import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useLivreur } from '../../state/LivreurContext'
import type { LatLng } from '../../types'

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}
const ATTR = '&copy; OpenStreetMap, &copy; CARTO'

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [map, points])
  return null
}

function Resizer() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(t)
  }, [map])
  return null
}

interface Props {
  points: LatLng[]
  interactive?: boolean
  children?: ReactNode
}

export function BaseMap({ points, interactive = true, children }: Props) {
  const { theme } = useLivreur()
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [48.81, 2.29]
  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={interactive}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      attributionControl
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer key={theme} url={theme === 'dark' ? TILES.dark : TILES.light} attribution={ATTR} />
      <FitBounds points={points} />
      <Resizer />
      {children}
    </MapContainer>
  )
}
