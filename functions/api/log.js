// Cloudflare Pages Function: /api/log — the private kiteboarding session log.
//
// Accounts live in one encrypted Pages variable, LOG_ACCOUNTS, written as  name:passcode, name:passcode
// (e.g.  casey:blue-heron-jetty-42, dave:another-long-passcode). Sessions are kept in a D1 database bound as DB.
// Each person only ever sees their own sessions. The table is created automatically the first time it's used.
//
//   POST   /api/log            { action: "login", name, pass }  -> { token, name }
//   GET    /api/log            (Authorization: Bearer token)    -> { name, sessions: [...] } newest first
//   POST   /api/log            { start, mins, loc, kite, board, rating, notes, cond }  -> { id }
//   PUT    /api/log?id=12      same fields                       -> { ok }
//   DELETE /api/log?id=12                                        -> { ok }
//
// A token is signed with a key made from that person's own passcode, so changing someone's passcode signs them out
// everywhere without touching anyone else. Too many wrong passcodes lock that name out for 15 minutes (from that internet address).

const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",          // no cookies are used, so any page (like the Android app) can call it
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "cache-control": "no-store",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const LOCS = new Set(["spi", "spirit"]);
const MAX_FAILS = 8, LOCK_MS = 15 * 60e3, TOKEN_DAYS = 400;

// ---- accounts ----
function accounts(env) {
  const out = new Map();
  for (const part of String(env.LOG_ACCOUNTS || "").split(/[,\n]/)) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const name = part.slice(0, i).trim().toLowerCase(), pass = part.slice(i + 1).trim();
    if (name && pass) out.set(name, pass);
  }
  return out;
}

// ---- tokens: base64url(payload) "." base64url(HMAC-SHA256(key from name+passcode, payload)) ----
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function keyFor(name, pass) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`spi-tides-log|${name}|${pass}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(name, pass) {
  const body = b64u(enc.encode(JSON.stringify({ u: name, exp: Date.now() + TOKEN_DAYS * 864e5 })));
  const sig = await crypto.subtle.sign("HMAC", await keyFor(name, pass), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}
async function userFrom(request, env) {   // -> name, or null when the token is missing, wrong or expired
  const m = (request.headers.get("authorization") || "").match(/^Bearer ([\w-]+)\.([\w-]+)$/);
  if (!m) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(m[1])));
    const pass = accounts(env).get(p.u);
    if (!pass || !(p.exp > Date.now())) return null;
    const ok = await crypto.subtle.verify("HMAC", await keyFor(p.u, pass), unb64u(m[2]), enc.encode(m[1]));
    return ok ? p.u : null;
  } catch (e) { return null; }
}
async function same(a, b) {   // compare two strings without leaking how much of them matched
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

// ---- database ----
let ready = null;
function setup(db) {
  ready = ready || db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, loc TEXT NOT NULL, start INTEGER NOT NULL,
      mins INTEGER, kite TEXT, board TEXT, rating INTEGER, notes TEXT, cond TEXT, created INTEGER, updated INTEGER)`),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user, start)"),
    db.prepare("CREATE TABLE IF NOT EXISTS logins (name TEXT PRIMARY KEY, fails INTEGER, until INTEGER)"),
  ]).catch(e => { ready = null; throw e; });
  return ready;
}
function clean(b) {   // -> the fields to save, or an error message
  const str = (v, n) => v == null ? "" : String(v).slice(0, n);
  const start = Number(b.start);
  if (!Number.isFinite(start) || start < Date.UTC(2000, 0, 1) || start > Date.now() + 7 * 864e5) return "Pick when you went out";
  if (!LOCS.has(b.loc)) return "Unknown location";
  let cond = null;
  if (b.cond && typeof b.cond === "object") { cond = JSON.stringify(b.cond); if (cond.length > 4000) cond = null; }
  const mins = Math.round(Number(b.mins)), rating = Math.round(Number(b.rating));
  return {
    loc: b.loc, start: Math.round(start),
    mins: mins > 0 && mins <= 1440 ? mins : null,
    kite: str(b.kite, 40), board: str(b.board, 40),
    rating: rating >= 1 && rating <= 5 ? rating : null,
    notes: str(b.notes, 4000), cond,
  };
}
const row = r => ({ id: r.id, loc: r.loc, start: r.start, mins: r.mins, kite: r.kite || "", board: r.board || "",
  rating: r.rating, notes: r.notes || "", cond: r.cond ? JSON.parse(r.cond) : null, created: r.created, updated: r.updated });

async function login(body, env, request) {
  const name = String(body.name || "").trim().toLowerCase(), pass = String(body.pass || "");
  // lockouts are per name and per internet address, so a stranger guessing can't lock the real person out
  const who = `${name}|${request.headers.get("cf-connecting-ip") || ""}`;
  const db = env.DB, now = Date.now();
  const lock = name && await db.prepare("SELECT fails, until FROM logins WHERE name = ?").bind(who).first();
  if (lock && lock.until > now) return json({ error: `Too many tries. Wait ${Math.ceil((lock.until - now) / 60e3)} min and try again` }, 429);
  const real = accounts(env).get(name);
  if (real && pass && await same(pass, real)) {
    await db.prepare("DELETE FROM logins WHERE name = ?").bind(who).run();
    return json({ token: await makeToken(name, real), name });
  }
  if (name) {
    const fails = ((lock && lock.fails) || 0) + 1;
    await db.prepare("INSERT INTO logins (name, fails, until) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO UPDATE SET fails = ?2, until = ?3")
      .bind(who, fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MS : 0).run();
  }
  return json({ error: "That name and passcode don't match" }, 401);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (!env.DB || !env.LOG_ACCOUNTS) return json({ error: "setup", message: "The session log isn't set up on the server yet" }, 503);
  try {
    await setup(env.DB);
    const url = new URL(request.url), id = Number(url.searchParams.get("id"));
    let body = {};
    if (request.method === "POST" || request.method === "PUT") {
      if (+(request.headers.get("content-length") || 0) > 20000) return json({ error: "Too big" }, 413);
      try { body = await request.json(); } catch (e) { return json({ error: "Bad request" }, 400); }
      if (request.method === "POST" && body.action === "login") return login(body, env, request);
    }
    const user = await userFrom(request, env);
    if (!user) return json({ error: "signin" }, 401);
    const db = env.DB, now = Date.now();

    if (request.method === "GET") {
      const { results } = await db.prepare("SELECT * FROM sessions WHERE user = ? ORDER BY start DESC LIMIT 1000").bind(user).all();
      return json({ name: user, sessions: results.map(row) });
    }
    if (request.method === "POST") {
      const s = clean(body); if (typeof s === "string") return json({ error: s }, 400);
      const r = await db.prepare(`INSERT INTO sessions (user, loc, start, mins, kite, board, rating, notes, cond, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(user, s.loc, s.start, s.mins, s.kite, s.board, s.rating, s.notes, s.cond, now, now).run();
      return json({ id: r.meta.last_row_id });
    }
    if (request.method === "PUT") {
      const s = clean(body); if (typeof s === "string") return json({ error: s }, 400);
      const r = await db.prepare(`UPDATE sessions SET loc = ?, start = ?, mins = ?, kite = ?, board = ?, rating = ?, notes = ?,
        cond = COALESCE(?, cond), updated = ? WHERE id = ? AND user = ?`)
        .bind(s.loc, s.start, s.mins, s.kite, s.board, s.rating, s.notes, s.cond, now, id, user).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }
    if (request.method === "DELETE") {
      const r = await db.prepare("DELETE FROM sessions WHERE id = ? AND user = ?").bind(id, user).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: "Server error, try again" }, 500);
  }
}
