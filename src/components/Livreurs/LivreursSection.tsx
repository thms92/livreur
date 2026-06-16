import { LivreurForm } from './LivreurForm'
import { LivreurList } from './LivreurList'

export function LivreursSection() {
  return (
    <section className="section">
      <h1>Livreurs</h1>
      <LivreurForm />
      <LivreurList />
    </section>
  )
}
