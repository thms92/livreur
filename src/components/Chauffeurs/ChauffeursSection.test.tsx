import { render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LivreurProvider, useLivreur } from '../../state/LivreurContext'
import { ChauffeursSection } from './ChauffeursSection'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

vi.mock('../../services/api', () => ({
  api: {
    getState: vi.fn(async () => ({ livreurs: [], tournees: [], adresses: [] })),
    createLivreur: vi.fn(async (i: { nom: string; prenom: string; telephone: string }) => ({
      id: 'L1', ...i, colorIndex: 0,
    })),
    createTournee: vi.fn(async (i: { livreurId: string; date: string }) => ({ id: 'T1', ...i, stops: [] })),
  },
}))

beforeEach(() => vi.clearAllMocks())
afterEach(() => localStorage.clear())

function Seeder() {
  const { addLivreur, livreurs, addTournee } = useLivreur()
  return (
    <button
      onClick={async () => {
        if (!livreurs.length) await addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '0612' })
        else await addTournee({ livreurId: livreurs[0].id, date: '2026-06-16' })
      }}
    >
      seed
    </button>
  )
}

describe('ChauffeursSection', () => {
  it('ne propose que les dates ayant des tournées et se cale dessus par défaut', async () => {
    render(
      <LivreurProvider>
        <Seeder />
        <ChauffeursSection />
      </LivreurProvider>,
    )
    const seed = await screen.findByText('seed')
    await act(async () => { seed.click() }) // ajoute le livreur
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()

    await act(async () => { seed.click() }) // ajoute une tournée le 2026-06-16
    expect(await screen.findByText('Karim Benali')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.getByText(/16 juin 2026/)).toBeInTheDocument()
  })
})
