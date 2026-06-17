import type { Tournee } from '../types'

export const todayIso = (): string => new Date().toISOString().slice(0, 10)

/** Une date "YYYY-MM-DD" est passée si strictement antérieure à `today`. */
export function isPast(date: string, today: string = todayIso()): boolean {
  return date < today
}

export function partitionTournees(
  tournees: Tournee[],
  today: string = todayIso(),
): { upcoming: Tournee[]; past: Tournee[] } {
  const upcoming: Tournee[] = []
  const past: Tournee[] = []
  for (const t of tournees) (isPast(t.date, today) ? past : upcoming).push(t)
  return { upcoming, past }
}
