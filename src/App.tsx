import { LivreurProvider } from './state/LivreurContext'

export function App() {
  return (
    <LivreurProvider>
      <div className="app" />
    </LivreurProvider>
  )
}
