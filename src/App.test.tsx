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

vi.mock('./services/api', () => ({
  api: {
    getState: vi.fn(async () => ({ livreurs: [], tournees: [], adresses: [] })),
    createLivreur: vi.fn(async (i: { nom: string; prenom: string; telephone: string }) => ({
      id: 'L1', ...i, colorIndex: 0,
    })),
    updateLivreur: vi.fn(async () => ({ ok: true })),
    deleteLivreur: vi.fn(async () => ({ ok: true })),
    createTournee: vi.fn(async (i: { livreurId: string; date: string }) => ({ id: 'T1', ...i, stops: [] })),
    updateTournee: vi.fn(async () => ({ ok: true })),
    deleteTournee: vi.fn(async () => ({ ok: true })),
    upsertAdresse: vi.fn(async () => ({ ok: true })),
    deleteAdresse: vi.fn(async () => ({ ok: true })),
  },
}))

afterEach(() => localStorage.clear())

describe('App (smoke)', () => {
  it('créer un livreur → créer une tournée → le retrouver dans Chauffeurs', async () => {
    render(<App />)

    // attendre la fin du chargement initial (getState)
    await userEvent.click(await screen.findByRole('button', { name: /Livreurs/ }))
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Karim Benali')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Tournées/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle tournée' }))
    expect(await screen.findByText(/Ajouter un arrêt/)).toBeInTheDocument()

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-06-16')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la tournée' }))

    await userEvent.click(screen.getByRole('button', { name: /Chauffeurs/ }))
    // la date par défaut se cale sur la seule date ayant une tournée
    expect(await screen.findByText('Karim Benali')).toBeInTheDocument()
  })
})
