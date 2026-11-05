// Who is DSL today, for the safeguarding card.
//
// The screen can't talk to the coach app's database directly: everything in
// its `api` schema is granted to `authenticated`, and staff photos live in a
// private bucket. The coach app's `dsl-signage` edge function reads both with
// the service role and hands back a name and a face. This forwards to it.
//
// WHY A SERVER FUNCTION AND NOT A FETCH FROM THE PAGE. The edge function is
// guarded by a shared secret. Called from app.js it would be in view-source
// for anyone who opened the site. Here it stays in DSL_SIGNAGE_SECRET, a
// Vercel environment variable, and the browser only ever sees /api/dsl.
// Same-origin too, so there is no CORS to arrange.
//
// Environment (Vercel → sg-site → Settings → Environment Variables):
//   DSL_SIGNAGE_URL      https://xkktsnpkzvchzwmuvfyj.supabase.co/functions/v1/dsl-signage
//   DSL_SIGNAGE_SECRET   the same value as the edge function's secret
//
//   GET /api/dsl            → {"date":"…","name":"…","photo":"/api/dsl?photo=1&d=…"|null}
//   GET /api/dsl?photo=1    → that person's photo, as bytes
//
// Every failure here is quiet and non-fatal by design: the card falls back to
// the fixed Peter Marment / hotline contact, which is never wrong, only less
// specific. A safeguarding screen showing nothing is worse than one showing a
// general escalation route.

const TIMEOUT_MS = 8000;

/** Ask the edge function, with a timeout so a hung call can't hold the screen. */
async function askCoachApp(search) {
  const base = process.env.DSL_SIGNAGE_URL;
  const secret = process.env.DSL_SIGNAGE_SECRET;
  if (!base || !secret) {
    const missing = [!base && 'DSL_SIGNAGE_URL', !secret && 'DSL_SIGNAGE_SECRET'].filter(Boolean);
    throw Object.assign(new Error(`not configured: ${missing.join(', ')} unset`), { quiet: true });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(base + search, {
      headers: { 'x-dsl-signage-secret': secret },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'get_only' });
  }

  const wantsPhoto = String(req.query?.photo ?? '') === '1';

  try {
    const upstream = await askCoachApp(wantsPhoto ? '?photo=1' : '');

    if (wantsPhoto) {
      if (!upstream.ok) return res.status(404).end();
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // The URL carries the rota date, so a new day is a new URL and a long
      // cache never shows yesterday's face.
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
      return res.status(200).end(buf);
    }

    if (!upstream.ok) {
      console.error(`dsl: coach app answered ${upstream.status}`);
      return res.status(200).json({ date: null, name: null, photo: null, fallback: true });
    }

    const body = await upstream.json();
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
    const date = typeof body?.date === 'string' ? body.date : null;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      date,
      name,
      photo: name && body?.has_photo ? `/api/dsl?photo=1&d=${encodeURIComponent(date ?? '')}` : null,
      fallback: false,
    });
  } catch (err) {
    if (!err?.quiet) console.error(`dsl: ${err?.name === 'AbortError' ? 'coach app timed out' : err?.message}`);
    else console.error(`dsl: ${err.message}`);
    if (wantsPhoto) return res.status(404).end();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ date: null, name: null, photo: null, fallback: true });
  }
}
