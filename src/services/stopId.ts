let seq = 0

export function makeStopId(): string {
  seq += 1
  return 'a' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6)
}
