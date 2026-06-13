import type { Suggestion } from '../types'

export interface AddressProvider {
  suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]>
  geocodeFirst(query: string): Promise<Suggestion | null>
}

const BASE = 'https://api-adresse.data.gouv.fr/search/'

interface BanFeature {
  properties: { id?: string; label: string; city?: string }
  geometry: { coordinates: [number, number] }
}

function toSuggestions(features: BanFeature[]): Suggestion[] {
  return features.map((f, i) => ({
    id: f.properties.id ?? f.properties.label + i,
    label: f.properties.label,
    ville: f.properties.city ?? '',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }))
}

export class BanProvider implements AddressProvider {
  async suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
    const q = query.trim()
    if (q.length < 3) return []
    try {
      const url = `${BASE}?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`
      const res = await fetch(url, { signal })
      if (!res.ok) return []
      const data = (await res.json()) as { features: BanFeature[] }
      return toSuggestions(data.features ?? [])
    } catch {
      return []
    }
  }

  async geocodeFirst(query: string): Promise<Suggestion | null> {
    const q = query.trim()
    if (q.length < 3) return null
    try {
      const url = `${BASE}?q=${encodeURIComponent(q)}&limit=1`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = (await res.json()) as { features: BanFeature[] }
      return toSuggestions(data.features ?? [])[0] ?? null
    } catch {
      return null
    }
  }
}
