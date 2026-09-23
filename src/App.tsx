import { LivreurProvider, useLivreur } from './state/LivreurContext'
import { Sidebar } from './components/layout/Sidebar'
import { LivreursSection } from './components/Livreurs/LivreursSection'
import { TourneesSection } from './components/Tournees/TourneesSection'
import { ChauffeursSection } from './components/Chauffeurs/ChauffeursSection'
import { HistoriqueSection } from './components/Historique/HistoriqueSection'
import { CorbeilleSection } from './components/Corbeille/CorbeilleSection'
import { OperateurGate } from './components/OperateurGate'

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
        {section === 'historique' && <HistoriqueSection />}
        {section === 'corbeille' && <CorbeilleSection />}
      </main>
    </div>
  )
}

export function App() {
  // Le portillon enveloppe le provider : aucune requête ne part de ce poste avant
  // qu'il porte un nom, donc aucune écriture n'arrive au serveur sans son auteur.
  return (
    <OperateurGate>
      <LivreurProvider>
        <Shell />
      </LivreurProvider>
    </OperateurGate>
  )
}
