import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
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

afterEach(() => localStorage.clear())

function Seeder() {
  const { addLivreur, livreurs, addTournee } = useLivreur()
  return (
    <button
      onClick={() => {
        if (!livreurs.length) addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '0612' })
        else addTournee({ livreurId: livreurs[0].id, date: '2026-06-16' })
      }}
    >
      seed
    </button>
  )
}

describe('ChauffeursSection', () => {
  it('liste les chauffeurs et filtre par date', async () => {
    render(
      <LivreurProvider>
        <Seeder />
        <ChauffeursSection />
      </LivreurProvider>,
    )
    const seed = screen.getByText('seed')
    await act(async () => { seed.click() })
    await act(async () => { seed.click() })
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    await act(async () => {
      dateInput.value = '2026-06-16'
      dateInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
  })
})
