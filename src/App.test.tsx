import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('affiche le répartiteur (titre + arrêts seed)', () => {
    render(<App />)
    expect(screen.getByText('Répartition des tournées')).toBeInTheDocument()
    expect(screen.getByText('Malakoff')).toBeInTheDocument()
  })

  it('« Répartir par zone » affiche les cartes chauffeur', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Répartir par zone'))
    expect(screen.getAllByText('RÉPARTI').length).toBeGreaterThan(0)
  })
})
