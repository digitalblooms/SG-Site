
# Canva Pages Site (Static, deployed on Vercel)

A tiny, no-build static site that:
- Shows your Canva pages (exported as images) in a neat grid with a lightbox.
- Displays a banner with a live weather widget (Open-Meteo, no API key).
- Shows a fixed safeguarding contact card (Head of Safeguarding + DSL Hotline).
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

3) To change the safeguarding contact (name, role, photo or DSL Hotline number), edit the `contact-card` section in `index.html`.

4) Optional: Change the default location for the weather
- The widget tries to use the browser's location (HTTPS required; Vercel serves over HTTPS).  
- If permission is denied, it falls back to **London**. To hardcode a different fallback, edit `loadWeather()` inside `app.js`.

## Deploy (Vercel)

The site is hosted on Vercel, connected to this GitHub repo. Any push to `main`
deploys to production automatically — there is nothing to build or run.

- Production: see the project in the Vercel dashboard (Bloomsbury Football team).
- Pull requests get their own preview URL.
- `vercel.json` pins it as a static site served from the repo root and keeps
  `data/pages.json` uncached so slide changes appear without a hard refresh.

To update the slideshow: drop new images in `assets/images/`, edit
`data/pages.json`, commit and push.

## Notes

- Phone buttons use `tel:` links for mobile friendliness.
- All date logic uses the `Europe/London` timezone for consistency.
- No external dependencies or build tooling. Easy to hack and extend.
