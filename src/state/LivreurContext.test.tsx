import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <LivreurProvider>{children}</LivreurProvider>

describe('LivreurContext — chauffeurs dynamiques', () => {
  beforeEach(() => localStorage.clear())

  it('démarre avec 3 chauffeurs et les 12 arrêts seed groupés', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    expect(result.current.drivers.map((d) => d.id)).toEqual(['karim', 'lea', 'sofiane'])
    expect(result.current.routes.karim.stops.length).toBe(4)
  })

  it('addDriver ajoute un chauffeur avec une couleur libre', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addDriver('Michel'))
    const michel = result.current.drivers.find((d) => d.nom === 'Michel')!
    expect(michel).toBeTruthy()
    expect(michel.couleur).toBe('var(--c-4)')
    expect(result.current.routes[michel.id].stops.length).toBe(0)
  })

  it('renameDriver renomme', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.renameDriver('karim', 'Karim B.'))
    expect(result.current.drivers.find((d) => d.id === 'karim')!.nom).toBe('Karim B.')
  })

  it('removeDriver supprime et repasse ses arrêts en non affectés', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.removeDriver('karim'))
    expect(result.current.drivers.some((d) => d.id === 'karim')).toBe(false)
    expect(result.current.stops.filter((s) => s.driver === 'karim').length).toBe(0)
    expect(result.current.stops.some((s) => s.id === 's1' && s.driver === null)).toBe(true)
  })

  it('ne supprime pas le dernier chauffeur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => {
      result.current.removeDriver('karim')
      result.current.removeDriver('lea')
      result.current.removeDriver('sofiane')
    })
    expect(result.current.drivers.length).toBeGreaterThanOrEqual(1)
  })

  it('assignStop affecte un arrêt au chauffeur actif puis le désaffecte', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.assignStop('s5', 'karim'))
    expect(result.current.stops.find((s) => s.id === 's5')!.driver).toBe('karim')
    act(() => result.current.assignStop('s5', null))
    expect(result.current.stops.find((s) => s.id === 's5')!.driver).toBeNull()
  })

  it('autoAssign réaffecte les arrêts non affectés', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.assignStop('s5', null))
    act(() => result.current.autoAssign())
    expect(result.current.stops.find((s) => s.id === 's5')!.driver).not.toBeNull()
  })
})
