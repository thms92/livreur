import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LivreurProvider } from '../../state/LivreurContext'
import { LivreursSection } from './LivreursSection'

afterEach(() => localStorage.clear())

const renderSection = () =>
  render(
    <LivreurProvider>
      <LivreursSection />
    </LivreurProvider>,
  )

describe('LivreursSection', () => {
  it('ajoute un livreur via le formulaire', async () => {
    renderSection()
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.type(screen.getByLabelText('Téléphone'), '0612345678')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Karim Benali')).toBeInTheDocument()
    expect(screen.getByText('0612345678')).toBeInTheDocument()
  })

  it("n'ajoute pas si nom ou prénom manquant", async () => {
    renderSection()
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.queryByText(/Benali/)).not.toBeInTheDocument()
  })

  it('supprime un livreur', async () => {
    vi.stubGlobal('confirm', () => true)
    renderSection()
    await userEvent.type(screen.getByLabelText('Nom'), 'Benali')
    await userEvent.type(screen.getByLabelText('Prénom'), 'Karim')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await userEvent.click(screen.getByRole('button', { name: /Supprimer/ }))
    expect(screen.queryByText('Karim Benali')).not.toBeInTheDocument()
  })
})
