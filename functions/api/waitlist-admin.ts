/**
 * GET /api/waitlist-admin?secret=<ADMIN_SECRET>
 *
 * Returns all waitlist entries as JSON (or CSV with ?format=csv).
 * Protected by a shared secret set in Pages → Settings → Environment Variables:
 *   ADMIN_SECRET = <something long and random>
 *
 * Usage:
 *   curl "https://clearclaw.app/api/waitlist-admin?secret=yourSecret"
 *   curl "https://clearclaw.app/api/waitlist-admin?secret=yourSecret&format=csv"
 */

interface Env {
  WAITLIST: KVNamespace
  ADMIN_SECRET: string
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret') ?? ''
  const format = url.searchParams.get('format') ?? 'json'

  if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  // List all keys (max 1000 — fine for a waitlist)
  const list = await env.WAITLIST.list()

  // Fetch all values in parallel
  const entries = await Promise.all(
    list.keys.map(async (key) => {
      const raw = await env.WAITLIST.get(key.name)
      try {
        return raw ? JSON.parse(raw) : { email: key.name }
      } catch {
        return { email: key.name }
      }
    })
  )

  // Sort newest first
  entries.sort((a, b) =>
    (b.signedUpAt ?? '').localeCompare(a.signedUpAt ?? '')
  )

  if (format === 'csv') {
    const rows = ['email,signedUpAt,source', ...entries.map(e =>
      `${e.email},${e.signedUpAt ?? ''},${e.source ?? ''}`
    )]
    return new Response(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="clearclaw-waitlist.csv"',
      },
    })
  }

  return new Response(
    JSON.stringify({ count: entries.length, entries }, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
