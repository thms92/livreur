import { describe, it, expect } from 'vitest'
import { StubGeocoder } from './geocoder'

const g = new StubGeocoder()

describe('StubGeocoder', () => {
  it('coupe sur la dernière virgule (adresse, commune) et matche la commune', async () => {
    const r = await g.geocode('12 rue de Paris, Clamart')
    expect(r).not.toBeNull()
    expect(r!.adresse).toBe('12 rue de Paris')
    expect(r!.ville).toBe('Clamart')
    // placé autour du centroïde commune (360,372) avec jitter ±13
    expect(Math.abs(r!.x - 360)).toBeLessThanOrEqual(13)
    expect(Math.abs(r!.y - 372)).toBeLessThanOrEqual(13)
  })

  it('matche la commune même sans virgule, normalisation accents/casse', async () => {
    const r = await g.geocode('5 av Victor Cresson issy les moulineaux')
    expect(r!.ville).toBe('Issy-les-Moulineaux')
  })

  it('fallback « À situer » quand aucune commune connue', async () => {
    const r = await g.geocode('15 rue Inconnue, Trifouillis')
    expect(r!.ville).toBe('Trifouillis')
    expect(r!.adresse).toBe('15 rue Inconnue')
  })

  it('retourne null sur entrée vide', async () => {
    expect(await g.geocode('   ')).toBeNull()
  })
})
