import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => (
  <LivreurProvider>{children}</LivreurProvider>
)

describe('LivreurContext', () => {
  beforeEach(() => localStorage.clear())

  it('démarre avec les 12 arrêts seed répartis en 3 tournées', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    expect(result.current.stops.length).toBe(12)
    expect(result.current.routes.karim.stops.length).toBe(4)
  })

  it("advance borne la progression au nombre d'arrêts", () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    const n = result.current.routes.karim.stops.length
    act(() => {
      for (let i = 0; i < n + 3; i++) result.current.advance('karim')
    })
    expect(result.current.progress.karim).toBe(n)
  })

  it('addStop géocode et ajoute un arrêt (recalcul en direct)', async () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    await act(async () => {
      await result.current.addStop('1 rue de Test, Clamart')
    })
    await waitFor(() => expect(result.current.stops.length).toBe(13))
  })

  it("removeStop retire l'arrêt", () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.removeStop('s1'))
    expect(result.current.stops.some((s) => s.id === 's1')).toBe(false)
  })
})
