import { useCallback, useEffect, useRef, useState } from 'react'
import type { AddressProvider } from '../services/addressProvider'
import type { Suggestion } from '../types'

const DEBOUNCE_MS = 250

export function useAddressAutocomplete(provider: AddressProvider) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset synchrone quand la requête est trop courte
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      const res = await provider.suggest(q, ctrl.signal)
      setSuggestions(res)
      setActiveIndex(res.length ? 0 : -1)
      setLoading(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, provider])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setQuery('')
    setSuggestions([])
    setActiveIndex(-1)
    setLoading(false)
  }, [])

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((i) => {
        if (!suggestions.length) return -1
        const n = suggestions.length
        return (i + delta + n) % n
      })
    },
    [suggestions.length],
  )

  return { query, setQuery, suggestions, loading, activeIndex, setActiveIndex, move, reset }
}
