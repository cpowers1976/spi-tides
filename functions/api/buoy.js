// Cloudflare Pages Function: GET /api/buoy?site=2118
// Relays the latest reading of a lake research buoy from wqdatalive.com, which doesn't let
// other websites read it directly. Returns { time, readings: { "Hs Wave Height": {value, unit}, ... } }.
const PROJECT = 470;               // Okoboji and Big Spirit Lake Research Buoys
const SITES = new Set(["2118", "721"]);   // Big Spirit Lake, West Okoboji Lake

export async function onRequestGet({ request }) {
  const site = new URL(request.url).searchParams.get("site") || "2118";
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=600",
  };
  if (!SITES.has(site)) return new Response(JSON.stringify({ error: "unknown site" }), { status: 400, headers });
  try {
    const r = await fetch(`https://www.wqdatalive.com/public/${PROJECT}/sidebar`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "spi-tides" },
      body: `siteID=${site}`,
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    const j = await r.json();
    if (j.error) throw new Error("buoy site error");
    // data is { "2026-10-21 10:30 (UTC -05:00)": [ {id, name, value, unit}, ... ], "": [...] }
    let time = null, readings = {};
    for (const [stamp, list] of Object.entries(j.data || {})) {
      const m = stamp.match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d) \(UTC ?([+-]\d\d):(\d\d)\)/);
      if (!m) continue;
      time = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${m[6]}:${m[7]}`;
      for (const p of Object.values(list)) {
        const v = parseFloat(p.value);
        if (!isNaN(v) && !(p.name in readings)) readings[p.name] = { value: v, unit: p.unit };
      }
      break;
    }
    return new Response(JSON.stringify({ site, time, readings }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
  }
}
