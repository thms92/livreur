import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PeageBadge } from './PeageBadge'

describe('PeageBadge', () => {
  it('annonce « Sans péage » quand la tournée évite les péages', () => {
    render(<PeageBadge sansPeage={true} />)
    expect(screen.getByText('Sans péage')).toBeInTheDocument()
  })

  it('annonce « Avec péage » sinon', () => {
    render(<PeageBadge sansPeage={false} />)
    expect(screen.getByText('Avec péage')).toBeInTheDocument()
  })

  it('sans mode enregistré, applique le défaut de l’app (sans péage)', () => {
    render(<PeageBadge sansPeage={undefined} />)
    expect(screen.getByText('Sans péage')).toBeInTheDocument()
  })

  it('distingue les deux états par une classe, pas seulement par le texte', () => {
    const { container: sans } = render(<PeageBadge sansPeage={true} />)
    const { container: avec } = render(<PeageBadge sansPeage={false} />)
    expect(sans.firstChild).toHaveClass('peage-sans')
    expect(avec.firstChild).toHaveClass('peage-avec')
  })
})
