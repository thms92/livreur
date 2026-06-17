import { LivreurProvider, useLivreur } from './state/LivreurContext'
import { Sidebar } from './components/layout/Sidebar'
import { LivreursSection } from './components/Livreurs/LivreursSection'
import { TourneesSection } from './components/Tournees/TourneesSection'
import { ChauffeursSection } from './components/Chauffeurs/ChauffeursSection'

function Shell() {
  const { section, loading, error, dismissError } = useLivreur()
  if (loading) return <div className="app-loading">Chargement…</div>
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="btn-ghost" onClick={dismissError}>OK</button>
          </div>
        )}
        {section === 'livreurs' && <LivreursSection />}
        {section === 'tournees' && <TourneesSection />}
        {section === 'chauffeurs' && <ChauffeursSection />}
      </main>
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
