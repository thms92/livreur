import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Driver, DriverConfig, DriverId, Routes, ScreenId, Stop, Suggestion, Theme } from '../types'
import { DEFAULT_DRIVERS } from '../data/drivers'
import { SEED_STOPS } from '../data/seed'
import { driverColor, nextColorIndex } from '../data/palette'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { makeStopId } from '../services/stopId'
import { assignToDriver, autoAssign as autoAssignStops, buildRoutes } from '../services/routeOptimizer'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()

export interface LivreurState {
  theme: Theme
  screen: ScreenId
  selected: DriverId
  activeDriver: DriverId
  highlighted: DriverId | null
  progress: Record<DriverId, number>
  stops: Stop[]
  drivers: Driver[]
  routes: Routes
  assign: Record<string, string>
  provider: AddressProvider
  toggleTheme: () => void
  setScreen: (s: ScreenId) => void
  setSelected: (id: DriverId) => void
  setActiveDriver: (id: DriverId) => void
  setHighlighted: (id: DriverId | null) => void
  addDriver: (nom: string) => void
  renameDriver: (id: DriverId, nom: string) => void
  removeDriver: (id: DriverId) => void
  addStop: (s: Suggestion) => void
  addBulk: (text: string) => Promise<void>
  removeStop: (id: string) => void
  assignStop: (stopId: string, driverId: DriverId | null) => void
  autoAssign: () => void
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
  const [configs, setConfigs] = usePersistentState<DriverConfig[]>('drivers', DEFAULT_DRIVERS)
  const [stops, setStops] = usePersistentState<Stop[]>('stops', SEED_STOPS)
  const [progress, setProgress] = usePersistentState<Record<DriverId, number>>('progress', {
    karim: 0,
    lea: 0,
    sofiane: 0,
  })
  const [selectedRaw, setSelected] = usePersistentState<DriverId>('selected', 'karim')
  const [activeRaw, setActiveDriver] = useState<DriverId>(() => configs[0]?.id ?? 'karim')
  const [highlighted, setHighlighted] = useState<DriverId | null>(null)

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const drivers = useMemo<Driver[]>(
    () => configs.map((c) => ({ ...c, couleur: driverColor(c.colorIndex) })),
    [configs],
  )

  const selected = drivers.some((d) => d.id === selectedRaw) ? selectedRaw : (drivers[0]?.id ?? 'karim')
  const activeDriver = drivers.some((d) => d.id === activeRaw) ? activeRaw : (drivers[0]?.id ?? 'karim')

  const routes = useMemo(() => buildRoutes(stops, drivers), [stops, drivers])
  const assign = useMemo(() => {
    const m: Record<string, string> = {}
    drivers.forEach((d) => routes[d.id].stops.forEach((s) => {
      m[s.id] = d.couleur
    }))
    return m
  }, [routes, drivers])

  const addDriver = useCallback((nom: string) => {
    const label = nom.trim()
    if (!label) return
    setConfigs((prev) => [
      ...prev,
      { id: makeStopId(), nom: label, colorIndex: nextColorIndex(prev.map((c) => c.colorIndex)) },
    ])
  }, [setConfigs])

  const renameDriver = useCallback((id: DriverId, nom: string) => {
    const label = nom.trim()
    if (!label) return
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, nom: label } : c)))
  }, [setConfigs])

  const removeDriver = useCallback((id: DriverId) => {
    setConfigs((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)))
    setStops((prev) => prev.map((s) => (s.driver === id ? { ...s, driver: null } : s)))
  }, [setConfigs, setStops])

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

  const assignStop = useCallback((stopId: string, driverId: DriverId | null) => {
    setStops((prev) => assignToDriver(prev, stopId, driverId))
  }, [setStops])

  const autoAssign = useCallback(() => {
    setStops((prev) => autoAssignStops(prev, drivers))
  }, [drivers, setStops])

  const openDriver = useCallback((id: DriverId) => {
    setSelected(id)
    setScreen('driver')
  }, [setSelected, setScreen])

  const goDriver = useCallback(() => setScreen('driver'), [setScreen])

  const advance = useCallback((id: DriverId) => {
    const n = routes[id]?.stops.length ?? 0
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
    theme, screen, selected, activeDriver, highlighted, progress, stops, drivers, routes, assign, provider,
    toggleTheme, setScreen, setSelected, setActiveDriver, setHighlighted,
    addDriver, renameDriver, removeDriver,
    addStop, addBulk, removeStop, assignStop, autoAssign,
    openDriver, goDriver, advance, resetTour,
    reduceMotion: !!reduceMotion,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
