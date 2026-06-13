import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'
import type { Suggestion } from '../types'

const wrapper = ({ children }: { children: ReactNode }) => (
  <LivreurProvider>{children}</LivreurProvider>
)

const SUG: Suggestion = {
  id: 'sug1', label: '11 rue du Loup Pendu', ville: 'Le Plessis-Robinson', lat: 48.7784, lng: 2.2596,
}

describe('LivreurContext', () => {
  beforeEach(() => localStorage.clear())

  it('démarre avec les 12 arrêts seed répartis en 3 tournées', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    expect(result.current.stops.length).toBe(12)
    expect(result.current.routes.karim.stops.length).toBe(4)
  })

  it('addStop ajoute un arrêt depuis une suggestion (lat/lng conservés)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addStop(SUG))
    expect(result.current.stops.length).toBe(13)
    const added = result.current.stops[result.current.stops.length - 1]
    expect(added).toMatchObject({ label: SUG.label, ville: SUG.ville, lat: SUG.lat, lng: SUG.lng, driver: null })
  })

  it("advance borne la progression au nombre d'arrêts", () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    const n = result.current.routes.karim.stops.length
    act(() => {
      for (let i = 0; i < n + 3; i++) result.current.advance('karim')
    })
    expect(result.current.progress.karim).toBe(n)
  })

  it("removeStop retire l'arrêt", () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.removeStop('s1'))
    expect(result.current.stops.some((s) => s.id === 's1')).toBe(false)
  })
})
