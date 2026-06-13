export const PALETTE_SIZE = 8

export function driverColor(colorIndex: number): string {
  const n = ((colorIndex % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE
  return `var(--c-${n + 1})`
}

/** Plus petit index de couleur non utilisé (peut dépasser PALETTE_SIZE, driverColor cycle). */
export function nextColorIndex(used: number[]): number {
  const set = new Set(used)
  let i = 0
  while (set.has(i)) i++
  return i
}
