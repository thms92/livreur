import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CorbeilleSection } from './CorbeilleSection'

const restaurer = vi.fn()

vi.mock('../../services/api', () => ({
  api: {
    getCorbeille: vi.fn(async () => ({
      tournees: [{
        id: 't1', livreurId: 'l1', date: '2026-09-11', stops: [], version: 1,
        deletedAt: 1758500000000, deletedBy: 'Alexis',
      }],
      livreurs: [],
    })),
  },
}))

// Le livreur de la tournée supprimée est lui-même à la corbeille : il a quitté les
// actifs, et l'écran fait pour restaurer est le dernier où son nom doit rester lisible.
vi.mock('../../state/LivreurContext', () => ({
  useLivreur: () => ({
    restaurer,
    livreurs: [],
    livreursTous: [{
      id: 'l1', nom: 'MACE', prenom: 'Julian', couleur: 'var(--c-1)', deletedAt: 1758500000000,
    }],
  }),
}))

describe('CorbeilleSection', () => {
  it('liste les tournées supprimées avec leur auteur', async () => {
    render(<CorbeilleSection />)
    expect(await screen.findByText(/2026-09-11/)).toBeInTheDocument()
    expect(screen.getByText(/Alexis/)).toBeInTheDocument()
  })

  it('restaure une tournée', async () => {
    render(<CorbeilleSection />)
    await userEvent.click(await screen.findByRole('button', { name: /restaurer/i }))
    await waitFor(() => expect(restaurer).toHaveBeenCalledWith('t1', 'tournee'))
  })

  it('annonce une corbeille vide', async () => {
    const { api } = await import('../../services/api')
    vi.mocked(api.getCorbeille).mockResolvedValueOnce({ tournees: [], livreurs: [] })
    render(<CorbeilleSection />)
    expect(await screen.findByText(/corbeille est vide/i)).toBeInTheDocument()
  })

  it('nomme le livreur d’une tournée même s’il est lui aussi à la corbeille', async () => {
    render(<CorbeilleSection />)
    expect(await screen.findByText('Julian MACE')).toBeInTheDocument()
  })

  // Une lecture qui échoue sans être rattrapée laisserait l'écran sur « Chargement… »
  // indéfiniment, sans rien dire — sur le seul écran dont le métier est de rendre ce
  // qu'on a supprimé par erreur.
  it('annonce l’échec de lecture au lieu de rester sur le chargement', async () => {
    const { api } = await import('../../services/api')
    vi.mocked(api.getCorbeille).mockRejectedValueOnce(new Error('réseau'))
    render(<CorbeilleSection />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/corbeille/i)
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument()
  })
})
