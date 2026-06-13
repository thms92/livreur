import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddressAutocomplete } from './AddressAutocomplete'
import type { AddressProvider } from '../../services/addressProvider'
import type { Suggestion } from '../../types'

const SUG: Suggestion[] = [
  { id: '1', label: '11 rue du Loup Pendu', ville: 'Le Plessis-Robinson', lat: 48.77, lng: 2.25 },
  { id: '2', label: '11 rue du Loup Pendu', ville: 'Bièvres', lat: 48.75, lng: 2.21 },
]

const provider: AddressProvider = {
  suggest: vi.fn().mockResolvedValue(SUG),
  geocodeFirst: vi.fn(),
}

describe('AddressAutocomplete', () => {
  it('affiche les suggestions et appelle onPick au clic', async () => {
    const onPick = vi.fn()
    render(<AddressAutocomplete provider={provider} onPick={onPick} />)
    const input = screen.getByPlaceholderText('Adresse, commune…')
    fireEvent.change(input, { target: { value: '11 rue du loup pendu' } })
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2))
    fireEvent.click(screen.getByText('Bièvres'))
    expect(onPick).toHaveBeenCalledWith(SUG[1])
  })

  it('Entrée sélectionne la suggestion active', async () => {
    const onPick = vi.fn()
    render(<AddressAutocomplete provider={provider} onPick={onPick} />)
    const input = screen.getByPlaceholderText('Adresse, commune…')
    fireEvent.change(input, { target: { value: '11 rue du loup pendu' } })
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(SUG[1])
  })
})
