import { describe, it, expect } from 'vitest'
import { mapsUrl } from './openInMaps'

describe('mapsUrl', () => {
  it("encode adresse + commune dans l'URL Maps", () => {
    const url = mapsUrl({ adresse: '12 rue de Paris', ville: 'Clamart' })
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=12%20rue%20de%20Paris%2C%20Clamart')
  })
})
