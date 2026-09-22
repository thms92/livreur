import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, AttributionControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useLivreur } from '../../state/LivreurContext'
import { DEPOT } from '../../data/depot'
import type { LatLng } from '../../types'
import { TILE_ATTR, TILE_MAX_ZOOM, TILE_URL } from '../../data/tiles'



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
    : [DEPOT.lat, DEPOT.lng]
  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={interactive}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      attributionControl={false}
      className={theme === 'dark' ? 'map-dark' : undefined}
      style={{ width: '100%', height: '100%' }}
    >
      <AttributionControl position="bottomright" prefix={false} />
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={TILE_MAX_ZOOM} />
      <FitBounds points={points} />
      <Resizer />
      {children}
    </MapContainer>
  )
}
