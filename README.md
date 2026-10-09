
# Canva Pages Site (Static, GitHub Pages-ready)

A tiny, no-build static site that:
- Shows your Canva pages (exported as images) in a neat grid with a lightbox.
- Displays a banner with a live weather widget (Open-Meteo, no API key).
- Shows a fixed safeguarding contact card (Head of Safeguarding + DSL Hotline).
- Works on GitHub Pages (pure HTML/CSS/JS).

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
- The widget tries to use the browser's location (HTTPS required; GitHub Pages is fine).  
- If permission is denied, it falls back to **London**. To hardcode a different fallback, edit `loadWeather()` inside `app.js`.

## Deploy to GitHub Pages

- Create a new repository (e.g. `canva-site`), add these files, and push.
- In **Settings → Pages**, set **Source** to `Deploy from a branch`, **Branch** to `main` (or `master`) and `/ (root)`.
- Your site will be served at `https://<your-username>.github.io/<repo>/`.

## Notes

- Phone buttons use `tel:` links for mobile friendliness.
- All date logic uses the `Europe/London` timezone for consistency.
- No external dependencies or build tooling. Easy to hack and extend.
