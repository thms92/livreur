import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistentState } from './usePersistentState'

describe('usePersistentState', () => {
  beforeEach(() => localStorage.clear())

  it('utilise la valeur par défaut puis la persiste sous livreur:', () => {
    const { result } = renderHook(() => usePersistentState('screen', 'dispatch'))
    expect(result.current[0]).toBe('dispatch')
    act(() => result.current[1]('driver'))
    expect(result.current[0]).toBe('driver')
    expect(localStorage.getItem('livreur:screen')).toBe('"driver"')
  })

  it('relit la valeur existante du localStorage', () => {
    localStorage.setItem('livreur:count', '7')
    const { result } = renderHook(() => usePersistentState('count', 0))
    expect(result.current[0]).toBe(7)
  })
})
