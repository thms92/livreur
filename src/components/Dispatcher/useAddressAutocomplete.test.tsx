import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAddressAutocomplete } from './useAddressAutocomplete'
import type { AddressProvider } from '../../services/addressProvider'
import type { Suggestion } from '../../types'

const SUG: Suggestion[] = [
  { id: '1', label: '11 rue du Loup Pendu', ville: 'Le Plessis-Robinson', lat: 48.77, lng: 2.25 },
]

function makeProvider(): AddressProvider {
  return {
    suggest: vi.fn().mockResolvedValue(SUG),
    geocodeFirst: vi.fn().mockResolvedValue(SUG[0]),
  }
}

describe('useAddressAutocomplete', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('debounce puis remplit les suggestions', async () => {
    const provider = makeProvider()
    const { result } = renderHook(() => useAddressAutocomplete(provider))

    act(() => result.current.setQuery('11 rue du loup pendu'))
    // avant le debounce : pas encore d'appel
    expect(provider.suggest).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1))
    expect(provider.suggest).toHaveBeenCalledOnce()
  })

  it('reset() vide les suggestions et la requête', async () => {
    const provider = makeProvider()
    const { result } = renderHook(() => useAddressAutocomplete(provider))
    act(() => result.current.setQuery('adresse test'))
    await act(async () => vi.advanceTimersByTime(300))
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1))
    act(() => result.current.reset())
    expect(result.current.suggestions).toHaveLength(0)
    expect(result.current.query).toBe('')
  })
})
