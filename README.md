
# Canva Pages Site (Static, deployed on Vercel)

A tiny, no-build static site that:
- Shows your Canva pages (exported as images) in a neat grid with a lightbox.
- Displays a banner with a live weather widget (Open-Meteo, no API key).
- Shows a safeguarding contact card: today's on-duty DSL, pulled from the coach app, over a fixed hotline number.
- Pure HTML/CSS/JS, no build step.

## How to use

1) Export your Canva pages as **PNG/JPG** (recommended) or **SVG**.  
2) Put them in `assets/images/` and update `data/pages.json` with the filenames and titles.

```json
{
  "pages": [
    { "src": "assets/images/your-page-1.png", "title": "Welcome", "alt": "Welcome page" }
  ]
}
```

3) The safeguarding contact mostly looks after itself — see **Today's DSL** below.
   The `contact-card` section in `index.html` holds the *fallback* (Peter Marment
   and the hotline number); edit it there if either of those ever changes.

4) Optional: Change the default location for the weather
- The widget tries to use the browser's location (HTTPS required; Vercel serves over HTTPS).  
- If permission is denied, it falls back to **London**. To hardcode a different fallback, edit `loadWeather()` inside `app.js`.

## Deploy (Vercel)

The site is hosted on Vercel. **The GitHub repo is not connected to the Vercel
project**, so pushing to `main` deploys nothing — every release is a CLI deploy
from this folder:

```sh
vercel --prod
```

(Checked 2026-11-05: the project had one deployment ever, and two pushed commits
had never been built. If you connect the repo under Vercel → sg-site → Settings
→ Git, pushes will deploy on their own and this note can go.)

- Production: see the project in the Vercel dashboard (Bloomsbury Football team).
- `vercel.json` pins it as a static site served from the repo root and keeps
  `data/pages.json` uncached so slide changes appear without a hard refresh.

To update the slideshow: drop new images in `assets/images/`, edit
`data/pages.json`, commit, push, then `vercel --prod`.

## Today's DSL

The name and face on the contact card come from the coach app's DSL rota — the
one Pete keeps in the admin portal under **Safeguarding → DSL rota**. Nothing
is entered twice: the photo is whatever is on that person's BambooHR record.

The phone number is **not** pulled. It is the DSL hotline, the same number
whoever is on duty, and it lives in `index.html`.

How it gets here:

```
admin portal  →  app.dsl_rota  →  api.dsl_today  ─┐
                       (+ BambooHR photo, matched on work email)
                                                  │
  coach app edge function  dsl-signage  ←─────────┘   (service role; needs it,
                     │                                 because api.* is granted
                     │  x-dsl-signage-secret           to `authenticated` only
                     ▼                                 and photos are in a
  this site     /api/dsl   (api/dsl.mjs)                private bucket)
                     │
                     ▼
               app.js  →  the card
```

`/api/dsl` exists so the shared secret stays on the server. If the page called
the coach app directly, the secret would be in view-source.

**It always falls back.** No rota entry for today, no photo on the record, coach
app unreachable, secret missing — every one of those leaves the card showing
Peter Marment and the hotline, which is never a wrong escalation route. The card
is never blank and never shows an error. Don't "fix" that by letting it empty.

Refreshed on load, every 15 minutes, a minute after midnight London (when the
rota rolls over) and whenever the tab becomes visible again.

### Settings it needs

In Vercel → `sg-site` → Settings → Environment Variables:

| Name | Value |
| --- | --- |
| `DSL_SIGNAGE_URL` | `https://xkktsnpkzvchzwmuvfyj.supabase.co/functions/v1/dsl-signage` |
| `DSL_SIGNAGE_SECRET` | the shared secret (same value as the coach app's) |

And in the Coach App repo: `supabase functions deploy dsl-signage`, then
`supabase secrets set DSL_SIGNAGE_SECRET=<same value>`.

Without them the card just stays on the fallback, so a missing variable is
quiet — check the function logs in Vercel if the DSL never appears.

### Checking it

```sh
curl -s https://sg-site-xi.vercel.app/api/dsl        # {"date":…,"name":…,"photo":…}
```

`"fallback": true` means the coach app couldn't be reached. `"name": null` means
it was reached and nobody is on the rota today.

## Who can open the site

`middleware.js` is the gate. A request gets through if it comes from an allowed
IP, or if it carries the access cookie.

Set up a screen once by opening:

```
https://sg-site-xi.vercel.app/?k=<SITE_ACCESS_KEY>
```

That sets an httpOnly cookie good for a year and redirects to the clean URL, so
the key isn't left in the address bar or history of a screen anyone can walk up
to. Everyone else gets a flat 401.

| Name | Value |
| --- | --- |
| `SITE_ACCESS_KEY` | a long random string (`openssl rand -hex 24`) |
| `SITE_ALLOWED_IPS` | optional, comma-separated — these get in with no key |

**With `SITE_ACCESS_KEY` unset the gate is off and the site is public.** That's
deliberate: a half-configured deploy must not take a safeguarding screen off the
wall. So setting it is the step that actually turns protection on — check it
afterwards:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://sg-site-xi.vercel.app/   # want 401
```

Why not Vercel's own protection: Trusted IPs (IP allowlisting) is Enterprise
only, and Password Protection is a paid Pro add-on. Vercel Authentication is
free but needs a Vercel login per screen, which is no good for a wall display.
This costs nothing and runs on any plan.

Re-keying: change `SITE_ACCESS_KEY` and every screen needs its `?k=` URL again,
because the cookie holds the old value.

## Notes

- Phone buttons use `tel:` links for mobile friendliness.
- All date logic uses the `Europe/London` timezone for consistency.
- No external dependencies or build tooling. Easy to hack and extend.
- `api/dsl.mjs` is the one serverless function. It's `.mjs`, not `.js`, because
  there is no `package.json` here, so Vercel would otherwise read a `.js` file
  as CommonJS and `export default` would fail at runtime.
