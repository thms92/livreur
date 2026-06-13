import { Dispatcher } from './components/Dispatcher/Dispatcher'
import { DriverView } from './components/DriverView/DriverView'
import { IcoMoon, IcoSun } from './components/icons'
import { LivreurProvider, useLivreur } from './state/LivreurContext'

function Shell() {
  const { theme, toggleTheme, screen, setScreen, goDriver, stops } = useLivreur()
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <span className="brand-dot" />
            Livreur
          </span>
          <span className="brand-sub">Console d'exploitation</span>
        </div>
        <div className="topbar-spacer" />
        <div className="segmented">
          <button className={screen === 'dispatch' ? 'active' : ''} onClick={() => setScreen('dispatch')}>
            Répartiteur
          </button>
          <button className={screen === 'driver' ? 'active' : ''} onClick={goDriver}>
            Vue chauffeur
          </button>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-meta mono">3 chauffeurs · {stops.length} arrêts</div>
        <button className="icon-btn" onClick={toggleTheme} title="Basculer le thème" aria-label="Basculer le thème">
          {theme === 'light' ? <IcoMoon /> : <IcoSun />}
        </button>
      </div>

      {screen === 'dispatch' ? <Dispatcher /> : <DriverView />}
    </div>
  )
}

export function App() {
  return (
    <LivreurProvider>
      <Shell />
    </LivreurProvider>
  )
}
