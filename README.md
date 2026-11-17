# SPI Tides & Wind

South Padre Island wind, gusts, waves, weather and tides with 24h / 3 / 5 / 10 day views.
Live at https://tides.kiteboardokoboji.com (Cloudflare Pages project `spi-tides`).

- `web/` — the whole web app (static `index.html`, manifest, icons). No build step.
- Data: NOAA CO-OPS tide predictions and Open-Meteo (forecast + marine).

Cloudflare Pages settings: build command empty, build output directory `web`.

## Android app

`android/` wraps the web app in a small native app (WebView) for Android 7+.
GitHub Actions (`.github/workflows/android.yml`) copies `web/` into the app and builds
`app-debug.apk` on every push to `main` and on pull requests. Download it from the
workflow run's **Artifacts** section.

## Session log (private)

Tap **Settings → Session log** (or the notebook button once you've signed in) to log when you went out:
time, place, how long, kite, board, a 1-5 star rating and notes. The conditions at that time (wind, gusts,
direction, air and water temp, weather, waves, tide) are saved with each session automatically. Each person only
sees their own sessions. The server side is `functions/api/log.js`.

One-time setup in the Cloudflare dashboard (dash.cloudflare.com):

1. **Make the database.** Storage & Databases → D1 SQL Database → **Create** → name it `spi-tides-log` → Create.
2. **Connect it to the site.** Workers & Pages → `spi-tides-app` → Settings → Bindings → **Add** → D1 database →
   Variable name `DB`, database `spi-tides-log` → Save.
3. **Add the accounts.** Same Settings page → Variables and Secrets → **Add** → Type **Secret**, name `LOG_ACCOUNTS`,
   value like `casey:a-long-passcode-you-pick` (more people: `casey:pass1, dave:pass2`) → Save.
4. **Redeploy** so the settings take effect: Deployments → newest one → ⋯ → **Retry deployment**.

To add or remove someone, or change a passcode, edit `LOG_ACCOUNTS` and redeploy. Changing someone's passcode signs
them out everywhere. The tables are created automatically on first use.
