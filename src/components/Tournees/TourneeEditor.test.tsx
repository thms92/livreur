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

const actif = { id: 'l1', nom: 'B', prenom: 'K', telephone: '', colorIndex: 0, couleur: 'var(--c-1)' }
// Livreur mis à la corbeille : il ne doit plus être proposé à l'affectation.
const supprime = {
  id: 'l9', nom: 'PARTI', prenom: 'P', telephone: '', colorIndex: 1,
  couleur: 'var(--c-2)', deletedAt: 1758500000000,
}

vi.mock('../../state/LivreurContext', () => ({
  useLivreur: () => ({
    livreurs: [actif],
    livreursTous: [actif, supprime],
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

describe('TourneeEditor — attribution', () => {
  it('indique qui a créé et qui a modifié la tournée', () => {
    override = { createdBy: 'Thomas', updatedBy: 'Alexis' }
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    expect(screen.getByText(/Créée par Thomas/)).toBeInTheDocument()
    expect(screen.getByText(/modifiée par Alexis/)).toBeInTheDocument()
  })

  it('ne montre rien quand l’attribution est inconnue', () => {
    override = { createdBy: undefined, updatedBy: undefined }
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    expect(screen.queryByText(/Créée par/)).not.toBeInTheDocument()
  })
})

// Le sondage adopte l'état du serveur toutes les 60 s : si le collègue met à la corbeille
// la tournée ouverte ici, elle quitte `tournees` sous les pieds de l'éditeur. Rendre
// `null` laissait alors tout le volet Tournées vide — pas de liste, pas de message, et
// surtout pas le bouton « ← Retour », qui vit dans l'éditeur : seul un rechargement de la
// page permettait d'en sortir.
describe('TourneeEditor — tournée disparue', () => {
  it('explique la disparition et laisse revenir à la liste', async () => {
    override = {}
    const onClose = vi.fn()

    render(<TourneeEditor tourneeId="t-disparue" onClose={onClose} />)

    expect(screen.getByText(/plus disponible/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retour/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TourneeEditor — affectation', () => {
  it('n’offre que les livreurs actifs dans le sélecteur', () => {
    override = {}
    render(<TourneeEditor tourneeId="t1" onClose={() => {}} />)
    expect(screen.getByRole('option', { name: 'K B' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'P PARTI' })).not.toBeInTheDocument()
  })
})
