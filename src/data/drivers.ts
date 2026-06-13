import type { Driver, Point } from '../types'

export const DEPOT: Point & { id: string; ville: string } = {
  id: 'depot',
  ville: 'Dépôt',
  x: 480,
  y: 116,
}

export const DRIVERS: Driver[] = [
  { id: 'karim',   nom: 'Karim',   couleur: 'var(--c-karim)',   couleurHex: '#2f6df0', center: { x: 394, y: 207 } },
  { id: 'lea',     nom: 'Léa',     couleur: 'var(--c-lea)',     couleurHex: '#e0892a', center: { x: 535, y: 366 } },
  { id: 'sofiane', nom: 'Sofiane', couleur: 'var(--c-sofiane)', couleurHex: '#2f9e54', center: { x: 473, y: 564 } },
]
