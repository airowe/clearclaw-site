/**
 * POST /api/waitlist
 *
 * Accepts { email } and writes to the WAITLIST KV namespace.
 * Key:   email address (normalised to lowercase)
 * Value: JSON { email, signedUpAt, source }
 *
 * Bound as a Cloudflare Pages Function — no separate Worker deploy needed.
 * KV namespace binding: WAITLIST (configure in Pages → Settings → Functions → KV bindings)
 */

interface Env {
  WAITLIST: KVNamespace
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // CORS — allow the site itself
  const origin = request.headers.get('Origin') ?? ''
  const allowed = origin === 'https://clearclaw.app' || origin.includes('localhost')

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://clearclaw.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Parse body
  let email: string
  try {
    const body = await request.json() as { email?: unknown }
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Validate
  if (!email || !isValidEmail(email)) {
    return new Response(
      JSON.stringify({ error: 'Invalid email address' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check for duplicate
  const existing = await env.WAITLIST.get(email)
  if (existing) {
    // Idempotent — return success so the UI shows the confirmation
    return new Response(
      JSON.stringify({ ok: true, duplicate: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Write entry
  const entry = {
    email,
    signedUpAt: new Date().toISOString(),
    source: 'clearclaw.app/cloud',
  }

  await env.WAITLIST.put(email, JSON.stringify(entry), {
    metadata: { signedUpAt: entry.signedUpAt },
  })

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
