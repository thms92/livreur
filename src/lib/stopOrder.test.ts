import { describe, expect, it } from 'vitest'
import { sameStopOrder, sortStopsByTime } from './stopOrder'
import type { Stop } from '../types'

const stop = (id: string, heure?: string): Stop => ({
  id, label: id, ville: 'V', lat: 48, lng: 1, heure,
})

const ids = (stops: Stop[]) => stops.map((s) => s.id)

describe('sortStopsByTime', () => {
  it('trie les arrêts datés par heure croissante', () => {
    const out = sortStopsByTime([stop('a', '11:00'), stop('b', '08:30'), stop('c', '09:15')])
    expect(ids(out)).toEqual(['b', 'c', 'a'])
  })

  it('place les arrêts sans heure après les datés, ordre d’insertion conservé', () => {
    const out = sortStopsByTime([stop('x'), stop('a', '10:00'), stop('y'), stop('b', '08:00')])
    expect(ids(out)).toEqual(['b', 'a', 'x', 'y'])
  })

  it('est stable pour des heures égales', () => {
    const out = sortStopsByTime([stop('a', '09:00'), stop('b', '09:00'), stop('c', '09:00')])
    expect(ids(out)).toEqual(['a', 'b', 'c'])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const input = [stop('a', '11:00'), stop('b', '08:00')]
    sortStopsByTime(input)
    expect(ids(input)).toEqual(['a', 'b'])
  })
})

describe('sameStopOrder', () => {
  it('vrai si mêmes ids dans le même ordre', () => {
    expect(sameStopOrder([stop('a'), stop('b')], [stop('a'), stop('b')])).toBe(true)
  })
  it('faux si l’ordre diffère', () => {
    expect(sameStopOrder([stop('a'), stop('b')], [stop('b'), stop('a')])).toBe(false)
  })
})
