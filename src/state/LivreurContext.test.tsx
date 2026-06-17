import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LivreurProvider, useLivreur } from './LivreurContext'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

vi.mock('../services/routing', () => ({
  optimizeTrip: vi.fn(async (stops: { id: string }[]) => ({
    order: stops.map((_, i) => stops.length - 1 - i), // inverse l'ordre, déterministe
    route: { km: 10, min: 15, geometry: [], optimized: true, approximate: false },
  })),
  computeRoute: vi.fn(async () => ({ km: 5, min: 8, geometry: [], optimized: false, approximate: false })),
}))

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

const sugg = (label: string, lat: number, lng: number) => ({ id: label, label, ville: 'V', lat, lng })

describe('LivreurContext — tournées', () => {
  it('crée une tournée pour un livreur', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    const lid = result.current.livreurs[0].id
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: lid, date: '2026-06-16' }) })
    expect(result.current.tournees).toHaveLength(1)
    expect(result.current.tournees[0]).toMatchObject({ id: tid, livreurId: lid, date: '2026-06-16', stops: [] })
  })

  it('ajoute / supprime des arrêts (route invalidée)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-16' }) })
    act(() => result.current.addStopToTournee(tid, sugg('A', 48.4, 1.6)))
    act(() => result.current.addStopToTournee(tid, sugg('B', 48.2, 1.9)))
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['A', 'B'])
    const sid = result.current.tournees[0].stops[0].id
    act(() => result.current.removeStopFromTournee(tid, sid))
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['B'])
  })

  it('réordonne les arrêts manuellement', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-16' }) })
    act(() => result.current.addStopToTournee(tid, sugg('A', 48.4, 1.6)))
    act(() => result.current.addStopToTournee(tid, sugg('B', 48.2, 1.9)))
    act(() => result.current.addStopToTournee(tid, sugg('C', 48.1, 2.0)))
    act(() => result.current.reorderStops(tid, 0, 2))
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['B', 'C', 'A'])
  })

  it('optimise la tournée via le service (ordre + route)', async () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-16' }) })
    act(() => result.current.addStopToTournee(tid, sugg('A', 48.4, 1.6)))
    act(() => result.current.addStopToTournee(tid, sugg('B', 48.2, 1.9)))
    await act(async () => { await result.current.optimizeTournee(tid) })
    expect(result.current.tournees[0].stops.map((s) => s.label)).toEqual(['B', 'A'])
    expect(result.current.tournees[0].route).toMatchObject({ km: 10, min: 15, optimized: true })
  })

  it('supprimer un livreur supprime ses tournées (cascade)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    const lid = result.current.livreurs[0].id
    act(() => { result.current.addTournee({ livreurId: lid, date: '2026-06-16' }) })
    act(() => result.current.removeLivreur(lid))
    expect(result.current.tournees).toEqual([])
  })
})

describe('LivreurContext — carnet d’adresses', () => {
  it('mémorise automatiquement l’adresse ajoutée (dédup par id)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-18' }) })
    const a = { id: 'ban-1', label: '12 Rue des Lilas', ville: 'Chartres', lat: 48, lng: 1 }
    act(() => result.current.addStopToTournee(tid, a))
    act(() => result.current.addStopToTournee(tid, a)) // même adresse → pas de doublon
    expect(result.current.adresses).toHaveLength(1)
    expect(result.current.adresses[0]).toMatchObject({ id: 'ban-1', label: '12 Rue des Lilas', ville: 'Chartres' })
  })

  it('removeAdresse retire l’entrée du carnet', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-18' }) })
    act(() => result.current.addStopToTournee(tid, { id: 'ban-9', label: 'X', ville: 'Y', lat: 0, lng: 0 }))
    expect(result.current.adresses).toHaveLength(1)
    act(() => result.current.removeAdresse('ban-9'))
    expect(result.current.adresses).toEqual([])
  })
})
