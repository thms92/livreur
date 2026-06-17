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
  it('ne propose que les dates ayant des tournées et se cale dessus par défaut', async () => {
    render(
      <LivreurProvider>
        <Seeder />
        <ChauffeursSection />
      </LivreurProvider>,
    )
    const seed = screen.getByText('seed')
    await act(async () => { seed.click() }) // ajoute le livreur
    // pas encore de tournée → pas de sélecteur de date
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()

    await act(async () => { seed.click() }) // ajoute une tournée le 2026-06-16
    // la date par défaut = la seule date ayant une tournée → le chauffeur s'affiche
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
    // le sélecteur existe et affiche la date en clair
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.getByText(/16 juin 2026/)).toBeInTheDocument()
  })
})
