import { LivreurProvider, useLivreur } from './state/LivreurContext'
import { Sidebar } from './components/layout/Sidebar'
import { LivreursSection } from './components/Livreurs/LivreursSection'
import { TourneesSection } from './components/Tournees/TourneesSection'
import { ChauffeursSection } from './components/Chauffeurs/ChauffeursSection'

function Shell() {
  const { section } = useLivreur()
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
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
