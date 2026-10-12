import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Nouveautes, VERSION_NOUVEAUTES } from './Nouveautes'

const CLE = 'livreur:v3:nouveautes-vues'

afterEach(() => localStorage.clear())

describe('Nouveautes', () => {
  it('s’affiche tant que cette version n’a pas été vue', () => {
    render(<Nouveautes />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/mise à jour/i)).toBeInTheDocument()
  })

  it('disparaît après lecture et ne revient plus', async () => {
    const { unmount } = render(<Nouveautes />)
    await userEvent.click(screen.getByRole('button', { name: /compris/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(CLE)).toContain(VERSION_NOUVEAUTES)

    unmount()
    render(<Nouveautes />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ne s’affiche pas si cette version a déjà été vue', () => {
    localStorage.setItem(CLE, JSON.stringify(VERSION_NOUVEAUTES))
    render(<Nouveautes />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('réapparaît quand une nouvelle version est publiée', () => {
    localStorage.setItem(CLE, JSON.stringify('une-version-plus-ancienne'))
    render(<Nouveautes />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('annonce les deux nouveautés du jour, et rien d’autre', () => {
    render(<Nouveautes />)
    const d = screen.getByRole('dialog')
    expect(d).toHaveTextContent(/relancer le calcul/i)
    expect(d).toHaveTextContent(/n'imprimez pas|n’imprimez pas/i)
    expect(d).toHaveTextContent(/rapide/i)
    // Les chantiers précédents ne doivent pas y figurer.
    expect(d).not.toHaveTextContent(/corbeille/i)
    expect(d).not.toHaveTextContent(/optimisation/i)
  })

  it('un stockage inaccessible n’empêche pas l’app de démarrer', () => {
    const vrai = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('mode privé') }
    expect(() => render(<Nouveautes />)).not.toThrow()
    Storage.prototype.getItem = vrai
  })
})
