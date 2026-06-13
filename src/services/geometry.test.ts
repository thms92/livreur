import { describe, it, expect } from 'vitest'
import { dist, pathLen, pathD, bbox } from './geometry'

describe('geometry', () => {
  it('dist : distance euclidienne', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
  it('pathLen : somme des segments', () => {
    expect(pathLen([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 }])).toBe(5)
  })
  it('pathD : commande SVG M/L', () => {
    expect(pathD([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M1 2 L3 4')
  })
  it('bbox : englobant + padding', () => {
    expect(bbox([{ x: 0, y: 0 }, { x: 10, y: 20 }], 5)).toEqual({ x: -5, y: -5, w: 20, h: 30 })
  })
})
