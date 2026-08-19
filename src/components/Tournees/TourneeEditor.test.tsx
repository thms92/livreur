import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TourneeEditor } from './TourneeEditor'
import type { Tournee } from '../../types'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

const setSansPeage = vi.fn()

const tournee: Tournee = {
  id: 't1', livreurId: 'l1', date: '2026-08-19',
  stops: [{ id: 's1', label: 'A', ville: 'V', lat: 48, lng: 1 }],
  route: { km: 47, min: 72, geometry: [], optimized: false, approximate: false },
  sansPeage: true,
}

vi.mock('../../state/LivreurContext', () => ({
  useLivreur: () => ({
    livreurs: [{ id: 'l1', nom: 'B', prenom: 'K', telephone: '', colorIndex: 0, couleur: 'var(--c-1)' }],
    tournees: [{ ...tournee, ...override }],
    provider: { search: async () => [] },
    adresses: [],
    removeAdresse: vi.fn(), updateTournee: vi.fn(), addStopToTournee: vi.fn(),
    removeStopFromTournee: vi.fn(), reorderStops: vi.fn(), setStopHeure: vi.fn(),
    setTourneeHeure: vi.fn(), sortTourneeByTime: vi.fn(), optimizeTournee: vi.fn(),
    setSansPeage,
  }),
}))

let override: Partial<Tournee> = {}

describe('TourneeEditor — option péage', () => {
  it('la case « Sans péage » est cochée quand la tournée évite les péages', () => {
    override = { sansPeage: true }
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /sans péage/i })).toBeChecked()
  })

  it('la case est décochée en mode péages autorisés', () => {
    override = { sansPeage: false }
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /sans péage/i })).not.toBeChecked()
  })

  it('décocher demande le recalcul en mode péages autorisés', async () => {
    override = { sansPeage: true }
    setSansPeage.mockClear()
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /sans péage/i }))
    expect(setSansPeage).toHaveBeenCalledWith('t1', false)
  })

  it('une tournée sans mode enregistré est traitée comme sans péage', () => {
    override = { sansPeage: undefined }
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /sans péage/i })).toBeChecked()
  })
})
