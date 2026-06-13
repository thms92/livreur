import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopsPanel } from './StopsPanel'
import { SEED_STOPS } from '../../data/seed'

describe('StopsPanel', () => {
  it('appelle addStop avec la saisie et vide le champ', () => {
    const addStop = vi.fn()
    render(
      <StopsPanel stops={SEED_STOPS} assign={{}} dispatched={false} addStop={addStop} addBulk={vi.fn()} removeStop={vi.fn()} />,
    )
    const input = screen.getByPlaceholderText('Adresse, commune…') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1 rue Test, Clamart' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(addStop).toHaveBeenCalledWith('1 rue Test, Clamart')
  })

  it('appelle removeStop au clic sur la croix', () => {
    const removeStop = vi.fn()
    render(
      <StopsPanel stops={SEED_STOPS} assign={{}} dispatched={false} addStop={vi.fn()} addBulk={vi.fn()} removeStop={removeStop} />,
    )
    fireEvent.click(screen.getAllByLabelText('Retirer')[0])
    expect(removeStop).toHaveBeenCalledWith('s1')
  })
})
