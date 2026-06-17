import { describe, expect, it } from 'vitest'
import { isPast, partitionTournees } from './tourneeTime'
import type { Tournee } from '../types'

const t = (id: string, date: string): Tournee => ({ id, livreurId: 'l', date, stops: [] })

describe('tourneeTime', () => {
  it('isPast : strictement avant aujourd’hui', () => {
    expect(isPast('2000-01-01', '2026-06-17')).toBe(true)
    expect(isPast('2026-06-17', '2026-06-17')).toBe(false) // aujourd'hui = à venir
    expect(isPast('2999-01-01', '2026-06-17')).toBe(false)
  })

  it('partitionne en à‑venir / passées', () => {
    const { upcoming, past } = partitionTournees(
      [t('a', '2026-06-10'), t('b', '2026-06-17'), t('c', '2026-06-25')],
      '2026-06-17',
    )
    expect(upcoming.map((x) => x.id)).toEqual(['b', 'c'])
    expect(past.map((x) => x.id)).toEqual(['a'])
  })
})
