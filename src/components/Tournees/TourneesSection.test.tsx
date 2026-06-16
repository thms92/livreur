import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LivreurProvider } from '../../state/LivreurContext'
import { TourneesSection } from './TourneesSection'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

afterEach(() => localStorage.clear())

describe('TourneesSection', () => {
  it("sans livreur, \"Nouvelle tournée\" alerte et n'ouvre pas l'éditeur", async () => {
    vi.stubGlobal('alert', vi.fn())
    render(
      <LivreurProvider>
        <TourneesSection />
      </LivreurProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle tournée' }))
    expect(screen.queryByText(/Ajouter un arrêt/)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
