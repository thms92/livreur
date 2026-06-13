import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  AttributionControl: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('affiche le répartiteur et les arrêts seed', () => {
    render(<App />)
    expect(screen.getByText('Répartition des tournées')).toBeInTheDocument()
    expect(screen.getByText('Malakoff')).toBeInTheDocument()
  })

  it('ajoute un chauffeur « Michel »', () => {
    render(<App />)
    const input = screen.getByPlaceholderText('Nom du chauffeur…')
    fireEvent.change(input, { target: { value: 'Michel' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByText('Michel').length).toBeGreaterThan(0)
  })
})
