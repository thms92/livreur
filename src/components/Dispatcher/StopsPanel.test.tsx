import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopsPanel } from './StopsPanel'
import { SEED_STOPS } from '../../data/seed'
import type { AddressProvider } from '../../services/addressProvider'

const provider: AddressProvider = {
  suggest: vi.fn().mockResolvedValue([]),
  geocodeFirst: vi.fn(),
}

describe('StopsPanel', () => {
  it('liste les arrêts et appelle removeStop au clic sur la croix', () => {
    const removeStop = vi.fn()
    render(
      <StopsPanel
        stops={SEED_STOPS} assign={{}} dispatched={false} provider={provider}
        addStop={vi.fn()} addBulk={vi.fn()} removeStop={removeStop}
      />,
    )
    expect(screen.getByText('Malakoff')).toBeInTheDocument()
    fireEvent.click(screen.getAllByLabelText('Retirer')[0])
    expect(removeStop).toHaveBeenCalledWith('s1')
  })
})
