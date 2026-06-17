import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddressAutocomplete } from './AddressAutocomplete'
import type { Suggestion } from '../types'

const provider = {
  suggest: vi.fn(async () => [] as Suggestion[]),
  geocodeFirst: vi.fn(async () => null),
}
const saved: Suggestion[] = [
  { id: 's1', label: '12 Rue des Lilas', ville: 'Chartres', lat: 48, lng: 1 },
  { id: 's2', label: '4 Avenue de la Gare', ville: 'Auneau', lat: 48.1, lng: 1.1 },
]

describe('AddressAutocomplete — carnet', () => {
  it('affiche les adresses enregistrées au focus (champ vide)', async () => {
    render(<AddressAutocomplete provider={provider} onPick={() => {}} saved={saved} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('12 Rue des Lilas')).toBeInTheDocument()
    expect(screen.getByText('4 Avenue de la Gare')).toBeInTheDocument()
  })

  it('clic sur une adresse enregistrée appelle onPick', async () => {
    const onPick = vi.fn()
    render(<AddressAutocomplete provider={provider} onPick={onPick} saved={saved} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByText('12 Rue des Lilas'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  it('clic sur ✕ retire du carnet sans sélectionner', async () => {
    const onPick = vi.fn()
    const onRemoveSaved = vi.fn()
    render(
      <AddressAutocomplete provider={provider} onPick={onPick} saved={saved} onRemoveSaved={onRemoveSaved} />,
    )
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('button', { name: /Retirer 12 Rue des Lilas/ }))
    expect(onRemoveSaved).toHaveBeenCalledWith('s1')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('filtre les adresses enregistrées selon la requête', async () => {
    render(<AddressAutocomplete provider={provider} onPick={() => {}} saved={saved} />)
    await userEvent.type(screen.getByRole('combobox'), 'Lilas')
    expect(screen.getByText('12 Rue des Lilas')).toBeInTheDocument()
    expect(screen.queryByText('4 Avenue de la Gare')).not.toBeInTheDocument()
  })
})
