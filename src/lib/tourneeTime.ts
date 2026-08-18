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

/**
 * Formate une durée en minutes pour l'affichage : "1 h 12", "2 h", "45 min".
 * En dessous d'une heure on reste en minutes, plus lisible qu'un "0 h 45".
 */
export function formatDuree(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}
