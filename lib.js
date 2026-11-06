// Shared helpers for the TASKIFYRA worker.

export const J = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...h },
  });

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Constant-time string compare.
export const same = (a, b) => {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

// HMAC-SHA256 with SESSION_SECRET (used for 5-minute signed download links).
export async function mac(env, m) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET missing");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(m)));
}

const AL = "abcdefghjkmnpqrstuvwxyz23456789";
export function rid(n = 8) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map((x) => AL[x % AL.length]).join("");
}

// Strip control chars and angle brackets, collapse whitespace, cap length.
export const clean = (s, max = 200) =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Day string in Bangladesh time (UTC+6).
export const dayStr = (t) => new Date(t + 216e5).toISOString().slice(0, 10);

// Tiny per-IP rate limiter on the existing KV namespace (ZV). Returns true when the caller is over the limit.
export async function limited(env, req, name, max, ttl = 60) {
  if (!env.ZV) return false;
  const ip = req.headers.get("CF-Connecting-IP") || "x";
  const k = `rl:${name}:${ip}:${Math.floor(Date.now() / (ttl * 1000))}`;
  const n = +(await env.ZV.get(k)) || 0;
  if (n >= max) return true;
  await env.ZV.put(k, String(n + 1), { expirationTtl: Math.max(60, ttl) });
  return false;
}

// Resend e-mail. Best effort: never throws. Needs the RESEND_API_KEY secret and FROM_EMAIL var.
export async function sendMail(env, to, subject, html) {
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
export async function approveMarketOrder(env, ctx, id, extra = {}) {
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
