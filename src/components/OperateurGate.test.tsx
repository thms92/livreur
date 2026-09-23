import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { OperateurGate } from './OperateurGate'
import { getOperateur } from '../state/operateur'

afterEach(() => localStorage.clear())

describe('OperateurGate', () => {
  it('demande le nom tant qu’aucun n’est enregistré', () => {
    render(<OperateurGate><p>contenu</p></OperateurGate>)
    expect(screen.getByLabelText(/votre nom/i)).toBeInTheDocument()
    expect(screen.queryByText('contenu')).not.toBeInTheDocument()
  })

  it('mémorise le nom saisi et laisse passer', async () => {
    render(<OperateurGate><p>contenu</p></OperateurGate>)
    await userEvent.type(screen.getByLabelText(/votre nom/i), 'Thomas')
    await userEvent.click(screen.getByRole('button', { name: /continuer/i }))
    expect(getOperateur()).toBe('Thomas')
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })

  it('n’interroge plus une fois le nom connu', () => {
    localStorage.setItem('livreur:v3:operateur', JSON.stringify('Alexis'))
    render(<OperateurGate><p>contenu</p></OperateurGate>)
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })
})
