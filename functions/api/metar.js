// Cloudflare Pages Function: GET /api/metar?id=KMJQ
// Relays the latest airport weather report (METAR) from aviationweather.gov, so the app can show live wind.
// Returns { id, name, time (ISO), spdKt, gstKt, dir } — dir is null when the wind is variable.
const IDS = new Set(["KMJQ"]);   // Jackson, MN Municipal Airport (AWOS), nearest live wind to Big Spirit Lake

export async function onRequestGet({ request }) {
  const id = (new URL(request.url).searchParams.get("id") || "KMJQ").toUpperCase();
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300",
  };
  if (!IDS.has(id)) return new Response(JSON.stringify({ error: "unknown station" }), { status: 400, headers });
  try {
    const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${id}&format=json`, {
      headers: { "user-agent": "spi-tides" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    const m = (await r.json())[0];
    if (!m || m.obsTime == null || m.wspd == null) throw new Error("no report");
    return new Response(JSON.stringify({
      id, name: m.name, time: new Date(m.obsTime * 1000).toISOString(),
      spdKt: +m.wspd, gstKt: m.wgst == null ? null : +m.wgst, dir: typeof m.wdir === "number" ? m.wdir : null,
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
  }
}
