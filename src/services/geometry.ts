import type { Point } from '../types'

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pathLen(pts: Point[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i])
  return L
}

export function pathD(pts: Point[]): string {
  return pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y).join(' ')
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function bbox(pts: Point[], pad: number): Box {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minx = Math.min(...xs) - pad
  const miny = Math.min(...ys) - pad
  const maxx = Math.max(...xs) + pad
  const maxy = Math.max(...ys) + pad
  return { x: minx, y: miny, w: maxx - minx, h: maxy - miny }
}
