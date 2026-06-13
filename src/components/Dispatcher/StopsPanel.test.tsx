import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopsPanel } from './StopsPanel'
import { SEED_STOPS } from '../../data/seed'
import type { AddressProvider } from '../../services/addressProvider'

const provider: AddressProvider = {
  suggest: vi.fn().mockResolvedValue([]),
  geocodeFirst: vi.fn(),
}

const base = {
  stops: SEED_STOPS,
  assign: {} as Record<string, string>,
  provider,
  activeColor: 'var(--c-1)',
  addStop: vi.fn(),
  addBulk: vi.fn(),
  removeStop: vi.fn(),
}

describe('StopsPanel', () => {
  it('clic sur un arrêt l’affecte au chauffeur actif', () => {
    const assignStop = vi.fn()
    render(<StopsPanel {...base} assignStop={assignStop} />)
    fireEvent.click(screen.getByText('Malakoff'))
    expect(assignStop).toHaveBeenCalledWith('s1')
  })

  it('clic sur la croix retire l’arrêt', () => {
    const removeStop = vi.fn()
    render(<StopsPanel {...base} assignStop={vi.fn()} removeStop={removeStop} />)
    fireEvent.click(screen.getAllByLabelText('Retirer')[0])
    expect(removeStop).toHaveBeenCalledWith('s1')
  })
})
