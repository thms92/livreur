import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StopList } from './StopList'
import type { Stop } from '../../types'

const stops: Stop[] = [
  { id: 'a', label: 'Arrêt A', ville: 'V', lat: 48.4, lng: 1.6 },
  { id: 'b', label: 'Arrêt B', ville: 'V', lat: 48.2, lng: 1.9 },
]

function fireDrag(from: HTMLElement, to: HTMLElement, dataTransfer: unknown) {
  fireEvent.dragStart(from, { dataTransfer })
  fireEvent.dragOver(to, { dataTransfer })
  fireEvent.drop(to, { dataTransfer })
}

describe('StopList', () => {
  it('affiche départ/retour entrepôt verrouillés + arrêts numérotés', () => {
    render(<StopList stops={stops} onRemove={() => {}} onReorder={() => {}} />)
    expect(screen.getAllByText(/Letourville/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Arrêt A')).toBeInTheDocument()
    expect(screen.getByText('Arrêt B')).toBeInTheDocument()
  })

  it('supprime un arrêt', async () => {
    const onRemove = vi.fn()
    render(<StopList stops={stops} onRemove={onRemove} onReorder={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Arrêt A' }))
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('réordonne par drag & drop natif (onReorder avec from/to)', () => {
    const onReorder = vi.fn()
    render(<StopList stops={stops} onRemove={() => {}} onReorder={onReorder} />)
    const items = screen.getAllByRole('listitem')
    const dt = { getData: () => '0', setData: vi.fn(), dropEffect: '', effectAllowed: '' }
    // items[0] and items[1] are the depot rows? No — see note. Find the stop rows.
    const stopRows = items.filter((li) => /Arrêt/.test(li.textContent || ''))
    fireDrag(stopRows[0], stopRows[1], dt)
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })

  it('affiche l’heure d’un arrêt et remonte la saisie via onSetHeure', () => {
    const withHeure: Stop[] = [{ ...stops[0], heure: '09:30' }, stops[1]]
    const onSetHeure = vi.fn()
    render(<StopList stops={withHeure} onRemove={() => {}} onReorder={() => {}} onSetHeure={onSetHeure} />)
    const input = screen.getByLabelText('Heure de livraison Arrêt A') as HTMLInputElement
    expect(input.value).toBe('09:30')
    fireEvent.change(screen.getByLabelText('Heure de livraison Arrêt B'), { target: { value: '10:15' } })
    expect(onSetHeure).toHaveBeenCalledWith('b', '10:15')
  })

  it('remonte les bornes dépôt (départ/retour)', () => {
    const onDepartHeure = vi.fn()
    const onRetourHeure = vi.fn()
    render(
      <StopList
        stops={stops}
        departHeure="08:00"
        onRemove={() => {}}
        onReorder={() => {}}
        onDepartHeure={onDepartHeure}
        onRetourHeure={onRetourHeure}
      />,
    )
    expect((screen.getByLabelText('Heure de départ du dépôt') as HTMLInputElement).value).toBe('08:00')
    fireEvent.change(screen.getByLabelText('Heure de retour au dépôt'), { target: { value: '17:30' } })
    expect(onRetourHeure).toHaveBeenCalledWith('17:30')
  })
})
