// =====================================================================================
// TASKIFYRA — single-file Cloudflare Worker (_worker.js)
//   Section 1  Legacy core   : accounts, catalogue orders, Telegram, admin, AI, translation, security
//   Section 2  Marketplace   : seller stores, D1 + R2, signed downloads, bKash Tokenized, admin tools
//   Section 3  Entry point   : routing, security headers, cron
// Each section is a closure so helper names (json/J, rid, clean, stats...) can never collide.
// =====================================================================================

// ======================================= SECTION 1: LEGACY CORE =======================================
const Legacy = (() => {
const RATE = 120; // BDT per USD, must match index.html
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
const NB = [249, 299, 349, 399, 449, 499];
for (const [pre, a, b] of [["p", 17, 30], ["g", 19, 32], ["a", 13, 24], ["m", 16, 25], ["e", 20, 31]]) for (let n = a; n <= b; n++) OLD[pre + n] = NB[n % 6];
const newP = (id, o) => /^[pgme]\d+$/.test(id)?(o<=249?99:o<=299?149:o<=349?199:o<=399?249:o<=449?299:o<=499?349:o<=599?449:o<=699?499:o<=799?599:699):o;
const PRICES = {};
for (const k in OLD) PRICES[k] = newP(k, OLD[k]);
Object.assign(PRICES, {
  j1: 600, j2: 700, j3: 600, j4: 700, j5: 600, j6: 700, j7: 600, j8: 900, j9: 800, j10: 900,
  j11: 700, j12: 800, j13: 800, j14: 999, j15: 900, j16: 800, j17: 700, j18: 700, j19: 800, j20: 900,
  j21: 900, j22: 800, j23: 999, j24: 999, j25: 700, j26: 800
});
Object.assign(PRICES, {
  ms: 1000, mg: 1400, mf: 1900, me: 2700, mj: 1200, ma: 5000,
  b10m: 9900, b10q: 28215, b10y: 100980, b50m: 24900, b50q: 70965, b50y: 253980
});
const MEMBER_MS = 30 * 864e5;
const PROMO_END = Date.parse("2026-12-16T23:59:59+06:00"), PROMO_PRO_MS = 30 * 864e5, PROMO_N = 3; // sign-up offer: 30 days Pro + 3 templates at 50%
const isMem = id => /^(m|ms|mg|mf|me|mj|ma)$/.test(id);
const isBiz = id => /^b(10|50)[mqy]$/.test(id);
const isTpl = id => /^[pgamej]\d+$/.test(id);
const MEMC = { ms: "a", mg: "g", mf: "p", me: "e", mj: "j" };
const memCovers = (item, id) => item === "m" || item === "ma" || isBiz(item) || (MEMC[item] && id[0] === MEMC[item]);
const tplExp = () => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.getTime(); }; // single template = 6 months

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const rid = (n = 12) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (s, n) => String(s ?? "").replace(/[<>"'`\u0000-\u001f]/g, "").trim().slice(0, n);
const kvPut = async (env, k, v, o) => { try { await env.ZV.put(k, v, o); return true; } catch (e) { return false; } };
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha = async x => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(x))));
const eq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const ip = req => req.headers.get("CF-Connecting-IP") || "x";
const dayOf = t => new Date(t + 6 * 3600e3).toISOString().slice(0, 10); // Bangladesh day
const bdt = t => new Date(t + 6 * 3600e3).toISOString().replace("T", " ").slice(0, 19) + " BD";
const hit = async (env, key, ttl) => { const n = (+(await env.ZV.get(key)) || 0) + 1; await kvPut(env, key, String(n), { expirationTtl: Math.max(60, ttl) }); return n; };

async function priceOf(env, item) {
  item = String(item || "");
  if (PRICES[item]) return PRICES[item];
  if (item.startsWith("up:")) { const id = item.slice(3); if (isTpl(id) && PRICES[id] && await env.ZV.get("rel:" + id)) return Math.round(PRICES[id] / 2); }
  return 0;
}

// ---------------- Telegram (supports both TG_* and TELEGRAM_* names) ----------------
const tgTok = e => e.TG_BOT_TOKEN || e.TELEGRAM_BOT_TOKEN, tgChat = e => e.TG_CHAT_ID || e.TELEGRAM_CHAT_ID;
async function tgApi(env, method, body) {
  const t = tgTok(env); if (!t) return null;
  try { return await (await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(); } catch (e) { return null; }
}
async function tg(env, text, markup) { const c = tgChat(env); if (!c) return false; const r = await tgApi(env, "sendMessage", { chat_id: c, text: text.slice(0, 4000), reply_markup: markup }); return !!(r && r.ok); }
async function tgTo(env, chat, text) { if (!tgTok(env) || !chat) return false; const r = await tgApi(env, "sendMessage", { chat_id: chat, text: text.slice(0, 4000) }); return !!(r && r.ok); }
async function tgPhoto(env, dataUrl, caption, markup) {
  const t = tgTok(env), c = tgChat(env); if (!t || !c) return false;
  try {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || ""); if (!m) return false;
    const f = new FormData(); f.append("chat_id", c); f.append("caption", caption.slice(0, 1000));
    if (markup) f.append("reply_markup", JSON.stringify(markup));
    f.append("photo", new Blob([Uint8Array.from(atob(m[2]), x => x.charCodeAt(0))], { type: "image/" + m[1] }), "proof." + m[1]);
    return (await fetch(`https://api.telegram.org/bot${t}/sendPhoto`, { method: "POST", body: f })).ok;
  } catch (e) { return false; }
}
const tgSecret = async env => (await sha("tgw:" + (env.ADMIN_TOKEN || env.FOUNDER_CODE || "x"))).slice(0, 40);

// The 3 inline buttons on every security / access alert.
const secKb = (ipa, h8) => ({ inline_keyboard: [[{ text: "🚨 Lockdown site", callback_data: "LK" }, { text: "⏱ Block user", callback_data: `BM:${ipa}:${h8 || "-"}` }, { text: "⚙️ Founder action", callback_data: `FA:${ipa}:${h8 || "-"}` }]] });
const _al = new Map();
const throttled = (k, ms) => { const n = Date.now(), t = _al.get(k) || 0; if (n - t < ms) return true; _al.set(k, n); if (_al.size > 400) _al.clear(); return false; };
async function secAlert(env, type, ipa, detail, h8) {
  if (throttled(type + ipa, 20000)) return;
  const t = Date.now();
  await kvPut(env, "sec:ev:" + (9e15 - t) + ":" + Math.random().toString(36).slice(2, 6), JSON.stringify({ t, type, ip: ipa, detail: String(detail).slice(0, 200) }), { expirationTtl: 2592000 });
  if (await env.ZV.get("sec:mute")) return;
  await tg(env, `🚨 ${type}\nIP: ${ipa}\n${String(detail).slice(0, 300)}\n${bdt(t)}`, secKb(ipa, h8));
}

async function mail(env, to, subject, html) {
  await kvPut(env, "log:" + Date.now() + rid(2), JSON.stringify({ to, subject }), { expirationTtl: 2592000 });
  if (!env.RESEND_API_KEY || !to) { console.log("MAIL", to, subject); return; }
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL || "Taskifyra <noreply@example.com>", to: [to], subject, html }) }).catch(e => console.log("mail fail", e));
}

// ---------------- Ledger (founder analytics) ----------------
const ledKey = o => "led:" + String(o.at).padStart(13, "0") + ":" + o.id;
const ledMeta = o => ({ id: o.id, t: o.at, ap: o.approvedAt || 0, item: o.item, method: o.method, cur: o.currency, amt: o.amount, trx: o.trx || "", name: o.customer.name, email: o.customer.email, p4: String(o.customer.phone || "").slice(-4), status: o.status === "awaiting_card" ? "pending" : o.status, pf: o.pf ? 1 : 0 });
const ledPut = (env, o) => kvPut(env, ledKey(o), "1", { metadata: ledMeta(o) });
async function backfill(env) {
  if (await env.ZV.get("led:bf")) return false;
  const cur = (await env.ZV.get("led:bfc")) || undefined, r = await env.ZV.list({ prefix: "order:", cursor: cur, limit: 40 });
  await Promise.all(r.keys.map(async k => { const o = JSON.parse((await env.ZV.get(k.name)) || "null"); if (o && o.customer) await ledPut(env, o); }));
  if (r.list_complete) await kvPut(env, "led:bf", "1"); else await kvPut(env, "led:bfc", r.cursor);
  return !r.list_complete;
}
async function stats(env) {
  const more = await backfill(env).catch(() => false);
  let keys = [], cursor;
  for (let i = 0; i < 10; i++) { const r = await env.ZV.list({ prefix: "led:", cursor, limit: 1000 }); keys.push(...r.keys); if (r.list_complete) break; cursor = r.cursor; }
  const E = keys.map(k => k.metadata).filter(Boolean), val = e => e.amt * (e.cur === "USD" ? RATE : 1), A = E.filter(e => e.status === "approved");
  const now = Date.now(), days = [], months = {}, gateways = {};
  for (let i = 0; i < 7; i++) days.push({ date: dayOf(now - i * 864e5), total: 0, orders: 0, items: {} });
  for (const e of A) { const d = dayOf(e.ap || e.t), m = d.slice(0, 7), dd = days.find(x => x.date === d);
    if (dd) { dd.total += val(e); dd.orders++; dd.items[e.item] = (dd.items[e.item] || 0) + 1; }
    const mm = months[m] = months[m] || { month: m, total: 0, orders: 0 }; mm.total += val(e); mm.orders++;
    const g = gateways[e.method] = gateways[e.method] || { total: 0, count: 0 }; g.total += val(e); g.count++; }
  const cut = dayOf(now - 30 * 864e5);
  return { ok: true, backfilling: more, today: { total: days[0].total, orders: days[0].orders }, last7: days.reduce((a, d) => a + d.total, 0), total: A.reduce((a, e) => a + val(e), 0),
    last30: A.filter(e => dayOf(e.ap || e.t) >= cut).reduce((a, e) => a + val(e), 0), orders: A.length, members: A.filter(e => isMem(e.item) || isBiz(e.item)).length, pending: E.filter(e => e.status === "pending").length,
    days, months: Object.values(months).sort((a, b) => b.month.localeCompare(a.month)), gateways,
    recent: E.slice(-40).reverse().map(e => ({ id: e.id, item: e.item, cur: e.cur, amt: e.amt, name: e.name, email: e.email, p4: e.p4, method: e.method, trx: e.trx, status: e.status, pf: e.pf, at: bdt(e.t).slice(0, 16) })) };
}

// ---------------- Orders ----------------
async function createOrder(env, d, method, status, extra = {}, acct = null) {
  const c = d.customer || {};
  let price = await priceOf(env, d.item), pr = null, promoUsed = false;
  if (price && acct && isTpl(String(d.item))) { pr = await getPromo(env, acct.email); if (pr && pr.until > Date.now() && PROMO_N - (pr.used || []).length > 0) { price = Math.round(price / 2); promoUsed = true; } }
  if (!price) throw new Error("bad item");
  if (!c.name || !/.+@.+\..+/.test(c.email || "") || !c.phone) throw new Error("bad customer");
  const id = rid(6), trx = String(d.trx || "").trim().slice(0, 40);
  if (method !== "Card") {
    const tk = "trx:" + method + ":" + trx.toLowerCase();
    if (await env.ZV.get(tk)) throw new Error("This transaction ID was already submitted");
    await env.ZV.put(tk, id, { expirationTtl: 90 * 864e5 });
  }
  const proof = typeof d.proof === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d.proof) && d.proof.length <= 450000 ? d.proof : "";
  if (method !== "Card" && !proof) throw new Error("Attach a screenshot of your payment");
  const o = { id, key: rid(16), item: String(d.item), method, currency: method === "Card" ? "USD" : "BDT",
    amount: method === "Card" ? Math.round(price / RATE * 100) / 100 : price, trx,
    customer: { name: clean(c.name, 80), email: clean(c.email, 120), phone: clean(c.phone, 20) }, status, at: Date.now(), pf: proof ? 1 : 0, promo: promoUsed ? 1 : 0, acct: promoUsed ? acct.email : "", ...extra };
  const em = o.customer.email.toLowerCase();
  await Promise.all([env.ZV.put("order:" + id, JSON.stringify(o)), env.ZV.put("cust:" + em, JSON.stringify({ ...o.customer, last: o.at })), env.ZV.put("pend:" + id, "1"),
    env.ZV.put("ordx:" + em + ":" + id, "1"), ledPut(env, o), proof ? env.ZV.put("proof:" + id, proof, { expirationTtl: 120 * 864e5 }) : 0]);
  if (promoUsed && method !== "Card") { pr.used = [...(pr.used || []), id]; await savePromo(env, acct.email, pr); }
  o._proof = proof;
  return o;
}
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
  if (o.status === "approved") return o;
  o.status = "approved"; o.approvedAt = Date.now();
  if (o.promo && o.acct) { const pr = await getPromo(env, o.acct); if (pr && !(pr.used || []).includes(o.id)) { pr.used = [...(pr.used || []), o.id]; await savePromo(env, o.acct, pr); } }
  await hit(env, "pc:" + dayOf(Date.now()), 172800).catch(() => {});
  if (isMem(o.item)) o.exp = Date.now() + MEMBER_MS;
  else if (isBiz(o.item)) o.exp = Date.now() + MEMBER_MS * { m: 1, q: 3, y: 12 }[o.item.slice(-1)];
  else o.exp = tplExp(); // single template or upgrade: valid 6 months, then locks until renewed
  const tid = isTpl(o.item) ? o.item : o.item.startsWith("up:") ? o.item.slice(3) : null;
  if (tid) {
    const k = "own:" + tid, em = o.customer.email.toLowerCase();
    const a = JSON.parse((await env.ZV.get(k)) || "[]");
    if (!a.includes(em) && a.length < 3000) { a.push(em); await env.ZV.put(k, JSON.stringify(a)); }
    if (o.item.startsWith("up:")) { const r = JSON.parse((await env.ZV.get("rel:" + tid)) || "null"); o.ver = r ? r.v : 2; }
  }
  await Promise.all([env.ZV.put("order:" + id, JSON.stringify(o)), env.ZV.delete("pend:" + id), ledPut(env, o), addEarnings(env, o)]);
  await mail(env, o.customer.email, "Your Taskifyra access is unlocked",
    `<p>Hi ${esc(o.customer.name)}, your payment is approved. Open ${esc(env.SITE_URL || "")} on the device you ordered from; your content unlocks automatically.</p>`);
  await tg(env, `✅ Approved: ${o.item} · ${o.amount} ${o.currency} · ${o.customer.name} (${o.method})`);
  return o;
}
async function reject(env, id) {
  const raw = await env.ZV.get("order:" + id); if (!raw) return null;
  const o = JSON.parse(raw); if (o.status === "approved") return o;
  o.status = "rejected"; if (o.promo && o.acct) { const pr = await getPromo(env, o.acct); if (pr) { pr.used = (pr.used || []).filter(x => x !== o.id); await savePromo(env, o.acct, pr); } } await Promise.all([env.ZV.put("order:" + id, JSON.stringify(o)), env.ZV.delete("pend:" + id), ledPut(env, o)]); return o;
}

async function stripeSig(env, body, header) {
  if (!env.STRIPE_WEBHOOK_SECRET) return false;
  const p = Object.fromEntries(header.split(",").map(x => x.split("=")));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(p.t + "." + body)));
  return sig === p.v1 && Math.abs(Date.now() / 1000 - +p.t) < 300;
}

async function runReminders(env) {
  const ks = (await env.ZV.list({ prefix: "rem:" })).keys; let sent = 0;
  await Promise.all(ks.map(async k => {
    const r = JSON.parse((await env.ZV.get(k.name)) || "null"); if (!r) return;
    const left = Math.ceil((Date.parse(r.date) - Date.now()) / 864e5);
    if (left < 0) { await env.ZV.delete(k.name); return; }
    const due = left <= 1 ? 2 : left <= r.days ? 1 : 0;
    if (!due || (r.s & due)) return;
    r.s |= due; await env.ZV.put(k.name, JSON.stringify(r), { expirationTtl: 90 * 864e5 });
    const msg = `⏰ ${left} day${left === 1 ? "" : "s"} remaining: ${r.title}`;
    if (r.email) await mail(env, r.email, msg, `<p>${esc(msg)} (deadline ${esc(r.date)})</p>`);
    if (r.chat) await tgTo(env, r.chat, msg);
    sent++;
  }));
  return sent;
}

// ---------------- Live translation (Workers AI) ----------------
const LNG = { bn: "bengali", ar: "arabic", es: "spanish", fr: "french", de: "german", hi: "hindi", zh: "chinese", tr: "turkish", ja: "japanese" };
async function trChunk(env, tl, text) { try { const r = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: "english", target_lang: tl }); return (r && r.translated_text) || text; } catch (e) { return text; } }
async function trOne(env, lang, text) {
  const ck = new Request("https://tr.taskifyra.cache/" + lang + "/" + (await sha(text)).slice(0, 40));
  const hitc = await caches.default.match(ck); if (hitc) return await hitc.text();
  const parts = text.length > 420 ? (text.match(/[^.!?。\n]+[.!?。]*\s*/g) || [text]) : [text];
  const chunks = []; let cur = "";
  for (const p of parts) { if (cur && (cur + p).length > 420) { chunks.push(cur); cur = ""; } cur += p; }
  if (cur) chunks.push(cur);
  const out = (await Promise.all(chunks.map(c => trChunk(env, LNG[lang], c.trim())))).join(" ").trim() || text;
  if (out !== text) await caches.default.put(ck, new Response(out, { headers: { "Cache-Control": "public, max-age=2592000" } })).catch(() => {});
  return out;
}

const getPromo = async (env, em) => { try { return JSON.parse((await env.ZV.get("promo:" + em)) || "null"); } catch (e) { return null; } };
const savePromo = (env, em, p) => env.ZV.put("promo:" + em, JSON.stringify(p), { expirationTtl: 90 * 864e5 });
const promoView = p => p ? { pro: p.pro, until: p.until, disc: Math.max(0, PROMO_N - (p.used || []).length) } : null;
// ---------------- Accounts (15+ char password, PBKDF2-SHA256 hash, KV) ----------------
const nph = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("880")) d = "0" + d.slice(3); return d; };
async function hashPw(env, pw, salt) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw + (env.PW_PEPPER || "")), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt.match(/../g).map(h => parseInt(h, 16))), iterations: 100000 }, k, 256));
}
let _gen = { v: "0", t: 0 };
const curGen = async env => { if (Date.now() - _gen.t > 5000) _gen = { v: (await env.ZV.get("sec:gen")) || "0", t: Date.now() }; return _gen.v; };
async function mkSession(env, email) { const tok = rid(24); await env.ZV.put("sess:" + (await sha(tok)), JSON.stringify({ email, g: await curGen(env) }), { expirationTtl: 30 * 864e5 }); return tok; }
async function sessUser(req, env) {
  const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.get("Authorization") || ""); if (!m) return null;
  const s = JSON.parse((await env.ZV.get("sess:" + (await sha(m[1])))) || "null"); if (!s || s.g !== await curGen(env)) return null;
  if (await env.ZV.get("blk:" + s.email)) return null;
  const a = JSON.parse((await env.ZV.get("acct:" + s.email)) || "null"); return a ? { ...a, tok: m[1] } : null;
}
const pubUser = a => ({ name: a.name, email: a.email, phone: a.phone });
async function authGuard(env, req) {
  if (await env.ZV.get("sec:freeze")) return json({ ok: false, error: "Sign-in is paused for a moment. Try again shortly." }, 503);
  if (await hit(env, "arl:" + ip(req), 900) > 40) return json({ ok: false, error: "Too many attempts. Try again in 15 minutes." }, 429);
  return null;
}
async function signup(req, env, ctx) {
  const g = await authGuard(env, req); if (g) return g;
  const d = await req.json().catch(() => ({})), name = clean(d.name, 80), email = clean(d.email, 120).toLowerCase(), phone = nph(d.phone), pw = String(d.pw || "");
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.length < 8 || phone.length > 15) return json({ ok: false, error: "Check your name, email and mobile number." }, 400);
  if (pw.length < 15 || pw.length > 64) return json({ ok: false, error: "Password must be 15 to 64 characters." }, 400);
  if (await env.ZV.get("acct:" + email) || await env.ZV.get("ph:" + phone)) return json({ ok: false, error: "An account with this email or mobile already exists. Please log in." }, 409);
  const salt = rid(16), h8 = (await sha(email)).slice(0, 8);
  await Promise.all([env.ZV.put("acct:" + email, JSON.stringify({ name, email, phone: String(d.phone).replace(/[^0-9+\-\s]/g, "").slice(0, 20), salt, hash: await hashPw(env, pw, salt), at: Date.now(), h8 })), env.ZV.put("ph:" + phone, email), env.ZV.put("eh:" + h8, email)]);
  let pr = null; if (Date.now() <= PROMO_END) { pr = { pro: Date.now() + PROMO_PRO_MS, until: Date.now() + PROMO_PRO_MS, used: [] }; await savePromo(env, email, pr); }
  ctx.waitUntil(secAlert(env, "🆕 New sign-up" + (pr ? " 🎁 offer" : ""), ip(req), `${name} · ${email} · ${phone}`, h8));
  return json({ ok: true, tok: await mkSession(env, email), user: { name, email, phone: String(d.phone).slice(0, 20) }, promo: promoView(pr) });
}
async function login(req, env, ctx) {
  const g = await authGuard(env, req); if (g) return g;
  const d = await req.json().catch(() => ({})), id = clean(d.id, 120).toLowerCase(), pw = String(d.pw || "").slice(0, 64);
  const email = id.includes("@") ? id : (await env.ZV.get("ph:" + nph(id))) || "", a = email ? JSON.parse((await env.ZV.get("acct:" + email)) || "null") : null;
  const h8 = a ? a.h8 : "-";
  if (a && await env.ZV.get("blk:" + email)) { ctx.waitUntil(secAlert(env, "⛔ Blocked user tried to log in", ip(req), email, h8)); return json({ ok: false, error: "This account is temporarily locked. Contact support." }, 423); }
  if (a && (+(await env.ZV.get("lf:" + email)) || 0) >= 5) return json({ ok: false, error: "Too many wrong passwords. Try again in 15 minutes." }, 429);
  const ok = a ? eq(await hashPw(env, pw, a.salt), a.hash) : (await hashPw(env, pw, "00".repeat(16)), false);
  if (!ok) { const n = a ? await hit(env, "lf:" + email, 900) : 0; ctx.waitUntil(secAlert(env, "⚠️ Failed login" + (n >= 5 ? " (account locked 15 min)" : ""), ip(req), (email || id) + " · attempt " + n, h8)); return json({ ok: false, error: "Wrong email/mobile or password." }, 401); }
  await env.ZV.delete("lf:" + email);
  ctx.waitUntil(secAlert(env, "🔑 Login", ip(req), `${a.name} · ${email}`, h8));
  return json({ ok: true, tok: await mkSession(env, email), user: pubUser(a), promo: promoView(await getPromo(env, email)) });
}
async function me(req, env) {
  const a = await sessUser(req, env); if (!a) return json({ ok: false }, 401);
  const ids = (await env.ZV.list({ prefix: "ordx:" + a.email + ":", limit: 40 })).keys.map(k => k.name.split(":").pop());
  const orders = (await Promise.all(ids.map(i => env.ZV.get("order:" + i)))).filter(Boolean).map(JSON.parse).map(o => ({ id: o.id, key: o.key, item: o.item, pm: o.method, status: o.status === "awaiting_card" ? "pending" : o.status, at: o.at, exp: o.exp }));
  return json({ ok: true, user: pubUser(a), orders, promo: promoView(await getPromo(env, a.email)), notes: JSON.parse((await env.ZV.get("notes:" + a.email)) || "[]") });
}
async function saveNotes(req, env) {
  const a = await sessUser(req, env); if (!a) return json({ ok: false }, 401);
  const d = await req.json().catch(() => ({})), n = (Array.isArray(d.notes) ? d.notes : []).slice(0, 200).map(x => ({ id: String(x.id).slice(0, 20), t: String(x.t || "").slice(0, 200), b: String(x.b || "").slice(0, 20000), at: +x.at || Date.now() }));
  const s = JSON.stringify(n); if (s.length > 200000) return json({ ok: false, error: "Notes too large" }, 413);
  await env.ZV.put("notes:" + a.email, s); return json({ ok: true });
}

// ---------------- Telegram button callbacks ----------------
const DUR = { "15m": 900, "1h": 3600, "24h": 86400, "7d": 604800 };
async function tgEdit(env, cq, suffix, markup) {
  const m = cq.message, base = { chat_id: m.chat.id, message_id: m.message_id, reply_markup: markup || { inline_keyboard: [] } };
  if (m.photo) await tgApi(env, "editMessageCaption", { ...base, caption: ((m.caption || "") + "\n\n" + suffix).slice(0, 1000) });
  else await tgApi(env, "editMessageText", { ...base, text: ((m.text || "") + "\n\n" + suffix).slice(0, 4000) });
}
async function tgWebhook(req, env) {
  if (!eq(req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", await tgSecret(env))) return json({ ok: false }, 403);
  const u = await req.json().catch(() => ({})), cq = u.callback_query; if (!cq || !cq.message) return json({ ok: true });
  const ans = t => tgApi(env, "answerCallbackQuery", { callback_query_id: cq.id, text: t, show_alert: false });
  if (String(cq.message.chat.id) !== String(tgChat(env))) { await ans("Not allowed"); return json({ ok: true }); }
  const [a, x, y, z] = String(cq.data || "").split(":");
  const back = (ipa, h8) => ({ inline_keyboard: [[{ text: "✅ Unblock", callback_data: `FX:unb:${ipa}:${h8}` }, { text: "🔓 Reopen site", callback_data: "UL" }]] });
  if (a === "LK") { await env.ZV.put("sec:lockdown", "1"); _lk = { v: true, t: Date.now() }; await ans("Site locked"); await tgEdit(env, cq, "🔴 LOCKDOWN ON — visitors see maintenance page", { inline_keyboard: [[{ text: "🔓 Reopen site", callback_data: "UL" }]] }); }
  else if (a === "UL") { await env.ZV.delete("sec:lockdown"); _lk = { v: false, t: Date.now() }; await ans("Site reopened"); await tgEdit(env, cq, "🟢 Site reopened"); }
  else if (a === "BM") { await ans("Choose how long"); await tgApi(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[...["15m", "1h", "24h", "7d"].map(d => ({ text: "⏱ " + d, callback_data: `BD:${d}:${x}:${y}` }))], [{ text: "« Back", callback_data: `FA:${x}:${y}` }]] } }); }
  else if (a === "BD") { const sec = DUR[x] || 3600; await env.ZV.put("sec:ban:" + y, "1", { expirationTtl: sec }); if (z && z !== "-") { const em = await env.ZV.get("eh:" + z); if (em) await env.ZV.put("blk:" + em, "1", { expirationTtl: sec }); } await ans(`Blocked for ${x}`); await tgEdit(env, cq, `⏱ Blocked for ${x}: IP ${y}${z && z !== "-" ? " + that account" : ""}`, back(y, z || "-")); }
  else if (a === "FA") { await ans("Founder actions"); await tgApi(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: "🔓 Reopen site", callback_data: "UL" }, { text: "🔒 Pause logins 1h", callback_data: "FX:frz" }], [{ text: "🚪 Log out everyone", callback_data: "FX:rev" }, { text: "🔕 Mute alerts 1h", callback_data: "FX:mute" }], [{ text: "✅ Unblock this user", callback_data: `FX:unb:${x}:${y}` }]] } }); }
  else if (a === "FX") {
    if (x === "frz") { await env.ZV.put("sec:freeze", "1", { expirationTtl: 3600 }); await ans("Logins/sign-ups paused 1h"); await tgEdit(env, cq, "🔒 Logins and sign-ups paused for 1 hour"); }
    else if (x === "rev") { await env.ZV.put("sec:gen", rid(4)); _gen.t = 0; await ans("Everyone logged out"); await tgEdit(env, cq, "🚪 All user sessions revoked"); }
    else if (x === "mute") { await env.ZV.put("sec:mute", "1", { expirationTtl: 3600 }); await ans("Muted 1h"); await tgEdit(env, cq, "🔕 Alerts muted for 1 hour"); }
    else if (x === "unb") { await env.ZV.delete("sec:ban:" + y); if (z && z !== "-") { const em = await env.ZV.get("eh:" + z); if (em) await Promise.all([env.ZV.delete("blk:" + em), env.ZV.delete("lf:" + em)]); } await ans("Unblocked"); await tgEdit(env, cq, "✅ Unblocked"); }
  }
  else if (a === "AP") { const o = await approve(env, x); await ans(o ? "Approved ✅" : "Order not found"); await tgEdit(env, cq, o ? "✅ APPROVED — access unlocked" : "Order not found"); }
  else if (a === "RJ") { const o = await reject(env, x); await ans(o ? "Rejected" : "Order not found"); await tgEdit(env, cq, "❌ REJECTED"); }
  else await ans("Unknown action");
  return json({ ok: true });
}

// ---------------- Edge security ----------------
let _lk = { v: false, t: 0 };
const locked = async env => { if (Date.now() - _lk.t > 4000) _lk = { v: !!(await env.ZV.get("sec:lockdown")), t: Date.now() }; return _lk.v; };
const BAD = /(<\s*script|javascript:|onerror\s*=|onload\s*=|union\s+select|or\s+1\s*=\s*1|;\s*drop\s+table|\bsleep\s*\(|\.\.\/|xp_cmdshell|%0d%0a)/i;
const maint = () => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Maintenance</title><body style="font-family:system-ui;text-align:center;padding:12vh 20px"><h1>🔧 Back soon</h1><p>Taskifyra is under maintenance. Please check back shortly.</p><p style="margin-top:60px"><a href="#" id=f style="color:#bbb;font-size:12px">·</a></p><script>f.onclick=async e=>{e.preventDefault();const c=prompt("Founder passcode");if(!c)return;const r=await(await fetch("/api/admin/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:c})})).json();if(r.ok)location.reload();else alert("No")}</script>`, { status: 503, headers: { "Content-Type": "text/html;charset=utf-8", "Retry-After": "600", "Cache-Control": "no-store" } });
function harden(r, p, api, env) {
  const h = new Headers(r.headers);
  h.set("X-Content-Type-Options", "nosniff"); h.set("X-Frame-Options", "DENY"); h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"); h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains"); h.set("Cross-Origin-Opener-Policy", "same-origin");
  const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
  h.set(env.CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", csp);
  if (api) h.set("Cache-Control", "no-store"); else if (p === "/sw.js") { h.set("Cache-Control", "no-cache"); h.set("Service-Worker-Allowed", "/"); } else if (p.startsWith("/icons/") || p.startsWith("/img/")) h.set("Cache-Control", "public, max-age=604800");
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

const adminOK = (req, env, url) => env.ADMIN_TOKEN && (req.headers.get("Authorization") === "Bearer " + env.ADMIN_TOKEN || url.searchParams.get("t") === env.ADMIN_TOKEN);
const founderOK = async (env, tk) => !!(tk && await env.ZV.get("founder:" + tk));
const flOK = async (req, env, url, id) => {
  if (await founderOK(env, req.headers.get("X-Founder-Token"))) return true;
  const raw = await env.ZV.get("order:" + (url.searchParams.get("oid") || "")), o = raw && JSON.parse(raw);
  const live = o && o.status === "approved" && (!o.exp || o.exp > Date.now());
  return !!(o && o.key === url.searchParams.get("key") && live && (o.item === id || o.item === "up:" + id || ((isMem(o.item) || isBiz(o.item)) && memCovers(o.item, id))));
};

async function serveStatic(req, env) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Taskifyra: static files are not connected. Add the ASSETS binding ([assets] binding = \"ASSETS\" in wrangler.toml) and redeploy.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const res = await env.ASSETS.fetch(req);
  const xr = res.headers.get("X-Robots-Tag");
  if (xr && /noindex/i.test(xr)) { const h = new Headers(res.headers); h.delete("X-Robots-Tag"); return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h }); }
  return res;
}

async function guard(req, env, ctx, url, p) {
  const api = p.startsWith("/api/"), me_ = ip(req);
  if (api && await env.ZV.get("sec:ban:" + me_)) return json({ error: "Forbidden" }, 403);
  if (!["GET", "HEAD", "POST", "DELETE", "OPTIONS"].includes(req.method)) return new Response("Method not allowed", { status: 405 });
  if (await locked(env) && !/^\/api\/(founder|admin\/(unlock|status|lockdown)|tg-webhook|stripe-webhook)/.test(p)) return api ? json({ error: "Maintenance" }, 503) : maint();
  if (!api) return route(req, env, ctx, url, p);
  const og = req.headers.get("Origin"), site = (env.SITE_URL || "").replace(/\/$/, "");
  if (og && og !== url.origin && og !== site && !["https://taskifyra.com", "https://www.taskifyra.com", "https://taskifyra.pages.dev"].includes(og)) { ctx.waitUntil(secAlert(env, "Blocked foreign origin", me_, og + " → " + p)); return json({ error: "Forbidden" }, 403); }
  if (req.method === "POST" && p !== "/api/tg-webhook" && p !== "/api/stripe-webhook") {
    const txt = await req.text(), big = p === "/api/admin/file" ? 1500000 : p === "/api/order" ? 700000 : p === "/api/translate" ? 150000 : p === "/api/notes" ? 250000 : 60000;
    if (txt.length > big) return json({ error: "Too large" }, 413);
    const scan = txt.length > 5000 && p === "/api/order" ? txt.replace(/"proof":"[^"]*"/, "") : txt;
    if (!/^\/api\/(login|signup)$/.test(p) && p !== "/api/translate" && p !== "/api/admin/file" && BAD.test(scan)) {
      const c = await hit(env, "sec:bad:" + me_, 3600); ctx.waitUntil(secAlert(env, "Payload injection blocked", me_, p + " · " + scan.slice(0, 120)));
      if (c >= 3) await env.ZV.put("sec:ban:" + me_, "1", { expirationTtl: 3600 });
      return json({ error: "Invalid input" }, 400);
    }
    req = new Request(req.url, { method: "POST", headers: req.headers, body: txt });
  }
  return route(req, env, ctx, url, p);
}

async function route(req, env, ctx, url, p) {
  try {
    if (p === "/api/signup" && req.method === "POST") return signup(req, env, ctx);
    if (p === "/api/login" && req.method === "POST") return login(req, env, ctx);
    if (p === "/api/me" && req.method === "GET") return me(req, env);
    if (p === "/api/notes" && req.method === "POST") return saveNotes(req, env);
    if (p === "/api/logout" && req.method === "POST") { const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.get("Authorization") || ""); if (m) await env.ZV.delete("sess:" + (await sha(m[1]))); return json({ ok: true }); }
    if (p === "/api/tg-webhook" && req.method === "POST") return tgWebhook(req, env);
    if (p === "/api/admin/tg-setup") {
      if (!adminOK(req, env, url)) return json({ error: "auth" }, 401);
      return json(await tgApi(env, "setWebhook", { url: (env.SITE_URL || url.origin).replace(/\/$/, "") + "/api/tg-webhook", secret_token: await tgSecret(env), allowed_updates: ["callback_query"] }));
    }
    // founder-only security console
    if (p === "/api/admin/unlock" && req.method === "POST") {
      const n = +(await env.ZV.get("sec:fail:" + ip(req))) || 0; if (n >= 5) return json({ ok: false }, 429);
      const code = String((await req.json().catch(() => ({}))).code || "");
      if (env.FOUNDER_CODE && code.length >= 6 && eq(await sha(code), await sha(env.FOUNDER_CODE))) { await env.ZV.delete("sec:lockdown"); _lk = { v: false, t: Date.now() }; await tg(env, "🟢 Lockdown lifted by founder passcode"); return json({ ok: true }); }
      const c = await hit(env, "sec:fail:" + ip(req), 900); if (c >= 5) { await env.ZV.put("sec:ban:" + ip(req), "1", { expirationTtl: 900 }); ctx.waitUntil(secAlert(env, "Founder unlock brute-force", ip(req), c + " failed attempts, IP banned 15 min")); }
      return json({ ok: false }, 401);
    }
    if (/^\/api\/admin\/(status|lockdown)$/.test(p)) {
      if (!(await founderOK(env, req.headers.get("X-Founder-Token")))) return json({ ok: false }, 401);
      if (p.endsWith("status")) { const l = await env.ZV.list({ prefix: "sec:ev:", limit: 15 }); return json({ ok: true, lock: !!(await env.ZV.get("sec:lockdown")), events: (await Promise.all(l.keys.map(k => env.ZV.get(k.name)))).map(v => { try { return JSON.parse(v) } catch (e) { return null } }).filter(Boolean) }); }
      const b = await req.json().catch(() => ({})); if (b.on) await env.ZV.put("sec:lockdown", "1"); else await env.ZV.delete("sec:lockdown"); _lk = { v: !!b.on, t: Date.now() };
      await tg(env, b.on ? "🔴 EMERGENCY LOCKDOWN ON (founder dashboard)" : "🟢 Lockdown OFF (founder dashboard)", b.on ? { inline_keyboard: [[{ text: "🔓 Reopen site", callback_data: "UL" }]] } : undefined);
      return json({ ok: true });
    }
    if (p === "/api/admin/proof" && req.method === "GET") {
      if (!(await founderOK(env, req.headers.get("X-Founder-Token"))) && !adminOK(req, env, url)) return json({ ok: false }, 401);
      const d = (await env.ZV.get("proof:" + (url.searchParams.get("id") || ""))) || "", m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(d); if (!m) return json({ ok: false }, 404);
      return new Response(Uint8Array.from(atob(m[2]), x => x.charCodeAt(0)), { headers: { "Content-Type": m[1], "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    }

    if (p === "/api/ask" && req.method === "POST") {
      const acct = await sessUser(req, env).catch(() => null), lim = acct ? 20 : 4;
      if (await hit(env, "ai:" + (acct ? acct.email : ip(req)) + ":" + dayOf(Date.now()), 86400) > lim) return json({ ok: false, error: "limit" }, 429);
      if (!env.AI) return json({ ok: false, error: "AI binding missing" }, 503);
      const d = await req.json().catch(() => ({})), q = clean(d.q, 400), nctx = String(d.ctx || "").slice(0, 3000), lg = LNG[d.lang] ? d.lang : "en";
      if (q.length < 3) return json({ ok: false, error: "empty" }, 400);
      let a = "";
      try { const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: [{ role: "system", content: "You are Taskifyra's assistant for garment QC, freelancers, students, job seekers and clinics in Bangladesh. Answer in under 120 words in simple English, using the provided notes when they cover the question. If unsure, say so. Never state legal, medical or tax advice as fact; tell the user to verify with official sources." }, { role: "user", content: "Notes:\n" + nctx + "\n\nQuestion: " + q }], max_tokens: 300 }); a = String((r && r.response) || "").trim(); } catch (e) {}
      if (!a) return json({ ok: false, error: "unavailable" }, 502);
      if (lg !== "en") a = await trOne(env, lg, a);
      return json({ ok: true, a });
    }
    if (p === "/api/files" && req.method === "GET") { const id = url.searchParams.get("id") || ""; if (!isTpl(id) || !(await flOK(req, env, url, id))) return json({ ok: false }, 403); const l = await env.ZV.list({ prefix: "fl:" + id + ":" }); return json({ ok: true, files: l.keys.map(k => ({ fid: k.name.split(":").pop(), name: (k.metadata && k.metadata.name) || "file" })) }); }
    if (p === "/api/file" && req.method === "GET") { const id = url.searchParams.get("id") || "", fid = (url.searchParams.get("fid") || "").replace(/[^0-9a-f]/g, ""); if (!isTpl(id) || !(await flOK(req, env, url, id))) return json({ ok: false }, 403); const f = JSON.parse((await env.ZV.get("fl:" + id + ":" + fid)) || "null"); if (!f) return json({ ok: false }, 404); return new Response(Uint8Array.from(atob(f.b64), x => x.charCodeAt(0)), { headers: { "Content-Type": f.mime || "application/octet-stream", "Content-Disposition": 'attachment; filename="' + f.name + '"', "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }); }
    if (p === "/api/admin/file" && req.method === "POST") { if (!adminOK(req, env, url) && !(await founderOK(env, req.headers.get("X-Founder-Token")))) return json({ ok: false }, 401); const d = await req.json().catch(() => ({})), tp = (Array.isArray(d.tpls) ? d.tpls : []).map(String).filter(x => isTpl(x)).slice(0, 40), name = clean(d.name, 80).replace(/[^\w.\- ]/g, "_") || "file", b64 = String(d.b64 || ""); if (!tp.length || !/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length > 1400000) return json({ ok: false, error: "Check template ids and file (max about 1 MB)" }, 400); const fid = rid(6); await Promise.all(tp.map(t => env.ZV.put("fl:" + t + ":" + fid, JSON.stringify({ name, mime: String(d.mime || "").slice(0, 100), b64 }), { metadata: { name } }))); return json({ ok: true, n: tp.length, fid }); }
    if (p === "/api/translate" && req.method === "POST") {
      const og = req.headers.get("Origin"); if (og && og !== url.origin) return json({ ok: false, error: "origin" }, 403);
      const d = await req.json().catch(() => ({}));
      if (!LNG[d.lang] || !Array.isArray(d.texts)) return json({ ok: false, error: "bad request" }, 400);
      if (!env.AI) return json({ ok: false, error: "Workers AI binding named AI is not set" }, 503);
      let total = 0; const texts = d.texts.slice(0, 24).map(x => String(x).slice(0, 900)).filter(x => (total += x.length) <= 9000);
      return json({ ok: true, out: await Promise.all(texts.map(x => trOne(env, d.lang, x))) });
    }
    if (p === "/api/order" && req.method === "POST") {
      if (await hit(env, "sec:ord:" + ip(req), 3600) > 8) { ctx.waitUntil(secAlert(env, "Order flood", ip(req), p)); return json({ error: "Too many attempts. Try again later." }, 429); }
      const d = await req.json();
      if (!["bKash", "Nagad", "Rocket"].includes(d.method)) return json({ error: "method" }, 400);
      if (!d.trx || String(d.trx).trim().length < 4) return json({ error: "Enter the transaction ID" }, 400);
      const acct = await sessUser(req, env).catch(() => null); const o = await createOrder(env, d, d.method, "pending", {}, acct);
      ctx.waitUntil((async () => {
        const cap = `🛒 New ${o.method} order\nBuyer: ${o.customer.name} · ${o.customer.phone}\n${o.customer.email}\nKit: ${o.item}\nAmount: ${o.amount} ${o.currency}\nGateway: ${o.method} · TRX ${o.trx}\nTime: ${bdt(o.at)}${o.promo ? "\n🎁 50% welcome offer applied" : ""}`;
        const kb = { inline_keyboard: [[{ text: "✅ Approve", callback_data: "AP:" + o.id }, { text: "❌ Reject", callback_data: "RJ:" + o.id }], ...secKb(ip(req), "-").inline_keyboard] };
        if (!(o._proof && await tgPhoto(env, o._proof, cap, kb))) await tg(env, cap + (o._proof ? "" : "\n(no screenshot)"), kb);
        await mail(env, env.ADMIN_EMAIL, `New ${o.method} order ${o.amount} BDT`, `<p>${esc(o.customer.name)} · ${esc(o.customer.phone)} · ${esc(o.customer.email)}<br>Item ${esc(o.item)} · TRX ${esc(o.trx)}<br><a href="${esc(env.SITE_URL)}/admin">Open admin</a></p>`);
      })());
      return json({ id: o.id, key: o.key, status: o.status, amount: o.amount, currency: o.currency });
    }
    if (p === "/api/order" && req.method === "GET") {
      const raw = await env.ZV.get("order:" + url.searchParams.get("id")), o = raw && JSON.parse(raw);
      if (!o || o.key !== url.searchParams.get("key")) return json({ error: "not found" }, 404);
      return json({ status: o.status, exp: o.exp, item: o.item, ver: o.ver });
    }
    if (p === "/api/stripe" && req.method === "POST") {
      if (!env.STRIPE_SECRET) return json({ error: "stripe not configured" }, 503);
      const acct = await sessUser(req, env).catch(() => null); const o = await createOrder(env, await req.json(), "Card", "awaiting_card", {}, acct);
      const f = new URLSearchParams({ mode: "payment", success_url: env.SITE_URL + "/?paid=1", cancel_url: env.SITE_URL + "/", customer_email: o.customer.email, client_reference_id: o.id,
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(Math.round(o.amount * 100)), "line_items[0][price_data][product_data][name]": "Taskifyra " + o.item });
      const r = await (await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: "Bearer " + env.STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" }, body: f })).json();
      if (!r.url) return json({ error: "stripe" }, 502);
      ctx.waitUntil(tg(env, `💳 Card checkout started: ${o.item} · $${o.amount}\n${o.customer.name} · ${o.customer.email}\n${bdt(o.at)}`));
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
      const o = await approve(env, (await req.json()).id); return o ? json({ ok: true }) : json({ error: "not found" }, 404);
    }
    if (p === "/api/releases" && req.method === "GET") {
      const rel = {}, ks = (await env.ZV.list({ prefix: "rel:" })).keys.slice(0, 100);
      (await Promise.all(ks.map(async k => [k.name, JSON.parse((await env.ZV.get(k.name)) || "null")]))).forEach(([n, r]) => { if (r) rel[n.slice(4)] = { v: r.v, note: r.note, at: r.at }; });
      return json({ ok: true, rel });
    }
    if (p === "/api/release" && req.method === "GET") {
      const id = url.searchParams.get("id") || "", raw = await env.ZV.get("order:" + (url.searchParams.get("oid") || "")), o = raw && JSON.parse(raw);
      const live = o && o.status === "approved" && (!o.exp || o.exp > Date.now());
      const okOwner = live && o.item === "up:" + id, okMember = live && (isMem(o.item) || isBiz(o.item)) && memCovers(o.item, id);
      if (!o || o.key !== url.searchParams.get("key") || !(okOwner || okMember)) return json({ ok: false }, 403);
      const r = JSON.parse((await env.ZV.get("rel:" + id)) || "null");
      return r ? json({ ok: true, v: r.v, note: r.note, lines: r.lines }) : json({ ok: false }, 404);
    }
    if (p === "/api/admin/release" && req.method === "POST") {
      if (!adminOK(req, env, url)) return json({ error: "auth" }, 401);
      const d = await req.json().catch(() => ({})), id = String(d.id || ""), v = Math.round(+d.v || 0), from = Math.max(0, +d.from || 0);
      if (!isTpl(id) || !PRICES[id]) return json({ ok: false, error: "Unknown template id" }, 400);
      if (v < 2 || v > 99) return json({ ok: false, error: "Version must be 2 or higher" }, 400);
      const note = String(d.note || "").slice(0, 300), name = String(d.name || id).slice(0, 80), lines = (Array.isArray(d.lines) ? d.lines : []).map(x => String(x).slice(0, 400)).slice(0, 40);
      if (from === 0) await env.ZV.put("rel:" + id, JSON.stringify({ v, note, lines, at: Date.now() }));
      const own = JSON.parse((await env.ZV.get("own:" + id)) || "[]"), batch = own.slice(from, from + 15), half = Math.round(PRICES[id] / 2);
      await Promise.all(batch.map(em => mail(env, em, `🔔 New version of ${name} on Taskifyra`, `<p>Version ${v} of <b>${esc(name)}</b> is out. ${esc(note)}</p><p>Upgrade for half price (${half} BDT) at ${esc(env.SITE_URL || "")}.</p>`)));
      if (from === 0) await tg(env, `🔔 Release: ${id} v${v} · notifying ${own.length} owner(s)`);
      return json({ ok: true, total: own.length, done: Math.min(own.length, from + batch.length), next: from + 15 < own.length ? from + 15 : null });
    }

    if (p === "/api/founder") {
      if (req.method === "GET") return json({ ok: await founderOK(env, url.searchParams.get("token")) });
      if (req.method !== "POST" || !env.FOUNDER_CODE) return json({ ok: false }, 400);
      const rk = "rl:" + ip(req), n = +(await env.ZV.get(rk) || 0);
      if (n >= 5) return json({ ok: false, error: "slow down" }, 429);
      const code = String((await req.json().catch(() => ({}))).code || "");
      if (code.length < 6 || !eq(await sha(code), await sha(env.FOUNDER_CODE))) {
        await env.ZV.put(rk, String(n + 1), { expirationTtl: 3600 });
        ctx.waitUntil(secAlert(env, n >= 2 ? "🔥 Founder passcode brute-force" : "⚠️ Founder passcode wrong", ip(req), "attempt " + (n + 1) + " of 5"));
        return json({ ok: false });
      }
      const token = rid(16); await env.ZV.put("founder:" + token, "1", { expirationTtl: 2592000 });
      ctx.waitUntil(secAlert(env, "👑 Founder login", ip(req), "New founder session"));
      return json({ ok: true, token });
    }
    if (p === "/api/founder-stats" && req.method === "GET") {
      if (!(await founderOK(env, req.headers.get("X-Founder-Token")))) return json({ ok: false }, 401);
      return json(await stats(env));
    }
    if (p === "/api/feedback" && req.method === "POST") {
      const rk = "fbrl:" + ip(req), n = +(await env.ZV.get(rk) || 0);
      if (n >= 8) return json({ ok: false, error: "slow down" }, 429);
      await kvPut(env, rk, String(n + 1), { expirationTtl: 3600 });
      const d = await req.json().catch(() => ({})), text = String(d.text || "").slice(0, 2000);
      if (!text.trim()) return json({ error: "empty" }, 400);
      const fb = { text, name: clean(d.name, 80), email: clean(d.email, 120), at: Date.now() };
      const [saved, sent] = await Promise.all([kvPut(env, "fb:" + fb.at + rid(2), JSON.stringify(fb)), tg(env, `📜 New feedback\nFrom: ${fb.name} <${fb.email}>\n\n${fb.text}`)]);
      if (env.ADMIN_EMAIL) ctx.waitUntil(mail(env, env.ADMIN_EMAIL, "New feedback on Taskifyra", `<p>${esc(fb.name)} &lt;${esc(fb.email)}&gt;</p><p>${esc(fb.text)}</p>`));
      if (!sent && !saved) return json({ ok: false, error: "Set TG_BOT_TOKEN, TG_CHAT_ID and the ZV KV binding" }, 503);
      return json({ ok: true, telegram: sent, saved });
    }
    if (p === "/api/remind" && req.method === "POST") {
      const rk = "remrl:" + ip(req), n = +(await env.ZV.get(rk) || 0);
      if (n >= 20) return json({ ok: false, error: "slow down" }, 429);
      await kvPut(env, rk, String(n + 1), { expirationTtl: 3600 });
      const d = await req.json().catch(() => ({})), title = clean(d.title, 120), date = String(d.date || "");
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return json({ ok: false, error: "Add a task and a valid date" }, 400);
      const email = /.+@.+\..+/.test(d.email || "") ? clean(d.email, 120) : "", chat = /^-?\d{5,15}$/.test(String(d.chat || "")) ? String(d.chat) : "";
      if (!email && !chat) return json({ ok: false, error: "Add an email or a Telegram chat ID" }, 400);
      const id = rid(8);
      await env.ZV.put("rem:" + id, JSON.stringify({ title, date, days: Math.min(60, Math.max(1, +d.days || 7)), email, chat, s: 0 }), { expirationTtl: 400 * 864e5 });
      ctx.waitUntil(runReminders(env));
      return json({ ok: true, id });
    }
    if (p === "/api/remind" && req.method === "DELETE") { const id = url.searchParams.get("id") || ""; if (/^[0-9a-f]{16}$/.test(id)) await env.ZV.delete("rem:" + id); return json({ ok: true }); }
    if (p === "/api/remind-run") { if (!adminOK(req, env, url)) return json({ error: "auth" }, 401); return json({ ok: true, sent: await runReminders(env) }); }
    if (p === "/api/referral" && req.method === "POST") {
      const d = await req.json().catch(() => ({})), em = String(d.email || "").trim().toLowerCase().slice(0, 120);
      if (!/.+@.+\..+/.test(em)) return json({ error: "email" }, 400);
      const code = (await sha(em)).slice(0, 8), WK = 7 * 864e5, ref = String(d.ref || "").slice(0, 12);
      await env.ZV.put("refown:" + code, em);
      if (ref && ref !== code && !(await env.ZV.get("refgot:" + em))) {
        const rk = "refrl:" + ip(req), n = +(await env.ZV.get(rk) || 0), owner = await env.ZV.get("refown:" + ref);
        if (owner && n < 5) {
          await env.ZV.put(rk, String(n + 1), { expirationTtl: 3600 }); await env.ZV.put("refgot:" + em, ref);
          for (const e of [em, owner]) { const cur = +(await env.ZV.get("bonus:" + e) || 0); await env.ZV.put("bonus:" + e, String(Math.max(cur, Date.now()) + WK)); }
          await env.ZV.put("refn:" + ref, String(+(await env.ZV.get("refn:" + ref) || 0) + 1));
          await tg(env, `🎁 Referral: ${em} joined via ${owner}`);
        }
      }
      return json({ code, count: +(await env.ZV.get("refn:" + code) || 0), exp: +(await env.ZV.get("bonus:" + em) || 0) });
    }

    if (p === "/api/proof-count" && req.method === "GET") return json({ ok: true, today: +(await env.ZV.get("pc:" + dayOf(Date.now()))) || 0 });
    if (p === "/admin") {
      if (!adminOK(req, env, url)) return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Admin</title><body style="font:16px system-ui;padding:20px"><form method="get"><p>Admin token</p><input name="t" type="password" autocomplete="current-password" style="padding:10px;width:240px"> <button style="padding:10px">Open</button></form>`, { status: 401, headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" } });
      const ids = (await env.ZV.list({ prefix: "pend:" })).keys.map(k => k.name.slice(5));
      const T = encodeURIComponent(url.searchParams.get("t") || "");
      const rows = (await Promise.all(ids.map(i => env.ZV.get("order:" + i)))).filter(Boolean).map(JSON.parse).filter(o => o.status === "pending").sort((a, b) => b.at - a.at)
        .map(o => `<tr><td>${esc(o.customer.name)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.email)}</td><td>${esc(o.item)}</td><td>${o.amount} ${o.currency}<br>${esc(o.method)} ${esc(o.trx)}${o.pf ? `<br><a href="/api/admin/proof?id=${esc(o.id)}&t=${T}" target="_blank">📎 proof</a>` : ""}</td><td><button onclick="ap('${esc(o.id)}',this)">Approve</button></td></tr>`).join("");
      // NOTE on escaping: "\\r?\\n" below is emitted to the browser as /\r?\n/ (a valid regex).
      return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Admin</title><style>body{font:14px system-ui;padding:12px;max-width:720px}td{border-bottom:1px solid #ccc;padding:8px;vertical-align:top}input,textarea{display:block;width:100%;padding:8px;margin:4px 0;box-sizing:border-box}</style><h2>Pending orders</h2><table>${rows || "<tr><td>None</td></tr>"}</table>
<h2>Release a new template version</h2><p>Owners are emailed and can upgrade at half price (valid 6 months). Members get the latest automatically.</p>
<input id="r_id" placeholder="Template id, e.g. g1"><input id="r_nm" placeholder="Template name (for the email)"><input id="r_v" type="number" value="2" min="2"><input id="r_note" placeholder="One-line note: what is new"><textarea id="r_lines" rows="6" placeholder="New content, one line per item"></textarea><button onclick="rel()">Publish and notify owners</button> <span id="r_out"></span>
<h2>Upload a downloadable file</h2><p>Buyers of these templates can download it (Excel/PDF, up to about 1 MB).</p><input id="u_t" placeholder="Template ids, e.g. g1,g11"><input id="u_f" type="file"><button onclick="upl()">Upload</button> <span id="u_out"></span>
<script>
function upl(){var f=document.getElementById('u_f').files[0],o=document.getElementById('u_out');if(!f)return;var r=new FileReader();r.onload=async function(){var b=String(r.result).split(',')[1];var res=await fetch('/api/admin/file?t='+tk(),{method:'POST',body:JSON.stringify({tpls:document.getElementById('u_t').value.split(',').map(function(s){return s.trim()}).filter(Boolean),name:f.name,mime:f.type,b64:b})});var j=await res.json();o.textContent=j.ok?'Uploaded to '+j.n+' template(s)':(j.error||'Failed')};r.readAsDataURL(f)}
function tk(){return encodeURIComponent(new URLSearchParams(location.search).get('t'))}
async function ap(id,b){b.disabled=true;const r=await fetch('/api/admin/approve?t='+tk(),{method:'POST',body:JSON.stringify({id})});b.textContent=r.ok?'Approved':'Failed'}
async function rel(){const g=x=>document.getElementById(x),o=g('r_out');const body={id:g('r_id').value.trim(),name:g('r_nm').value,v:+g('r_v').value,note:g('r_note').value,lines:g('r_lines').value.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean),from:0};o.textContent='Sending...';
for(;;){const r=await fetch('/api/admin/release?t='+tk(),{method:'POST',body:JSON.stringify(body)});const j=await r.json();if(!j.ok){o.textContent=j.error||'Failed';return}o.textContent='Notified '+j.done+' of '+j.total;if(j.next==null)break;body.from=j.next}o.textContent+=' - done'}
</script>`, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    }
  } catch (e) { return json({ error: String(e.message || e) }, 400); }
  return serveStatic(req, env);
}

return {
  sessUser, // exposed so the marketplace can resolve the logged-in user directly (no internal HTTP hop)
  async scheduled(ev, env, ctx) { ctx.waitUntil(runReminders(env)); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname, api = p.startsWith("/api/") || p === "/admin";
    let res;
    try { res = await guard(req, env, ctx, url, p); } catch (e) { res = json({ error: String(e.message || e) }, 400); }
    return harden(res, p, api, env);
  }
};
})();

// ======================================= SECTION 2: MARKETPLACE (D1 + R2 + bKash) =======================================
const Market = (() => {
// ---------- helpers ----------
const J = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...h } });

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Constant-time string compare.
const same = (a, b) => {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

// HMAC-SHA256 with SESSION_SECRET (used for 5-minute signed download links).
async function mac(env, m) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET missing");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(m)));
}

const AL = "abcdefghjkmnpqrstuvwxyz23456789";
function rid(n = 8) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map((x) => AL[x % AL.length]).join("");
}

// Strip control chars and angle brackets, collapse whitespace, cap length.
const clean = (s, max = 200) =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Day string in Bangladesh time (UTC+6).
const dayStr = (t) => new Date(t + 216e5).toISOString().slice(0, 10);

// Tiny per-IP rate limiter on the existing KV namespace (ZV). Returns true when the caller is over the limit.
async function limited(env, req, name, max, ttl = 60) {
  if (!env.ZV) return false;
  const ip = req.headers.get("CF-Connecting-IP") || "x";
  const k = `rl:${name}:${ip}:${Math.floor(Date.now() / (ttl * 1000))}`;
  const n = +(await env.ZV.get(k)) || 0;
  if (n >= max) return true;
  await env.ZV.put(k, String(n + 1), { expirationTtl: Math.max(60, ttl) });
  return false;
}

// Resend e-mail. Best effort: never throws. Needs the RESEND_API_KEY secret and FROM_EMAIL var.
async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL || !to) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html }),
    });
    if (!r.ok) console.log("sendMail failed", r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.log("sendMail", String(e && e.message));
  }
}

// Marks a marketplace order approved (idempotent) and e-mails the buyer. Returns true if it changed.
async function approveMarketOrder(env, ctx, id, extra = {}) {
  const r = await env.DB.prepare(
    "UPDATE orders SET status='approved',approved_at=?,trx=COALESCE(NULLIF(?,''),trx) WHERE id=? AND status='pending' AND item LIKE 'x%'"
  ).bind(Date.now(), extra.trx || "", id).run();
  if (!r.meta.changes) return false;
  const o = await env.DB.prepare(
    "SELECT o.id,o.okey,o.email,o.name,p.title,s.slug FROM orders o JOIN products p ON p.id=o.item JOIN stores s ON s.id=p.store_id WHERE o.id=?"
  ).bind(id).first();
  if (o) {
    const link = `${env.SITE_URL || ""}/s/${o.slug}?o=${o.id}.${o.okey}`;
    const job = sendMail(env, o.email, "Your purchase is approved", `<p>Hi ${esc(o.name)},</p><p>Your payment for <b>${esc(o.title)}</b> is approved.</p><p><a href="${esc(link)}">Open your download</a></p><p>— Taskifyra</p>`);
    ctx && ctx.waitUntil ? ctx.waitUntil(job) : await job;
  }
  return true;
}

// ---------- bKash Tokenized Checkout (optional: active only when all secrets are set) ----------
// Sandbox BKASH_BASE: https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/
// Live BKASH_BASE:    https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/
const bkashOn = (env) => !!(env.BKASH_BASE && env.BKASH_USER && env.BKASH_PASS && env.BKASH_APP_KEY && env.BKASH_APP_SECRET);

async function bkCall(env, path, body, tok) {
  const r = await fetch(env.BKASH_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(tok ? { Authorization: tok, "X-APP-Key": env.BKASH_APP_KEY } : { username: env.BKASH_USER, password: env.BKASH_PASS }) },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function bkGrant(env) {
  const r = await bkCall(env, "token/grant", { app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET });
  if (!r.id_token) throw new Error("bKash auth failed");
  return r.id_token;
}

async function bkashRoutes(req, env, url, p, h) {
  if (!env.DB || !p.startsWith("/api/bkash/")) return null;
  if (!bkashOn(env)) return J({ ok: false, error: "bKash automatic payment is not enabled" }, 404);
  const origin = env.SITE_URL || url.origin;

  // POST {oid,key} -> {url} : send the buyer to bKash.
  if (p === "/api/bkash/start" && req.method === "POST") {
    const d = await req.json().catch(() => ({}));
    const o = await env.DB.prepare("SELECT id,okey,amount,phone,status FROM orders WHERE id=? AND method='bKash' AND item LIKE 'x%'").bind(String(d.oid || "")).first();
    if (!o || o.status !== "pending" || !same(o.okey || "", String(d.key || ""))) return J({ ok: false }, 403);
    const r = await bkCall(env, "create", { mode: "0011", payerReference: o.phone, callbackURL: `${origin}/api/bkash/cb?oid=${o.id}`, amount: Number(o.amount).toFixed(2), currency: "BDT", intent: "sale", merchantInvoiceNumber: o.id }, await bkGrant(env));
    return r.bkashURL ? J({ ok: true, url: r.bkashURL }) : J({ ok: false, error: "bKash could not start the payment" }, 502);
  }

  // bKash redirects the buyer here. Approve only if bKash says Completed, the amount and invoice match.
  if (p === "/api/bkash/cb" && req.method === "GET") {
    const oid = url.searchParams.get("oid") || "", pid = url.searchParams.get("paymentID") || "";
    const o = await env.DB.prepare("SELECT o.id,o.okey,o.amount,o.status,s.slug FROM orders o JOIN products p ON p.id=o.item JOIN stores s ON s.id=p.store_id WHERE o.id=?").bind(oid).first();
    if (!o) return Response.redirect(origin + "/", 302);
    let ok = o.status === "approved";
    if (!ok && o.status === "pending" && url.searchParams.get("status") === "success" && pid) {
      try {
        const r = await bkCall(env, "execute", { paymentID: pid }, await bkGrant(env));
        if (r.transactionStatus === "Completed" && Number(r.amount) === Number(o.amount) && r.merchantInvoiceNumber === o.id)
          ok = await approveMarketOrder(env, h.ctx, o.id, { trx: r.trxID });
      } catch (e) { console.log("bkash cb", String(e && e.message)); }
    }
    return Response.redirect(`${origin}/s/${o.slug}?o=${o.id}.${o.okey}${ok ? "" : "&pay=failed"}`, 302);
  }
  return J({ ok: false }, 404);
}

// ---------- seller stores, marketplace orders, media, payouts, signed downloads, reviews, admin ----------
const METHODS = ["bKash", "Nagad", "Rocket"];
const FILE_OK = /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|md|epub|png|jpe?g|webp|mp3|mp4|json|psd|ai|fig)$/i;
const V = "CASE WHEN o.currency='USD' THEN o.amount*120 ELSE o.amount END";
const feePct = (env) => Math.min(50, Math.max(0, Number(env.FEE_PCT ?? 10) || 0));

const first = (env, s, ...b) => env.DB.prepare(s).bind(...b).first();
const rows = (env, s, ...b) => env.DB.prepare(s).bind(...b).all().then((r) => r.results);
const ownStore = (env, a) => first(env, "SELECT id,slug,name,bio,logo_key,banner_key FROM stores WHERE owner_email=?", a.email);
const isAdmin = (req, env) => {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_API_KEY && same(t, env.ADMIN_API_KEY);
};

async function stats(env, s) {
  const since = Date.now() - 30 * 864e5;
  const series = await rows(env, `SELECT date((o.approved_at+21600000)/1000,'unixepoch') d,COUNT(*) n,SUM(${V}) v FROM orders o WHERE o.store_id=? AND o.status='approved' AND o.approved_at>? GROUP BY d ORDER BY d`, s.id, since);
  const net = await first(env, `SELECT COALESCE(SUM(${V}-o.fee_bdt),0) v FROM orders o WHERE o.store_id=? AND o.status='approved'`, s.id);
  const vw = await first(env, "SELECT COALESCE(SUM(n),0) n FROM views WHERE store_id=? AND day>=?", s.id, dayStr(since));
  const payouts = await rows(env, "SELECT id,amount_bdt,status,created_at FROM payouts WHERE store_id=? ORDER BY created_at DESC LIMIT 20", s.id);
  const taken = await first(env, "SELECT COALESCE(SUM(amount_bdt),0) t FROM payouts WHERE store_id=? AND status!='rejected'", s.id);
  return {
    views: vw.n,
    orders: series.reduce((t, x) => t + x.n, 0),
    revenue: Math.round(series.reduce((t, x) => t + x.v, 0)),
    series,
    payouts,
    balance: Math.max(0, Math.floor(net.v) - taken.t),
  };
}

// h = { sessUser(req) -> {email,name}|null, ctx }
async function routes(req, env, url, p, h) {
  if (!env.DB) return null;
  const m = req.method;
  const auth = async () => h.sessUser(req);

  // ---------- public ----------
  if (p === "/api/store" && m === "GET") {
    const s = await first(env, "SELECT id,slug,name,bio,logo_key,banner_key FROM stores WHERE slug=? AND status='live'", (url.searchParams.get("slug") || "").toLowerCase());
    if (!s) return J({ ok: false, error: "Store not found" }, 404);
    h.ctx.waitUntil(env.DB.prepare("INSERT INTO views(store_id,day,n) VALUES(?,?,1) ON CONFLICT(store_id,day) DO UPDATE SET n=n+1").bind(s.id, dayStr(Date.now())).run().catch(() => {}));
    const { id, ...store } = s;
    return J({
      ok: true,
      store,
      products: await rows(env, "SELECT id,title,blurb,price_bdt,cover_key FROM products WHERE store_id=? AND status='live' ORDER BY created_at DESC LIMIT 60", id),
      reviews: await rows(env, "SELECT r.product_id,r.stars,r.body,substr(u.name,1,instr(u.name||' ',' ')-1) who FROM reviews r JOIN products p ON p.id=r.product_id LEFT JOIN users u ON u.email=r.email WHERE p.store_id=? ORDER BY r.created_at DESC LIMIT 30", id),
      pay: { methods: METHODS, numbers: { bKash: env.PAY_BKASH || "01812410928", Nagad: env.PAY_NAGAD || "01812410928", Rocket: env.PAY_ROCKET || "01812410928" }, auto: bkashOn(env) },
    });
  }

  if (p === "/api/media" && m === "GET") {
    const k = url.searchParams.get("k") || "";
    if (!/^m\/[\w-]+\/[\w-]+$/.test(k)) return J({ ok: false }, 404);
    const f = await env.FILES.get(k);
    if (!f) return J({ ok: false }, 404);
    return new Response(f.body, { headers: { "Content-Type": f.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  }

  // ---------- buyer: order for a seller product (items starting with "x") ----------
  if (p === "/api/order" && m === "POST") {
    const raw = await req.clone().json().catch(() => null);
    if (!raw || typeof raw.item !== "string" || raw.item[0] !== "x") return null; // own catalogue -> legacy core
    if (await limited(env, req, "ord", 8)) return J({ ok: false, error: "Too many attempts. Try again in a minute." }, 429);
    const c = raw.customer || {};
    const name = clean(c.name, 80), email = clean(c.email, 120).toLowerCase(), phone = clean(c.phone, 20).replace(/^\+?88/, "");
    const method = raw.method, auto = raw.auto === true && method === "bKash" && bkashOn(env);
    const trx = clean(raw.trx, 30).toUpperCase();
    if (!METHODS.includes(method) || name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^01\d{9}$/.test(phone) || (!auto && !/^[A-Z0-9]{6,20}$/.test(trx)))
      return J({ ok: false, error: "Check your name, email, mobile number and TrxID." }, 400);
    const pr = await first(env, "SELECT p.id,p.price_bdt,p.store_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.status='live' AND s.status='live' AND p.r2_key IS NOT NULL", raw.item);
    if (!pr) return J({ ok: false, error: "This product is not available." }, 404);
    if (!auto && (await first(env, "SELECT 1 x FROM orders WHERE trx=? AND status!='rejected'", trx))) return J({ ok: false, error: "This TrxID was already used." }, 409);
    const id = "m" + rid(8), key = rid(16);
    let proofKey = null;
    if (typeof raw.proof === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(raw.proof) && raw.proof.length < 1.2e6) {
      try {
        const bytes = Uint8Array.from(atob(raw.proof.split(",")[1]), (ch) => ch.charCodeAt(0));
        proofKey = "proofs/" + id;
        await env.FILES.put(proofKey, bytes, { httpMetadata: { contentType: raw.proof.slice(5, raw.proof.indexOf(";")) } });
      } catch (e) { proofKey = null; }
    }
    await env.DB.prepare("INSERT INTO orders(id,okey,item,method,currency,amount,trx,name,email,phone,status,created_at,approved_at,store_id,fee_bdt,proof_key) VALUES(?,?,?,?,'BDT',?,?,?,?,?,'pending',?,0,?,?,?)")
      .bind(id, key, pr.id, method, pr.price_bdt, auto ? "" : trx, name, email, phone, Date.now(), pr.store_id, Math.round((pr.price_bdt * feePct(env)) / 100), proofKey).run();
    if (!auto) h.ctx.waitUntil(sendMail(env, env.ADMIN_EMAIL, "New marketplace order " + id, `<p>${esc(name)} · ${esc(method)} · ${pr.price_bdt} BDT · TrxID ${esc(trx)}</p>`));
    return J({ ok: true, id, key });
  }

  if (p === "/api/order" && m === "GET") {
    const o = await first(env, "SELECT o.status,o.item,p.file_name FROM orders o LEFT JOIN products p ON p.id=o.item WHERE o.id=? AND o.okey=? AND o.item LIKE 'x%'", url.searchParams.get("id") || "", url.searchParams.get("key") || "");
    if (!o) return null;
    return J({ ok: true, status: o.status, item: o.item, file: o.status === "approved" ? o.file_name : undefined });
  }

  // ---------- buyer: signed download (5 min, bound to the order) ----------
  if (p === "/api/dl" && m === "GET") {
    const oid = url.searchParams.get("oid") || "", pid = url.searchParams.get("pid") || "";
    const o = await first(env, "SELECT okey,item,status FROM orders WHERE id=?", oid);
    if (!o || o.status !== "approved" || !same(o.okey || "", url.searchParams.get("key") || "") || o.item !== pid) return J({ ok: false }, 403);
    const x = Date.now() + 3e5;
    return J({ ok: true, url: `/api/dl/get?oid=${encodeURIComponent(oid)}&pid=${encodeURIComponent(pid)}&x=${x}&s=${await mac(env, `${pid}.${oid}.${x}`)}` });
  }
  if (p === "/api/dl/get" && m === "GET") {
    const oid = url.searchParams.get("oid") || "", pid = url.searchParams.get("pid") || "", x = Number(url.searchParams.get("x")) || 0;
    if (x < Date.now() || !same(await mac(env, `${pid}.${oid}.${x}`), url.searchParams.get("s") || "")) return J({ ok: false }, 403);
    const o = await first(env, "SELECT status FROM orders WHERE id=? AND item=?", oid, pid);
    if (!o || o.status !== "approved") return J({ ok: false }, 403);
    const r = await first(env, "SELECT r2_key,file_name FROM products WHERE id=?", pid);
    const f = r && r.r2_key && (await env.FILES.get(r.r2_key));
    if (!f) return J({ ok: false }, 404);
    const fn = String(r.file_name || "download").replace(/[^\w.\- ]/g, "_");
    return new Response(f.body, { headers: { "Content-Type": f.httpMetadata?.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${fn}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }

  if (p === "/api/review" && m === "POST") {
    const a = await auth();
    if (!a) return J({ ok: false }, 401);
    const d = await req.json().catch(() => ({})), st = Math.round(+d.stars || 0), pid = String(d.pid || "");
    const bought = await first(env, "SELECT 1 x FROM orders WHERE email=? AND item=? AND status='approved'", a.email, pid);
    if (!bought || st < 1 || st > 5) return J({ ok: false, error: "Only buyers can review" }, 403);
    await env.DB.prepare("INSERT OR REPLACE INTO reviews(id,product_id,email,stars,body,created_at) VALUES(?,?,?,?,?,?)").bind(pid + ":" + a.email, pid, a.email, st, clean(d.body, 500), Date.now()).run();
    return J({ ok: true });
  }

  // ---------- seller (login required) ----------
  if (p.startsWith("/api/seller/")) {
    const a = await auth();
    if (!a) return J({ ok: false, error: "Please log in" }, 401);
    const s = await ownStore(env, a);

    if (p === "/api/seller/me" && m === "GET") {
      if (!s) return J({ ok: true, store: null });
      return J({
        ok: true, store: s, fee: feePct(env),
        products: await rows(env, "SELECT id,title,blurb,price_bdt,cover_key,r2_key IS NOT NULL has_file,status FROM products WHERE store_id=? ORDER BY created_at DESC", s.id),
        stats: await stats(env, s),
      });
    }

    if (p === "/api/seller/store" && m === "POST") {
      if (await limited(env, req, "store", 10)) return J({ ok: false, error: "Too many requests" }, 429);
      const d = await req.json().catch(() => ({})), slug = String(d.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{3,30}$/.test(slug) || /^-|-$/.test(slug)) return J({ ok: false, error: "Store name: 3-30 letters, numbers or hyphens" }, 400);
      if (["admin", "api", "img", "icons", "store", "s", "login", "seller", "mk-admin"].includes(slug)) return J({ ok: false, error: "This store name is reserved" }, 400);
      const ex = await first(env, "SELECT owner_email FROM stores WHERE slug=?", slug);
      if (ex && ex.owner_email !== a.email) return J({ ok: false, error: "This store name is taken" }, 409);
      if (s && s.slug !== slug) return J({ ok: false, error: "Store address cannot be changed after creation" }, 400);
      if (s) await env.DB.prepare("UPDATE stores SET name=?,bio=? WHERE id=?").bind(clean(d.name, 60), clean(d.bio, 300), s.id).run();
      else await env.DB.prepare("INSERT INTO stores(id,owner_email,slug,name,bio,created_at) VALUES(?,?,?,?,?,?)").bind(rid(6), a.email, slug, clean(d.name, 60), clean(d.bio, 300), Date.now()).run();
      return J({ ok: true });
    }

    if (!s) return J({ ok: false, error: "Create your store first" }, 400);

    if (p === "/api/seller/product" && m === "POST") {
      const d = await req.json().catch(() => ({})), price = Math.round(+d.price || 0);
      if (price < 49 || price > 50000) return J({ ok: false, error: "Price must be 49 to 50000 BDT" }, 400);
      const title = clean(d.title, 100);
      if (title.length < 3) return J({ ok: false, error: "Add a product title" }, 400);
      const n = await first(env, "SELECT COUNT(*) n FROM products WHERE store_id=?", s.id);
      if (n.n >= 100) return J({ ok: false, error: "Product limit reached" }, 400);
      const id = "x" + rid(6);
      await env.DB.prepare("INSERT INTO products(id,store_id,title,blurb,price_bdt,created_at,status) VALUES(?,?,?,?,?,?,'draft')").bind(id, s.id, title, clean(d.blurb, 400), price, Date.now()).run();
      return J({ ok: true, id });
    }

    if (p === "/api/seller/product/update" && m === "POST") {
      const d = await req.json().catch(() => ({})), price = Math.round(+d.price || 0);
      if (price < 49 || price > 50000) return J({ ok: false, error: "Price must be 49 to 50000 BDT" }, 400);
      const r = await env.DB.prepare("UPDATE products SET title=?,blurb=?,price_bdt=? WHERE id=? AND store_id=?").bind(clean(d.title, 100), clean(d.blurb, 400), price, String(d.id || ""), s.id).run();
      return J({ ok: !!r.meta.changes });
    }

    if (p === "/api/seller/media" && m === "PUT") {
      const kind = url.searchParams.get("kind"), ct = req.headers.get("content-type") || "", len = +req.headers.get("content-length") || 0;
      if (!/^image\/(jpeg|png|webp)$/.test(ct) || !len || len > 2e6) return J({ ok: false, error: "Image must be JPG, PNG or WebP under 2 MB" }, 400);
      const key = `m/${s.id}/${rid(8)}`, meta = { httpMetadata: { contentType: ct } };
      if (kind === "cover") {
        const pid = url.searchParams.get("pid") || "";
        if (!(await first(env, "SELECT 1 x FROM products WHERE id=? AND store_id=?", pid, s.id))) return J({ ok: false }, 403);
        await env.FILES.put(key, req.body, meta);
        await env.DB.prepare("UPDATE products SET cover_key=? WHERE id=?").bind(key, pid).run();
      } else if (kind === "logo" || kind === "banner") {
        await env.FILES.put(key, req.body, meta);
        await env.DB.prepare(kind === "logo" ? "UPDATE stores SET logo_key=? WHERE id=?" : "UPDATE stores SET banner_key=? WHERE id=?").bind(key, s.id).run();
      } else return J({ ok: false }, 400);
      return J({ ok: true, key });
    }

    if (p === "/api/seller/upload" && m === "PUT") {
      const pid = url.searchParams.get("pid") || "";
      if (!(await first(env, "SELECT 1 x FROM products WHERE id=? AND store_id=?", pid, s.id))) return J({ ok: false }, 403);
      const len = +req.headers.get("content-length") || 0;
      if (!len || len > 25e6) return J({ ok: false, error: "File must be under 25 MB" }, 413);
      const name = clean(url.searchParams.get("name") || "file", 80).replace(/[^\w.\- ]/g, "_");
      if (!FILE_OK.test(name)) return J({ ok: false, error: "File type not allowed (use PDF, ZIP, Office, image, audio, video or text)" }, 400);
      const key = `p/${pid}/${rid(6)}`;
      await env.FILES.put(key, req.body, { httpMetadata: { contentType: req.headers.get("content-type") || "application/octet-stream" } });
      await env.DB.prepare("UPDATE products SET r2_key=?,file_name=?,status='live' WHERE id=?").bind(key, name, pid).run();
      return J({ ok: true });
    }

    if (p === "/api/seller/payout" && m === "POST") {
      const d = await req.json().catch(() => ({})), amt = Math.floor(+d.amount || 0);
      if (amt < 500 || !METHODS.includes(d.method) || !/^01\d{9}$/.test(String(d.number || ""))) return J({ ok: false, error: "Check the method, number and amount (minimum 500)" }, 400);
      const st = await stats(env, s);
      if (amt > st.balance) return J({ ok: false, error: "Amount is above your balance" }, 400);
      // One pending payout per store; the conditional insert also closes the double-submit race.
      const r = await env.DB.prepare("INSERT INTO payouts(id,store_id,amount_bdt,created_at,status) SELECT ?,?,?,?,'pending' WHERE NOT EXISTS(SELECT 1 FROM payouts WHERE store_id=? AND status='pending')").bind(rid(6), s.id, amt, Date.now(), s.id).run();
      if (!r.meta.changes) return J({ ok: false, error: "You already have a payout waiting for approval" }, 409);
      await env.DB.prepare("UPDATE stores SET payout_method=?,payout_number=? WHERE id=?").bind(d.method, d.number, s.id).run();
      return J({ ok: true });
    }
    return J({ ok: false }, 404);
  }

  // ---------- admin (Bearer ADMIN_API_KEY) ----------
  if (p.startsWith("/api/admin/market/")) {
    if (await limited(env, req, "adm", 60)) return J({ ok: false, error: "Too many requests" }, 429);
    if (!isAdmin(req, env)) return J({ ok: false }, 401);
    if (p === "/api/admin/market/health" && m === "GET") return J(await health(env));
    if (p === "/api/admin/market/orders" && m === "GET")
      return J({ ok: true, orders: await rows(env, "SELECT id,item,method,amount,trx,name,email,phone,created_at,proof_key IS NOT NULL has_proof FROM orders WHERE status='pending' AND item LIKE 'x%' ORDER BY created_at DESC LIMIT 100") });
    if (p === "/api/admin/market/proof" && m === "GET") {
      const o = await first(env, "SELECT proof_key FROM orders WHERE id=?", url.searchParams.get("id") || ""), f = o && o.proof_key && (await env.FILES.get(o.proof_key));
      return f ? new Response(f.body, { headers: { "Content-Type": f.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "no-store" } }) : J({ ok: false }, 404);
    }
    if (p === "/api/admin/market/order" && m === "POST") {
      const d = await req.json().catch(() => ({})), id = String(d.id || "");
      if (d.action === "approve") return J({ ok: await approveMarketOrder(env, h.ctx, id) });
      if (d.action === "reject") return J({ ok: !!(await env.DB.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status='pending' AND item LIKE 'x%'").bind(id).run()).meta.changes });
      return J({ ok: false }, 400);
    }
    if (p === "/api/admin/market/payouts" && m === "GET")
      return J({ ok: true, payouts: await rows(env, "SELECT y.id,y.amount_bdt,y.created_at,s.slug,s.payout_method,s.payout_number FROM payouts y JOIN stores s ON s.id=y.store_id WHERE y.status='pending' ORDER BY y.created_at") });
    if (p === "/api/admin/market/payout" && m === "POST") {
      const d = await req.json().catch(() => ({})), st = d.action === "paid" ? "paid" : d.action === "reject" ? "rejected" : null;
      if (!st) return J({ ok: false }, 400);
      return J({ ok: !!(await env.DB.prepare("UPDATE payouts SET status=?,paid_at=? WHERE id=? AND status='pending'").bind(st, Date.now(), String(d.id || "")).run()).meta.changes });
    }
    if (p === "/api/admin/market/stats" && m === "GET") {
      const ok = "status='approved'";
      const t = await first(env, `SELECT COUNT(*) n,COALESCE(SUM(CASE WHEN currency='USD' THEN amount*120 ELSE amount END),0) v FROM orders WHERE ${ok}`);
      const days = await rows(env, `SELECT date((approved_at+21600000)/1000,'unixepoch') day,COUNT(*) n,SUM(CASE WHEN currency='USD' THEN amount*120 ELSE amount END) v FROM orders WHERE ${ok} GROUP BY day ORDER BY day DESC LIMIT 30`);
      const pend = await first(env, "SELECT COUNT(*) n FROM orders WHERE status IN('pending','awaiting_card')");
      return J({ ok: true, orders: t.n, total: t.v, days, pending: pend.n });
    }
    return J({ ok: false }, 404);
  }

  return null;
}

// ---------- mirror of the legacy catalogue orders into D1 (never blocks the request) ----------
async function mirrorNew(env, body, r) {
  try {
    const c = body.customer || {};
    await env.DB.prepare("INSERT OR IGNORE INTO orders(id,okey,item,method,currency,amount,trx,name,email,phone,status,created_at,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,0)")
      .bind(String(r.id), String(r.key || ""), String(body.item || ""), String(body.method || ""), body.currency === "USD" ? "USD" : "BDT", Number(r.amount) || 0, String(body.trx || ""), clean(c.name, 80), clean(c.email, 120).toLowerCase(), clean(c.phone, 20), Date.now()).run();
  } catch (e) { console.log("mirrorNew", String(e && e.message)); }
}
async function mirrorStatus(env, id, status) {
  try {
    if (status === "approved" || status === "rejected")
      await env.DB.prepare("UPDATE orders SET status=?,approved_at=CASE WHEN ?='approved' AND approved_at=0 THEN ? ELSE approved_at END WHERE id=? AND status!=?").bind(status, status, Date.now(), id, status).run();
  } catch (e) { console.log("mirrorStatus", String(e && e.message)); }
}

// ---------- deployment self-check (admin only): shows exactly what is still missing ----------
async function health(env) {
  const out = { ok: true, problems: [] }, bad = (t) => { out.ok = false; out.problems.push(t); };
  try { out.tables = {}; for (const t of ["users", "stores", "products", "orders", "reviews", "payouts", "views"]) out.tables[t] = (await first(env, `SELECT COUNT(*) n FROM ${t}`)).n; } catch (e) { bad("D1 tables missing: run schema.sql in the D1 Console (" + String(e.message).slice(0, 80) + ")"); }
  try { await first(env, "SELECT banner_key,cover_key,proof_key FROM stores s, products p, orders o LIMIT 1"); } catch (e) { bad("D1 is missing columns banner_key/cover_key/proof_key: use the new schema.sql or run the ALTER lines"); }
  try { await env.FILES.list({ limit: 1 }); } catch (e) { bad("R2 bucket FILES not reachable"); }
  out.secrets = { RESEND_API_KEY: !!env.RESEND_API_KEY, SESSION_SECRET: !!env.SESSION_SECRET, ADMIN_API_KEY: !!env.ADMIN_API_KEY, bkash_auto: bkashOn(env) };
  for (const k of ["RESEND_API_KEY", "SESSION_SECRET", "ADMIN_API_KEY"]) if (!env[k]) bad("Secret missing: " + k);
  if (!/^[^<>@]*<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$|^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(env.FROM_EMAIL || "") || /re_[A-Za-z0-9_]{16,}/.test(env.FROM_EMAIL || "") || /YOUR-VERIFIED-DOMAIN/i.test(env.FROM_EMAIL || "")) bad("FROM_EMAIL must look like: Taskifyra <orders@your-verified-domain.com> (never an API key, never the placeholder)");
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: "Bearer " + env.RESEND_API_KEY } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) bad("Resend rejected the API key (" + r.status + "). Create a new key and set it as RESEND_API_KEY");
      else {
        out.resend_domains = (j.data || []).map((d) => ({ name: d.name, status: d.status }));
        const dom = String(env.FROM_EMAIL || "").match(/@([^>\s]+)/);
        const hit = dom && (j.data || []).find((d) => d.name === dom[1].toLowerCase());
        if (!hit) bad("FROM_EMAIL domain is not added in Resend");
        else if (hit.status !== "verified") bad(`Resend domain ${hit.name} is "${hit.status}": finish the DNS records`);
      }
    } catch (e) { bad("Could not reach Resend"); }
  }
  return out;
}

return { J, esc, routes, bkashRoutes, mirrorNew, mirrorStatus };
})();

// ======================================= SECTION 3: ENTRY POINT =======================================
// Order of handling:
//   1. block sensitive paths   2. private pages (/seller, /mk-admin)   3. sitemap   4. /s/<store> pages
//   5. marketplace + bKash APIs (D1 + R2)   6. everything else -> Legacy core (login, catalogue orders, admin, AI, static files)
const { J, esc, routes, bkashRoutes, mirrorNew, mirrorStatus } = Market;

const SEC = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const secure = (r) => {
  if (r.status === 101) return r;
  const n = new Response(r.body, r);
  for (const k in SEC) if (!n.headers.has(k)) n.headers.set(k, SEC[k]);
  return n;
};
const BLOCKED = /(^\/(_worker|_routes|src|migrations|node_modules|\.git|\.github|wrangler|schema|package)|\.(sql|toml|zip|map|env|vars|lock|lockb)$)/i;

async function asset(env, url, path) {
  let r = await env.ASSETS.fetch(new Request(new URL(path, url), { redirect: "manual" }));
  if (r.status >= 300 && r.status < 400 && r.headers.get("Location")) r = await env.ASSETS.fetch(new Request(new URL(r.headers.get("Location"), url)));
  return r;
}

const PAGES = new Map([["/seller", "/seller"], ["/mk-admin", "/mk-admin"]]); // private tool pages (noindex, not linked anywhere)

async function sitemap(env, url) {
  const origin = env.SITE_URL || url.origin;
  let urls = [`<url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`];
  try {
    const r = await env.DB.prepare("SELECT s.slug,s.created_at FROM stores s WHERE s.status='live' AND EXISTS(SELECT 1 FROM products p WHERE p.store_id=s.id AND p.status='live') ORDER BY s.created_at DESC LIMIT 500").all();
    urls = urls.concat(r.results.map((x) => `<url><loc>${origin}/s/${esc(x.slug)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`));
  } catch (e) { console.log("sitemap", String(e && e.message)); }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
}

// /s/<slug>: serve public/store.html with per-store title/description (good for sharing and SEO).
async function storePage(env, url, slug) {
  const page = await asset(env, url, "/store");
  if (!env.DB) return page;
  const s = await env.DB.prepare("SELECT name,bio FROM stores WHERE slug=? AND status='live'").bind(slug).first();
  if (!s) return new Response(page.body, { status: 404, headers: page.headers });
  const title = `${s.name || slug} — Taskifyra`, desc = s.bio || "Digital products on Taskifyra";
  return new HTMLRewriter()
    .on("title", { element: (e) => e.setInnerContent(title) })
    .on('meta[name="description"]', { element: (e) => e.setAttribute("content", desc) })
    .on('meta[property="og:title"]', { element: (e) => e.setAttribute("content", title) })
    .on('meta[property="og:description"]', { element: (e) => e.setAttribute("content", desc) })
    .transform(page);
}

export default {
  // Cron (see wrangler.toml, every 10 minutes):
  //  1. runs the legacy deadline reminders
  //  2. copies approve/reject decisions made in the legacy admin / Telegram into D1, even if the buyer never reopens the page.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Legacy.scheduled(event, env, ctx));
    if (!env.DB) return;
    const base = env.SITE_URL || "https://taskifyra.pages.dev";
    const rows = (await env.DB.prepare("SELECT id,okey FROM orders WHERE status='pending' AND item NOT LIKE 'x%' AND okey!='' AND created_at>? ORDER BY created_at DESC LIMIT 40").bind(Date.now() - 30 * 864e5).all()).results;
    for (const o of rows) {
      try {
        const r = await Legacy.fetch(new Request(`${base}/api/order?id=${encodeURIComponent(o.id)}&key=${encodeURIComponent(o.okey)}`), env, ctx);
        const j = r.ok ? await r.json() : null;
        if (j && j.status) await mirrorStatus(env, o.id, j.status);
      } catch (e) { console.log("cron sync", String(e && e.message)); }
    }
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (BLOCKED.test(p)) return secure(new Response("Not found", { status: 404 }));

      if (PAGES.has(p)) {
        const r = new Response((await asset(env, url, PAGES.get(p))).body, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
        return secure(r);
      }
      if (p === "/sitemap.xml" && env.DB) return secure(await sitemap(env, url));
      if (/^\/api\/stripe/i.test(p)) return secure(J({ ok: false, error: "Card payments are not available. Please use bKash, Nagad or Rocket." }, 410));

      const sm = p.match(/^\/s\/([a-z0-9-]{3,30})$/i);
      if (sm && (req.method === "GET" || req.method === "HEAD")) return secure(await storePage(env, url, sm[1].toLowerCase()));

      // Resolve the logged-in user straight from the legacy session store (KV): one lookup, no internal HTTP call.
      let me;
      const sessUser = async (r) => {
        if (me !== undefined) return me;
        me = null;
        try {
          const a = await Legacy.sessUser(r, env);
          const email = String((a && a.email) || "").trim().toLowerCase();
          if (email) me = { email, name: (a && a.name) || "" };
        } catch (e) { console.log("sessUser", String(e && e.message)); }
        return me;
      };
      const h = { sessUser, ctx };

      if (p === "/api/order" && req.method === "POST") {
        const b = await req.clone().json().catch(() => null);
        if (b && (b.method === "Card" || b.currency === "USD")) return secure(J({ ok: false, error: "Card payments are not available. Please use bKash, Nagad or Rocket." }, 400));
      }

      if (p.startsWith("/api/")) {
        const r = (await bkashRoutes(req, env, url, p, h)) || (await routes(req, env, url, p, h));
        if (r) return secure(r);
      }

      // Legacy core (+ non-blocking D1 mirror of catalogue orders).
      const isOrderPost = p === "/api/order" && req.method === "POST";
      const sent = isOrderPost ? await req.clone().json().catch(() => null) : null;
      const res = await Legacy.fetch(req, env, ctx);
      if (env.DB && res.ok) {
        if (sent && sent.item) ctx.waitUntil(res.clone().json().then((r) => r && r.id && mirrorNew(env, sent, r)).catch(() => {}));
        if (p === "/api/order" && req.method === "GET") ctx.waitUntil(res.clone().json().then((r) => r && r.status && mirrorStatus(env, url.searchParams.get("id") || "", r.status)).catch(() => {}));
      }
      return secure(res);
    } catch (e) {
      console.log("worker error", p, String((e && e.stack) || e));
      return p.startsWith("/api/") ? secure(J({ ok: false, error: "Server error. Please try again." }, 500)) : secure(new Response("Server error", { status: 500 }));
    }
  },
};
