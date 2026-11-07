# SPI Tides & Wind

South Padre Island wind, gusts, waves, weather and tides with 24h / 3 / 5 / 10 day views.
Live at https://tides.kiteboardokoboji.com (Cloudflare Pages project `spi-tides`).

- `web/` — the whole web app (static `index.html`, manifest, icons). No build step.
- Data: NOAA CO-OPS tide predictions and Open-Meteo (forecast + marine).

Cloudflare Pages settings: build command empty, build output directory `web`.
