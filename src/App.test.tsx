import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}))

afterEach(() => localStorage.clear())

describe('App (smoke)', () => {
  it('créer un livreur → créer une tournée → le retrouver dans Chauffeurs', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /Livreurs/ }))
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Tournées/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle tournée' }))
    expect(screen.getByText(/Ajouter un arrêt/)).toBeInTheDocument()

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-06-16')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la tournée' }))

    await userEvent.click(screen.getByRole('button', { name: /Chauffeurs/ }))
    const chDate = screen.getByLabelText('Date') as HTMLInputElement
    await userEvent.clear(chDate)
    await userEvent.type(chDate, '2026-06-16')
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
  })
})
