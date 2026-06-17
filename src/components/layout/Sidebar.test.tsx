import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LivreurProvider, useLivreur } from '../../state/LivreurContext'
import { Sidebar } from './Sidebar'

afterEach(() => localStorage.clear())

function Probe() {
  const { section } = useLivreur()
  return <span data-testid="section">{section}</span>
}

describe('Sidebar', () => {
  it('affiche les 3 sections et change la section active au clic', async () => {
    render(
      <LivreurProvider>
        <Sidebar />
        <Probe />
      </LivreurProvider>,
    )
    expect(screen.getByRole('button', { name: /Livreurs/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chauffeurs/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Livreurs/ }))
    expect(screen.getByTestId('section')).toHaveTextContent('livreurs')
  })
})
