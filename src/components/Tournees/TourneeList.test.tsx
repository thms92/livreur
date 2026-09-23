import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TourneeList } from './TourneeList'
import type { Tournee } from '../../types'

const tournees: Tournee[] = [
  {
    id: 't1', livreurId: 'l1', date: '2999-08-20',
    stops: [{ id: 's1', label: 'A', ville: 'Baule', lat: 48, lng: 1 }],
    route: { km: 173, min: 161, geometry: [], optimized: false, approximate: false },
    sansPeage: false,
  },
  {
    id: 't2', livreurId: 'l2', date: '2999-08-19',
    stops: [{ id: 's2', label: 'B', ville: 'Olivet', lat: 48, lng: 1 }],
    route: { km: 355, min: 358, geometry: [], optimized: false, approximate: false },
    sansPeage: true,
  },
]

const actifs = [
  { id: 'l1', nom: 'MACE', prenom: 'Julian', telephone: '', colorIndex: 0, couleur: 'var(--c-1)' },
]
// Maxime LAGNEAU est parti à la corbeille : il ne figure plus parmi les actifs et
// n'est plus nommable que par la liste complète.
const supprime = {
  id: 'l2', nom: 'LAGNEAU', prenom: 'Maxime', telephone: '', colorIndex: 1,
  couleur: 'var(--c-2)', deletedAt: 1758500000000,
}

vi.mock('../../state/LivreurContext', () => ({
  useLivreur: () => ({
    tournees,
    livreurs: actifs,
    livreursTous: [...actifs, supprime],
    removeTournee: vi.fn(),
  }),
}))

describe('TourneeList — mode péage', () => {
  it('chaque ligne porte sa pastille, dans les deux états', () => {
    render(<TourneeList onOpen={() => {}} onDuplicate={() => {}} />)
    const lignes = screen.getAllByRole('listitem')
    expect(within(lignes[0]).getByText('Avec péage')).toBeInTheDocument()
    expect(within(lignes[1]).getByText('Sans péage')).toBeInTheDocument()
  })

  it('n’écrase pas les chiffres déjà affichés', () => {
    render(<TourneeList onOpen={() => {}} onDuplicate={() => {}} />)
    const ligne = screen.getAllByRole('listitem')[0]
    expect(within(ligne).getByText(/173 km/)).toBeInTheDocument()
    expect(within(ligne).getByText(/2 h 41/)).toBeInTheDocument()
  })
})

describe('TourneeList — livreur mis à la corbeille', () => {
  it('nomme encore le livreur d’une tournée dont le livreur a été supprimé', () => {
    render(<TourneeList onOpen={() => {}} onDuplicate={() => {}} />)
    const ligne = screen.getAllByRole('listitem')[1]
    expect(within(ligne).getByText('Maxime LAGNEAU')).toBeInTheDocument()
  })
})
