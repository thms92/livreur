import { describe, expect, it } from 'vitest'
import { TILE_URL, TILE_ATTR, TILE_MAX_ZOOM } from './tiles'

describe('fond de carte', () => {
  it('utilise OSM France, qui ne réclame pas de clé', () => {
    expect(TILE_URL).toContain('tile.openstreetmap.fr/osmfr')
  })

  it('n’utilise plus CARTO, dont les tuiles exigent désormais une clé', () => {
    expect(TILE_URL).not.toContain('cartocdn')
  })

  it('ne demande pas de tuile @2x : OSM France répond 404 dessus', () => {
    // Le placeholder {r} de Leaflet devient "@2x" sur écran retina -> tuiles manquantes.
    expect(TILE_URL).not.toContain('{r}')
  })

  it('garde les placeholders Leaflet nécessaires', () => {
    for (const p of ['{s}', '{z}', '{x}', '{y}']) expect(TILE_URL).toContain(p)
  })

  it('attribue OpenStreetMap, comme la licence l’exige', () => {
    expect(TILE_ATTR).toMatch(/OpenStreetMap/)
  })

  it('autorise le zoom jusqu’au niveau rue', () => {
    expect(TILE_MAX_ZOOM).toBeGreaterThanOrEqual(19)
  })
})
