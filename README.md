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
