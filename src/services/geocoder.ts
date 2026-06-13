import type { GeocodeResult } from '../types'
import { COMMUNES } from '../data/communes'

export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult | null>
}

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const COMMUNE_KEYS = Object.keys(COMMUNES).sort((a, b) => b.length - a.length)

function matchCommune(text: string): string | null {
  const n = norm(text)
  for (const name of COMMUNE_KEYS) {
    if (n.includes(norm(name))) return name
  }
  return null
}

/** Stub : reproduit makeStop() du prototype. À remplacer par api-adresse.data.gouv.fr. */
export class StubGeocoder implements Geocoder {
  geocode(query: string): Promise<GeocodeResult | null> {
    const raw = (query || '').trim()
    if (!raw) return Promise.resolve(null)

    let adresse = raw
    let villeStr = ''
    const ci = raw.lastIndexOf(',')
    if (ci > 0) {
      adresse = raw.slice(0, ci).trim()
      villeStr = raw.slice(ci + 1).trim()
    }

    const commune = matchCommune(villeStr) || matchCommune(raw)
    const jit = () => (Math.random() - 0.5) * 26

    let x: number
    let y: number
    let ville: string
    if (commune) {
      const c = COMMUNES[commune]
      x = c.x + jit()
      y = c.y + jit()
      ville = commune
    } else {
      x = 430 + (Math.random() - 0.5) * 230
      y = 360 + (Math.random() - 0.5) * 230
      ville = villeStr || 'À situer'
    }
    return Promise.resolve({ ville, adresse: adresse || ville, x, y })
  }
}

let seq = 0
export function makeStopId(): string {
  seq += 1
  return 'a' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6)
}
