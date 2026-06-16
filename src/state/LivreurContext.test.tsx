import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <LivreurProvider>{children}</LivreurProvider>

afterEach(() => localStorage.clear())

describe('LivreurContext — livreurs', () => {
  it('démarre à vide', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    expect(result.current.livreurs).toEqual([])
    expect(result.current.tournees).toEqual([])
  })

  it('ajoute un livreur avec une couleur auto (index 0 puis 1)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '0612345678' }))
    act(() => result.current.addLivreur({ nom: 'Martin', prenom: 'Léa', telephone: '' }))
    expect(result.current.livreurs).toHaveLength(2)
    expect(result.current.livreurs[0]).toMatchObject({ nom: 'Benali', prenom: 'Karim', colorIndex: 0 })
    expect(result.current.livreurs[1].colorIndex).toBe(1)
    expect(result.current.livreurs[0].couleur).toBe('var(--c-1)')
  })

  it('modifie un livreur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '' }))
    const id = result.current.livreurs[0].id
    act(() => result.current.updateLivreur(id, { telephone: '0700000000' }))
    expect(result.current.livreurs[0].telephone).toBe('0700000000')
  })

  it('supprime un livreur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '' }))
    const id = result.current.livreurs[0].id
    act(() => result.current.removeLivreur(id))
    expect(result.current.livreurs).toEqual([])
  })
})
