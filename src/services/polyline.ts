/**
 * Décode une polyligne encodée (algorithme Google, précision 6) en points [lat, lng].
 * Valhalla renvoie ses tracés sous cette forme, là où OSRM donnait du GeoJSON.
 */
export function decodePolyline6(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let i = 0
  let lat = 0
  let lng = 0

  while (i < encoded.length) {
    // Deux entiers zigzag-VLQ par point : delta de latitude puis de longitude.
    const deltas: number[] = []
    for (let k = 0; k < 2; k++) {
      let shift = 0
      let result = 0
      let byte: number
      do {
        byte = encoded.charCodeAt(i++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      deltas.push(result & 1 ? ~(result >> 1) : result >> 1)
    }
    lat += deltas[0]
    lng += deltas[1]
    points.push([lat / 1e6, lng / 1e6])
  }
  return points
}
