import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  beforeEach(() => localStorage.clear())

  it('affiche le répartiteur puis bascule en vue chauffeur (répartition implicite)', () => {
    render(<App />)
    expect(screen.getByText('Répartition des tournées')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Vue chauffeur'))
    // en vue chauffeur, la note continue est visible
    expect(screen.getByText(/Une seule tournée continue/)).toBeInTheDocument()
  })

  it('« Répartir par zone » affiche les cartes chauffeur', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Répartir par zone'))
    expect(screen.getAllByText('RÉPARTI').length).toBeGreaterThan(0)
  })
})
