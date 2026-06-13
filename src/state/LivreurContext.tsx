import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { DriverId, Routes, ScreenId, Stop, Suggestion, Theme } from '../types'
import { DRIVERS } from '../data/drivers'
import { SEED_STOPS } from '../data/seed'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { makeStopId } from '../services/stopId'
import { StubOptimizer } from '../services/routeOptimizer'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()
const optimizer = new StubOptimizer()

export interface LivreurState {
  theme: Theme
  screen: ScreenId
  dispatched: boolean
  selected: DriverId
  highlighted: DriverId | null
  progress: Record<DriverId, number>
  stops: Stop[]
  routes: Routes
  assign: Record<string, string>
  provider: AddressProvider
  toggleTheme: () => void
  setScreen: (s: ScreenId) => void
  setDispatched: (v: boolean) => void
  setSelected: (id: DriverId) => void
  setHighlighted: (id: DriverId | null) => void
  addStop: (s: Suggestion) => void
  addBulk: (text: string) => Promise<void>
  removeStop: (id: string) => void
  openDriver: (id: DriverId) => void
  goDriver: () => void
  advance: (id: DriverId) => void
  resetTour: (id: DriverId) => void
  reduceMotion: boolean
}

const Ctx = createContext<LivreurState | null>(null)

export function useLivreur(): LivreurState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLivreur doit être utilisé dans <LivreurProvider>')
  return v
}

export function LivreurProvider({
  children,
  provider = defaultProvider,
}: {
  children: ReactNode
  provider?: AddressProvider
}) {
  const [theme, setTheme] = usePersistentState<Theme>('theme', 'light')
  const [screen, setScreen] = usePersistentState<ScreenId>('screen', 'dispatch')
  const [dispatched, setDispatched] = usePersistentState<boolean>('dispatched', false)
  const [selected, setSelected] = usePersistentState<DriverId>('selected', 'karim')
  const [progress, setProgress] = usePersistentState<Record<DriverId, number>>('progress', {
    karim: 0,
    lea: 0,
    sofiane: 0,
  })
  const [stops, setStops] = usePersistentState<Stop[]>('stops', SEED_STOPS)
  const [highlighted, setHighlighted] = useState<DriverId | null>(null)

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const routes = useMemo(() => optimizer.dispatch(stops, DRIVERS), [stops])
  const assign = useMemo(() => {
    const m: Record<string, string> = {}
    DRIVERS.forEach((d) => routes[d.id].stops.forEach((s) => {
      m[s.id] = d.couleur
    }))
    return m
  }, [routes])

  const addStop = useCallback((s: Suggestion) => {
    setStops((prev) => [
      ...prev,
      { id: makeStopId(), driver: null, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng },
    ])
  }, [setStops])

  const addBulk = useCallback(
    async (text: string) => {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      const results = await Promise.all(lines.map((l) => provider.geocodeFirst(l)))
      const items: Stop[] = results
        .filter((r): r is NonNullable<typeof r> => r != null)
        .map((r) => ({ id: makeStopId(), driver: null, label: r.label, ville: r.ville, lat: r.lat, lng: r.lng }))
      if (items.length) setStops((prev) => [...prev, ...items])
    },
    [provider, setStops],
  )

  const removeStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id))
  }, [setStops])

  const openDriver = useCallback((id: DriverId) => {
    setSelected(id)
    setScreen('driver')
  }, [setSelected, setScreen])

  const goDriver = useCallback(() => {
    if (!dispatched) setDispatched(true)
    setScreen('driver')
  }, [dispatched, setDispatched, setScreen])

  const advance = useCallback((id: DriverId) => {
    const n = routes[id].stops.length
    setProgress((p) => ({ ...p, [id]: Math.min((p[id] ?? 0) + 1, n) }))
  }, [routes, setProgress])

  const resetTour = useCallback(
    (id: DriverId) => setProgress((p) => ({ ...p, [id]: 0 })),
    [setProgress],
  )

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    [setTheme],
  )

  const value: LivreurState = {
    theme, screen, dispatched, selected, highlighted, progress, stops, routes, assign, provider,
    toggleTheme, setScreen, setDispatched, setSelected, setHighlighted,
    addStop, addBulk, removeStop, openDriver, goDriver, advance, resetTour,
    reduceMotion: !!reduceMotion,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
