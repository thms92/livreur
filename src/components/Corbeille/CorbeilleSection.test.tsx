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

vi.mock('../../state/LivreurContext', () => ({
  useLivreur: () => ({ restaurer, livreurs: [{ id: 'l1', nom: 'MACE', prenom: 'Julian', couleur: 'var(--c-1)' }] }),
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
})
