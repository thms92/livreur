import { describe, it, expect } from 'vitest'
import { makeStopId } from './stopId'

describe('makeStopId', () => {
  it('génère des identifiants uniques préfixés', () => {
    const a = makeStopId()
    const b = makeStopId()
    expect(a).not.toBe(b)
    expect(a.startsWith('a')).toBe(true)
  })
})
