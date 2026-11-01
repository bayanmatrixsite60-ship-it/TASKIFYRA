// Taskifyra – Worker module (_worker.js)  v7
// Runs on Cloudflare Pages (Advanced Mode) AND on a normal Workers project with a static-assets binding.
// Bindings/env: ZV (KV namespace), ASSETS (static files; added automatically by Pages, or by [assets] binding = "ASSETS" on Workers),
// ADMIN_TOKEN, SITE_URL, ADMIN_EMAIL, FROM_EMAIL,
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (PRIVATE chat with the bot: founder alerts),
// FOUNDER_CODE (secret passcode, never sent to the browser), RESEND_API_KEY (optional),
// STRIPE_SECRET, STRIPE_WEBHOOK_SECRET (optional, cards). Set all secrets as "Encrypted" variables.
// AI (Workers AI binding, variable name exactly "AI"): powers live translation of page content into 9 languages.
const RATE = 120; // BDT per USD, must match index.html

// ---- Pricing (server is the only authority) -------------------------------------------
// Base list prices. Student templates (a*) keep these. Freelancer / Garment / Doctor / Engineer
// templates are re-priced by newP() to 1,200 – 1,800 BDT. index.html uses the identical formula.
// v6: Job & Career templates (j1–j26) are sold at fixed prices of 600 – 999 BDT (NOT re-priced by newP).
const OLD = {
  p1: 799, p2: 399, p3: 499, p4: 550, p5: 399, p6: 599, p7: 449, p8: 499,
  g1: 299, g2: 349, g3: 299, g4: 399, g5: 249, g6: 299, g7: 199, g8: 249, g9: 249, g10: 449, g11: 399, g12: 599,
  a1: 599, a2: 499, a3: 449, a4: 349, a5: 449, a6: 349, m1: 899, m2: 599, m3: 649, m4: 399, m5: 399,
  e1: 699, e2: 599, e3: 499, e4: 449, e5: 399,
  p9: 349, p10: 399, p11: 449, p12: 399, p13: 449, p14: 299, p15: 299, p16: 349,
  g13: 349, g14: 449, g15: 399, g16: 249, g17: 249, g18: 449, a7: 349, a8: 299,
  a9: 399, a10: 299, a11: 249, a12: 349, m6: 299, m7: 349, m8: 249, m9: 299,
  m10: 199, m11: 249, m12: 349, m13: 299, m14: 249, m15: 349, e6: 349, e7: 249,
  e8: 299, e9: 299, e10: 199, e11: 299, e12: 349, e13: 299, e14: 349, e15: 349,
  e16: 299, e17: 349, e18: 299, e19: 199
};
// v5: 62 more templates. Base price rule is shared with index.html: [249,299,349,399,449,499][number % 6].
const NB = [249, 299, 349, 399, 449, 499];
for (const [pre, a, b] of [["p", 17, 30], ["g", 19, 32], ["a", 13, 24], ["m", 16, 25], ["e", 20, 31]]) for (let n = a; n <= b; n++) OLD[pre + n] = NB[n % 6];
const newP = (id, o) => /^[pgme]\d+$/.test(id) ? 1200 + Math.min(6, Math.max(0, Math.round((o - 199) / 100))) * 100 : o;
const PRICES = {};
for (const k in OLD) PRICES[k] = newP(k, OLD[k]);
// v6: Job & Career templates. Must match the prices in index.html (JB list).
Object.assign(PRICES, {
  j1: 600, j2: 700, j3: 600, j4: 700, j5: 600, j6: 700, j7: 600, j8: 900, j9: 800, j10: 900,
  j11: 700, j12: 800, j13: 800, j14: 999, j15: 900, j16: 800, j17: 700, j18: 700, j19: 800, j20: 900,
  j21: 900, j22: 800, j23: 999, j24: 999, j25: 700, j26: 800
});
Object.assign(PRICES, {
  // category memberships (30 days) and the all-access pass
  ms: 1000, mg: 1400, mf: 1900, me: 2700, mj: 1200, ma: 5000,
  // factory plans (must match index.html)
  b10m: 9900, b10q: 28215, b10y: 100980, b50m: 24900, b50q: 70965, b50y: 253980
});
const MEMBER_MS = 30 * 864e5;
const isMem = id => /^(m|ms|mg|mf|me|mj|ma)$/.test(id); // "m" = legacy all-access orders only (no longer sold)
const isBiz = id => /^b(10|50)[mqy]$/.test(id);
const isTpl = id => /^[pgamej]\d+$/.test(id);
const MEMC = { ms: "a", mg: "g", mf: "p", me: "e", mj: "j" }; // which template family each category membership covers
const memCovers = (item, id) => item === "m" || item === "ma" || isBiz(item) || (MEMC[item] && id[0] === MEMC[item]);

// API and admin responses are never meant for search engines.
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const rid = (n = 12) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kvPut = async (env, k, v, o) => { try { await env.ZV.put(k, v, o); return true; } catch (e) { return false; } };
const sha = async x => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(x))))].map(b => b.toString(16).padStart(2, "0")).join("");

// Price of any sellable item. "up:<templateId>" = half-price upgrade, only while a newer version is released.
async function priceOf(env, item) {
  item = String(item || "");
  if (PRICES[item]) return PRICES[item];
  if (item.startsWith("up:")) {
    const id = item.slice(3);
    if (isTpl(id) && PRICES[id] && await env.ZV.get("rel:" + id)) return Math.round(PRICES[id] / 2);
  }
  return 0;
}

async function tg(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }) });
    return r.ok;
  } catch (e) { return false; }
}
async function tgTo(env, chat, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !chat) return false;
  try { return (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }) })).ok; } catch (e) { return false; }
}

async function mail(env, to, subject, html) {
  await kvPut(env, "log:" + Date.now() + rid(2), JSON.stringify({ to, subject }), { expirationTtl: 2592000 });
  if (!env.RESEND_API_KEY || !to) { console.log("MAIL", to, subject); return; }
  await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL || "Taskifyra <noreply@example.com>", to: [to], subject, html }) }).catch(e => console.log("mail fail", e));
}

async function createOrder(env, d, method, status, extra = {}) {
  const c = d.customer || {};
  const bdt = await priceOf(env, d.item);
  if (!bdt) throw new Error("bad item");
  if (!c.name || !/.+@.+\..+/.test(c.email || "") || !c.phone) throw new Error("bad customer");
  const id = rid(6);
  const trx = String(d.trx || "").trim().slice(0, 40);
  if (method !== "Card") { // one transaction ID can only be used once
    const tk = "trx:" + method + ":" + trx.toLowerCase();
    if (await env.ZV.get(tk)) throw new Error("This transaction ID was already submitted");
    await env.ZV.put(tk, id, { expirationTtl: 90 * 864e5 });
  }
  const o = { id, key: rid(16), item: String(d.item), method,
    currency: method === "Card" ? "USD" : "BDT",
    amount: method === "Card" ? Math.round(bdt / RATE * 100) / 100 : bdt, // server-side price only
    trx, customer: { name: String(c.name).slice(0, 80), email: String(c.email).slice(0, 120), phone: String(c.phone).slice(0, 20) },
    status, at: Date.now(), ...extra };
  await env.ZV.put("order:" + o.id, JSON.stringify(o));
  await env.ZV.put("cust:" + o.customer.email.toLowerCase(), JSON.stringify({ ...o.customer, last: o.at }));
  await env.ZV.put("pend:" + o.id, "1");
  return o;
}

// Running earnings totals, updated once per approved order (cheap to read, no KV scans).
async function addEarnings(env, o) {
  const raw = await env.ZV.get("stats");
  const st = raw ? JSON.parse(raw) : { bdt: 0, usd: 0, n: 0, m: 0, days: {} };
  if (o.currency === "USD") st.usd = Math.round((st.usd + o.amount) * 100) / 100; else st.bdt += o.amount;
  st.n++; if (isMem(o.item) || isBiz(o.item)) st.m++;
  const day = new Date().toISOString().slice(0, 10);
  st.days[day] = (st.days[day] || 0) + (o.currency === "USD" ? o.amount * RATE : o.amount);
  const ks = Object.keys(st.days).sort(); while (ks.length > 60) delete st.days[ks.shift()];
  await env.ZV.put("stats", JSON.stringify(st));
}

async function approve(env, id) {
  const raw = await env.ZV.get("order:" + id); if (!raw) return null;
  const o = JSON.parse(raw);
  if (o.status === "approved") return o; // idempotent: no double mail, no double earnings
  o.status = "approved"; o.approvedAt = Date.now();
  if (isMem(o.item)) o.exp = Date.now() + MEMBER_MS;
  else if (isBiz(o.item)) o.exp = Date.now() + MEMBER_MS * { m: 1, q: 3, y: 12 }[o.item.slice(-1)];
  // Lifetime ownership: single templates never expire. Keep an owner list so we can alert them about new versions.
  const tid = isTpl(o.item) ? o.item : o.item.startsWith("up:") ? o.item.slice(3) : null;
  if (tid) {
    const k = "own:" + tid, em = o.customer.email.toLowerCase();
    const a = JSON.parse((await env.ZV.get(k)) || "[]");
    if (!a.includes(em) && a.length < 3000) { a.push(em); await env.ZV.put(k, JSON.stringify(a)); }
    if (o.item.startsWith("up:")) { const r = JSON.parse((await env.ZV.get("rel:" + tid)) || "null"); o.ver = r ? r.v : 2; }
  }
  await env.ZV.put("order:" + id, JSON.stringify(o));
  await env.ZV.delete("pend:" + id);
  await addEarnings(env, o);
  await mail(env, o.customer.email, "Your Taskifyra access is unlocked",
    `<p>Hi ${esc(o.customer.name)}, your payment is approved. Open ${esc(env.SITE_URL || "")} on the device you ordered from; your content unlocks automatically.</p>`);
  return o;
}

async function stripeSig(env, body, header) {
  if (!env.STRIPE_WEBHOOK_SECRET) return false;
  const p = Object.fromEntries(header.split(",").map(x => x.split("=")));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(p.t + "." + body)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return sig === p.v1 && Math.abs(Date.now() / 1000 - +p.t) < 300;
}

// No Cron Trigger is configured: due alerts go out when a reminder is added and when /api/remind-run is called.
async function runReminders(env) {
  let sent = 0;
  for (const k of (await env.ZV.list({ prefix: "rem:" })).keys) {
    const r = JSON.parse((await env.ZV.get(k.name)) || "null"); if (!r) continue;
    const left = Math.ceil((Date.parse(r.date) - Date.now()) / 864e5);
    if (left < 0) { await env.ZV.delete(k.name); continue; }
    const due = left <= 1 ? 2 : left <= r.days ? 1 : 0;
    if (!due || (r.s & due)) continue;
    r.s |= due; await env.ZV.put(k.name, JSON.stringify(r), { expirationTtl: 90 * 864e5 });
    const msg = `⏰ ${left} day${left === 1 ? "" : "s"} remaining: ${r.title}`;
    if (r.email) await mail(env, r.email, msg, `<p>${esc(msg)} (deadline ${esc(r.date)})</p>`);
    if (r.chat) await tgTo(env, r.chat, msg);
    sent++;
  }
  return sent;
}

// ---- Live translation (Workers AI m2m100). Results are cached with the free Cache API (no KV writes).
const LNG = { bn: "bengali", ar: "arabic", es: "spanish", fr: "french", de: "german", hi: "hindi", zh: "chinese", tr: "turkish", ja: "japanese" };
async function trChunk(env, tl, text) {
  try { const r = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: "english", target_lang: tl }); return (r && r.translated_text) || text; } catch (e) { return text; }
}
async function trOne(env, lang, text) {
  const ck = new Request("https://tr.taskifyra.cache/" + lang + "/" + (await sha(text)).slice(0, 40));
  const hit = await caches.default.match(ck); if (hit) return await hit.text();
  const parts = text.length > 420 ? (text.match(/[^.!?。\n]+[.!?。]*\s*/g) || [text]) : [text];
  const chunks = []; let cur = "";
  for (const p of parts) { if (cur && (cur + p).length > 420) { chunks.push(cur); cur = ""; } cur += p; }
  if (cur) chunks.push(cur);
  const out = (await Promise.all(chunks.map(c => trChunk(env, LNG[lang], c.trim())))).join(" ").trim() || text;
  if (out !== text) await caches.default.put(ck, new Response(out, { headers: { "Cache-Control": "public, max-age=2592000" } })).catch(() => {});
  return out;
}

const adminOK = (req, env, url) => env.ADMIN_TOKEN && (req.headers.get("Authorization") === "Bearer " + env.ADMIN_TOKEN || url.searchParams.get("t") === env.ADMIN_TOKEN);
const founderOK = async (env, tk) => !!(tk && await env.ZV.get("founder:" + tk));
const ip = req => req.headers.get("CF-Connecting-IP") || "x";

// Serves index.html, robots.txt, sitemap.xml and every other static file.
// Safe when the ASSETS binding is missing: a clear message instead of "Cannot read properties of undefined (reading 'fetch')".
// A noindex header on a public page would hide the site from Google, so it is removed here.
async function serveStatic(req, env) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Taskifyra: static files are not connected. Add the ASSETS binding ([assets] binding = \"ASSETS\" in wrangler.toml) and redeploy.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const res = await env.ASSETS.fetch(req);
  const xr = res.headers.get("X-Robots-Tag");
  if (xr && /noindex/i.test(xr)) {
    const h = new Headers(res.headers); h.delete("X-Robots-Tag");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
  return res;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p === "/api/translate" && req.method === "POST") {
        const og = req.headers.get("Origin"); if (og && og !== url.origin) return json({ ok: false, error: "origin" }, 403);
        const d = await req.json().catch(() => ({}));
        if (!LNG[d.lang] || !Array.isArray(d.texts)) return json({ ok: false, error: "bad request" }, 400);
        if (!env.AI) return json({ ok: false, error: "Workers AI binding named AI is not set" }, 503);
        let total = 0; const texts = d.texts.slice(0, 10).map(x => String(x).slice(0, 900)).filter(x => (total += x.length) <= 5000);
        const out = await Promise.all(texts.map(x => trOne(env, d.lang, x)));
        return json({ ok: true, out });
      }
      if (p === "/api/order" && req.method === "POST") {
        const d = await req.json();
        if (!["bKash", "Nagad", "Rocket"].includes(d.method)) return json({ error: "method" }, 400);
        if (!d.trx || String(d.trx).trim().length < 4) return json({ error: "Enter the transaction ID" }, 400);
        const o = await createOrder(env, d, d.method, "pending");
        // Alerts never contain the admin token: the admin page asks for it.
        await mail(env, env.ADMIN_EMAIL, `New ${o.method} order ${o.amount} BDT`,
          `<p>${esc(o.customer.name)} · ${esc(o.customer.phone)} · ${esc(o.customer.email)}<br>Item ${esc(o.item)} · TRX ${esc(o.trx)}<br><a href="${esc(env.SITE_URL)}/admin">Open admin</a></p>`);
        await tg(env, `🛒 New ${o.method} order: ${o.item} · ${o.amount} ${o.currency}\n${o.customer.name} · ${o.customer.phone}\nTRX ${o.trx}\nReview: ${env.SITE_URL}/admin`);
        return json({ id: o.id, key: o.key, status: o.status });
      }
      if (p === "/api/order" && req.method === "GET") {
        const raw = await env.ZV.get("order:" + url.searchParams.get("id"));
        const o = raw && JSON.parse(raw);
        if (!o || o.key !== url.searchParams.get("key")) return json({ error: "not found" }, 404);
        return json({ status: o.status, exp: o.exp, item: o.item, ver: o.ver });
      }
      if (p === "/api/stripe" && req.method === "POST") {
        if (!env.STRIPE_SECRET) return json({ error: "stripe not configured" }, 503);
        const d = await req.json();
        const o = await createOrder(env, d, "Card", "awaiting_card");
        const f = new URLSearchParams({ mode: "payment", success_url: env.SITE_URL + "/?paid=1", cancel_url: env.SITE_URL + "/",
          customer_email: o.customer.email, client_reference_id: o.id,
          "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": String(Math.round(o.amount * 100)),
          "line_items[0][price_data][product_data][name]": "Taskifyra " + o.item });
        const r = await (await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST",
          headers: { Authorization: "Bearer " + env.STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" }, body: f })).json();
        if (!r.url) return json({ error: "stripe" }, 502);
        return json({ url: r.url, id: o.id, key: o.key });
      }
      if (p === "/api/stripe-webhook" && req.method === "POST") {
        const body = await req.text();
        if (!(await stripeSig(env, body, req.headers.get("stripe-signature") || ""))) return json({ error: "sig" }, 400);
        const ev = JSON.parse(body);
        if (ev.type === "checkout.session.completed" && ev.data.object.payment_status === "paid") await approve(env, ev.data.object.client_reference_id);
        return json({ ok: true });
      }
      if (p === "/api/admin/approve" && req.method === "POST") {
        if (!adminOK(req, env, url)) return json({ error: "auth" }, 401);
        const o = await approve(env, (await req.json()).id);
        return o ? json({ ok: true }) : json({ error: "not found" }, 404);
      }

      // ---- Template versions: lifetime ownership + half-price upgrades -----------------
      // Public: which templates have a newer version (no content).
      if (p === "/api/releases" && req.method === "GET") {
        const rel = {};
        for (const k of (await env.ZV.list({ prefix: "rel:" })).keys.slice(0, 100)) {
          const r = JSON.parse((await env.ZV.get(k.name)) || "null");
          if (r) rel[k.name.slice(4)] = { v: r.v, note: r.note, at: r.at };
        }
        return json({ ok: true, rel });
      }
      // Upgrade owners and active members of that category get the new content.
      if (p === "/api/release" && req.method === "GET") {
        const id = url.searchParams.get("id") || "";
        const raw = await env.ZV.get("order:" + (url.searchParams.get("oid") || ""));
        const o = raw && JSON.parse(raw);
        const okOwner = o && o.item === "up:" + id, okMember = o && (isMem(o.item) || isBiz(o.item)) && memCovers(o.item, id) && (!o.exp || o.exp > Date.now());
        if (!o || o.key !== url.searchParams.get("key") || o.status !== "approved" || !(okOwner || okMember)) return json({ ok: false }, 403);
        const r = JSON.parse((await env.ZV.get("rel:" + id)) || "null");
        return r ? json({ ok: true, v: r.v, note: r.note, lines: r.lines }) : json({ ok: false }, 404);
      }
      // Founder publishes a new version; every owner is emailed (15 per call, the admin page loops).
      if (p === "/api/admin/release" && req.method === "POST") {
        if (!adminOK(req, env, url)) return json({ error: "auth" }, 401);
        const d = await req.json().catch(() => ({}));
        const id = String(d.id || ""), v = Math.round(+d.v || 0), from = Math.max(0, +d.from || 0);
        if (!isTpl(id) || !PRICES[id]) return json({ ok: false, error: "Unknown template id" }, 400);
        if (v < 2 || v > 99) return json({ ok: false, error: "Version must be 2 or higher" }, 400);
        const note = String(d.note || "").slice(0, 300), name = String(d.name || id).slice(0, 80);
        const lines = (Array.isArray(d.lines) ? d.lines : []).map(x => String(x).slice(0, 400)).slice(0, 40);
        if (from === 0) await env.ZV.put("rel:" + id, JSON.stringify({ v, note, lines, at: Date.now() }));
        const own = JSON.parse((await env.ZV.get("own:" + id)) || "[]");
        const batch = own.slice(from, from + 15), half = Math.round(PRICES[id] / 2);
        for (const em of batch) await mail(env, em, `🔔 New version of ${name} on Taskifyra`,
          `<p>Version ${v} of <b>${esc(name)}</b> is out. ${esc(note)}</p><p>You own the original for life. Upgrade for half price (${half} BDT) at ${esc(env.SITE_URL || "")}.</p>`);
        if (from === 0) await tg(env, `🔔 Release: ${id} v${v} · notifying ${own.length} owner(s)`);
        const next = from + 15 < own.length ? from + 15 : null;
        return json({ ok: true, total: own.length, done: Math.min(own.length, from + batch.length), next });
      }

      // Founder passcode is verified here only; FOUNDER_CODE never reaches the browser.
      if (p === "/api/founder") {
        if (req.method === "GET") return json({ ok: await founderOK(env, url.searchParams.get("token")) });
        if (req.method !== "POST" || !env.FOUNDER_CODE) return json({ ok: false }, 400);
        const rk = "rl:" + ip(req), n = +(await env.ZV.get(rk) || 0);
        if (n >= 5) return json({ ok: false, error: "slow down" }, 429);
        const code = String((await req.json().catch(() => ({}))).code || "");
        if (code.length < 6 || (await sha(code)) !== (await sha(env.FOUNDER_CODE))) {
          await env.ZV.put(rk, String(n + 1), { expirationTtl: 3600 }); return json({ ok: false });
        }
        const token = rid(16); await env.ZV.put("founder:" + token, "1", { expirationTtl: 2592000 });
        return json({ ok: true, token });
      }
      // Live earnings for the founder dashboard (needs a valid founder token).
      if (p === "/api/founder-stats" && req.method === "GET") {
        if (!(await founderOK(env, req.headers.get("X-Founder-Token")))) return json({ ok: false }, 401);
        const raw = await env.ZV.get("stats");
        const st = raw ? JSON.parse(raw) : { bdt: 0, usd: 0, n: 0, m: 0, days: {} };
        const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const last30 = Object.entries(st.days).filter(([d]) => d >= cut).reduce((a, [, v]) => a + v, 0);
        const pending = (await env.ZV.list({ prefix: "pend:" })).keys.length;
        return json({ ok: true, bdt: st.bdt, usd: st.usd, total: Math.round(st.bdt + st.usd * RATE), orders: st.n, members: st.m, last30: Math.round(last30), pending });
      }
      if (p === "/api/feedback" && req.method === "POST") {
        const rk = "fbrl:" + ip(req), n = +(await env.ZV.get(rk) || 0);
        if (n >= 8) return json({ ok: false, error: "slow down" }, 429);
        await kvPut(env, rk, String(n + 1), { expirationTtl: 3600 });
        const d = await req.json().catch(() => ({})), text = String(d.text || "").slice(0, 2000);
        if (!text.trim()) return json({ error: "empty" }, 400);
        const fb = { text, name: String(d.name || "").slice(0, 80), email: String(d.email || "").slice(0, 120), at: Date.now() };
        const saved = await kvPut(env, "fb:" + fb.at + rid(2), JSON.stringify(fb));
        const sent = await tg(env, `📜 New feedback\nFrom: ${fb.name} <${fb.email}>\n\n${fb.text}`);
        if (env.ADMIN_EMAIL) await mail(env, env.ADMIN_EMAIL, "New feedback on Taskifyra", `<p>${esc(fb.name)} &lt;${esc(fb.email)}&gt;</p><p>${esc(fb.text)}</p>`);
        if (!sent && !saved) return json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and the ZV KV binding" }, 503);
        return json({ ok: true, telegram: sent, saved });
      }

      // Deadline reminders (email + optional Telegram chat ID)
      if (p === "/api/remind" && req.method === "POST") {
        const rk = "remrl:" + ip(req), n = +(await env.ZV.get(rk) || 0);
        if (n >= 20) return json({ ok: false, error: "slow down" }, 429);
        await kvPut(env, rk, String(n + 1), { expirationTtl: 3600 });
        const d = await req.json().catch(() => ({})), title = String(d.title || "").slice(0, 120), date = String(d.date || "");
        if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return json({ ok: false, error: "Add a task and a valid date" }, 400);
        const email = /.+@.+\..+/.test(d.email || "") ? String(d.email).slice(0, 120) : "", chat = /^-?\d{5,15}$/.test(String(d.chat || "")) ? String(d.chat) : "";
        if (!email && !chat) return json({ ok: false, error: "Add an email or a Telegram chat ID" }, 400);
        const id = rid(8);
        await env.ZV.put("rem:" + id, JSON.stringify({ title, date, days: Math.min(60, Math.max(1, +d.days || 7)), email, chat, s: 0 }), { expirationTtl: 400 * 864e5 });
        await runReminders(env);
        return json({ ok: true, id });
      }
      if (p === "/api/remind" && req.method === "DELETE") {
        const id = url.searchParams.get("id") || "";
        if (/^[0-9a-f]{16}$/.test(id)) await env.ZV.delete("rem:" + id);
        return json({ ok: true });
      }
      if (p === "/api/remind-run") {
        if (!adminOK(req, env, url)) return json({ error: "auth" }, 401);
        return json({ ok: true, sent: await runReminders(env) });
      }
      // Referrals: both sides get +7 days of Pro. One reward per email, 5 per hour per IP.
      if (p === "/api/referral" && req.method === "POST") {
        const d = await req.json().catch(() => ({})), em = String(d.email || "").trim().toLowerCase().slice(0, 120);
        if (!/.+@.+\..+/.test(em)) return json({ error: "email" }, 400);
        const code = (await sha(em)).slice(0, 8), WK = 7 * 864e5, ref = String(d.ref || "").slice(0, 12);
        await env.ZV.put("refown:" + code, em);
        if (ref && ref !== code && !(await env.ZV.get("refgot:" + em))) {
          const rk = "refrl:" + ip(req), n = +(await env.ZV.get(rk) || 0), owner = await env.ZV.get("refown:" + ref);
          if (owner && n < 5) {
            await env.ZV.put(rk, String(n + 1), { expirationTtl: 3600 });
            await env.ZV.put("refgot:" + em, ref);
            for (const e of [em, owner]) { const cur = +(await env.ZV.get("bonus:" + e) || 0); await env.ZV.put("bonus:" + e, String(Math.max(cur, Date.now()) + WK)); }
            await env.ZV.put("refn:" + ref, String(+(await env.ZV.get("refn:" + ref) || 0) + 1));
            await tg(env, `🎁 Referral: ${em} joined via ${owner}`);
          }
        }
        return json({ code, count: +(await env.ZV.get("refn:" + code) || 0), exp: +(await env.ZV.get("bonus:" + em) || 0) });
      }

      if (p === "/admin") {
        if (!adminOK(req, env, url)) return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Admin</title><body style="font:16px system-ui;padding:20px"><form method="get"><p>Admin token</p><input name="t" type="password" autocomplete="current-password" style="padding:10px;width:240px"> <button style="padding:10px">Open</button></form>`, { status: 401, headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" } });
        const ids = (await env.ZV.list({ prefix: "pend:" })).keys.map(k => k.name.slice(5));
        const rows = (await Promise.all(ids.map(i => env.ZV.get("order:" + i)))).filter(Boolean).map(JSON.parse)
          .filter(o => o.status === "pending").sort((a, b) => b.at - a.at)
          .map(o => `<tr><td>${esc(o.customer.name)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.email)}</td><td>${esc(o.item)}</td><td>${o.amount} ${o.currency}<br>${esc(o.method)} ${esc(o.trx)}</td><td><button onclick="ap('${esc(o.id)}',this)">Approve</button></td></tr>`).join("");
        // NOTE on escaping: this is a JS template literal. "\\r?\\n" below is emitted to the browser as /\r?\n/,
        // which is a valid regex that splits on LF and CRLF. A single "\n" here would put a raw line break
        // inside the browser's string/regex literal and break the whole admin script.
        return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Admin</title><style>body{font:14px system-ui;padding:12px;max-width:720px}td{border-bottom:1px solid #ccc;padding:8px;vertical-align:top}input,textarea{display:block;width:100%;padding:8px;margin:4px 0;box-sizing:border-box}</style><h2>Pending orders</h2><table>${rows || "<tr><td>None</td></tr>"}</table>
<h2>Release a new template version</h2><p>Owners keep v1 for life and are emailed; they can upgrade at half price. Members get the latest automatically.</p>
<input id="r_id" placeholder="Template id, e.g. g1"><input id="r_nm" placeholder="Template name (for the email)"><input id="r_v" type="number" value="2" min="2"><input id="r_note" placeholder="One-line note: what is new"><textarea id="r_lines" rows="6" placeholder="New content, one line per item"></textarea><button onclick="rel()">Publish and notify owners</button> <span id="r_out"></span>
<script>
function tk(){return encodeURIComponent(new URLSearchParams(location.search).get('t'))}
async function ap(id,b){b.disabled=true;const r=await fetch('/api/admin/approve?t='+tk(),{method:'POST',body:JSON.stringify({id})});b.textContent=r.ok?'Approved':'Failed'}
async function rel(){const g=x=>document.getElementById(x),o=g('r_out');const body={id:g('r_id').value.trim(),name:g('r_nm').value,v:+g('r_v').value,note:g('r_note').value,lines:g('r_lines').value.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean),from:0};o.textContent='Sending...';
for(;;){const r=await fetch('/api/admin/release?t='+tk(),{method:'POST',body:JSON.stringify(body)});const j=await r.json();if(!j.ok){o.textContent=j.error||'Failed';return}o.textContent='Notified '+j.done+' of '+j.total;if(j.next==null)break;body.from=j.next}o.textContent+=' - done'}
</script>`, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
      }
    } catch (e) { return json({ error: String(e.message || e) }, 400); }
    return serveStatic(req, env);
  }
};
