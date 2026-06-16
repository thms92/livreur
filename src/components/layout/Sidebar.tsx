import type { Section } from '../../types'
import { useLivreur } from '../../state/LivreurContext'
import { IcoMoon, IcoSun } from '../icons'

const ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'livreurs', label: 'Livreurs', icon: '👤' },
  { id: 'tournees', label: 'Tournées', icon: '🗺️' },
  { id: 'chauffeurs', label: 'Chauffeurs', icon: '📋' },
]

export function Sidebar() {
  const { section, setSection, theme, toggleTheme } = useLivreur()
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        Livreur
      </div>
      <ul className="sidebar-nav">
        {ITEMS.map((it) => (
          <li key={it.id}>
            <button
              className={'nav-item' + (section === it.id ? ' active' : '')}
              onClick={() => setSection(it.id)}
            >
              <span aria-hidden="true">{it.icon}</span> {it.label}
            </button>
          </li>
        ))}
      </ul>
      <button className="icon-btn sidebar-theme" onClick={toggleTheme} aria-label="Basculer le thème">
        {theme === 'light' ? <IcoMoon /> : <IcoSun />}
      </button>
    </nav>
  )
}
