import L from 'leaflet'

export function numberedIcon(color: string, n: number, current = false): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin${current ? ' pulse' : ''}" style="--col:${color}">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export function idleIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin idle"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

export function depotIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin-depot"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}
