export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

export const badRequest = (msg: string) => json({ error: msg }, 400)
export const notFound = () => json({ error: 'introuvable' }, 404)
export const conflict = (msg: string) => json({ error: msg }, 409)
export const gone = (msg: string) => json({ error: msg }, 410)
