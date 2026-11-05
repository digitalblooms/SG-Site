// Who may open this screen at all.
//
// The site sits on a public .vercel.app URL. Vercel's own Trusted IPs
// (IP allowlisting) is Enterprise-only and Password Protection is a paid Pro
// add-on, so the gate is here instead — it costs nothing and runs on every
// plan.
//
// A request gets through if EITHER:
//   * it comes from an allowed IP (SITE_ALLOWED_IPS), or
//   * it carries the access cookie, which a screen gets once by being opened
//     at https://…/?k=<SITE_ACCESS_KEY>
//
// Opening the key URL sets an httpOnly cookie good for a year and then
// redirects to the clean URL, so the key doesn't sit in the address bar or
// the history of a screen anyone can walk up to. Each screen is set up once
// and stays in; everyone else gets a flat 401 with nothing to go on.
//
// IF SITE_ACCESS_KEY IS UNSET, EVERYTHING IS LET THROUGH. That is on purpose:
// a half-configured deploy must not take a safeguarding screen off the wall.
// Set the variable to turn the gate on, and check it before relying on it.

export const config = {
  // Everything except Vercel's own internals. Assets and /api/dsl are gated
  // too — a face and a name are exactly what we're keeping private.
  matcher: ['/((?!_vercel/).*)'],
};

const COOKIE = 'sg_access';
const YEAR = 60 * 60 * 24 * 365;

const encoder = new TextEncoder();

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Equal strings in time that doesn't depend on where they differ. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Both are hashed first, so neither their length nor where they differ shows in the timing. */
async function matches(given, expected) {
  if (!given || !expected) return false;
  return timingSafeEqual(await sha256Hex(given), await sha256Hex(expected));
}

/**
 * The client's own address. x-forwarded-for is a chain the proxies append to;
 * the FIRST entry is the client, the rest are hops. Vercel sets
 * x-real-ip to the same client address, so prefer it where present.
 */
export function clientIp(headers) {
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : '';
}

/** Parse the allowlist. Blank, spaces and stray commas are ignored. */
export function parseAllowed(raw) {
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

const denied = () =>
  new Response('Not available.\n', {
    status: 401,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export default async function middleware(request) {
  const key = process.env.SITE_ACCESS_KEY ?? '';

  // Not configured: the gate is off. Deliberate — see the note at the top.
  if (!key) return undefined;

  const url = new URL(request.url);

  // An allowed office/venue IP needs no key at all.
  const allowed = parseAllowed(process.env.SITE_ALLOWED_IPS);
  if (allowed.length && allowed.includes(clientIp(request.headers))) return undefined;

  // Already let in.
  const cookie = request.cookies?.get(COOKIE)?.value ?? '';
  if (await matches(cookie, key)) return undefined;

  // Setting a screen up: ?k=<key> → cookie, then back to the clean URL.
  const given = url.searchParams.get('k');
  if (await matches(given, key)) {
    url.searchParams.delete('k');
    const res = Response.redirect(url.toString(), 302);
    // Response.redirect gives an immutable response; copy it to add the cookie.
    const out = new Response(null, { status: 302, headers: res.headers });
    out.headers.append(
      'Set-Cookie',
      `${COOKIE}=${encodeURIComponent(key)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`,
    );
    out.headers.set('Cache-Control', 'no-store');
    return out;
  }

  return denied();
}
