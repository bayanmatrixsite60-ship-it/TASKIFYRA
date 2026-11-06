// TASKIFYRA — main Worker entry.
// Order of handling:
//   1. block sensitive paths   2. /s/<store> pages   3. seller / store / media / download / bKash APIs (D1 + R2)
//   4. everything else (login, catalogue orders, admin, AI, static files) -> src/legacy.js, the previous worker,
//      with catalogue orders mirrored into D1.
import legacy from "./src/legacy.js";
import { routes, mirrorNew, mirrorStatus } from "./src/seller.js";
import { bkashRoutes } from "./src/bkash.js";
import { J, esc } from "./src/lib.js";

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
const BLOCKED = /(^\/(_worker|src|migrations|node_modules|\.git|\.github|wrangler)|\.(sql|toml|zip|map|env|vars)$)/i;

async function asset(env, url, path) {
  let r = await env.ASSETS.fetch(new Request(new URL(path, url), { redirect: "manual" }));
  if (r.status >= 300 && r.status < 400 && r.headers.get("Location")) r = await env.ASSETS.fetch(new Request(new URL(r.headers.get("Location"), url)));
  return r;
}

const PAGES = { "/seller": "/seller", "/mk-admin": "/mk-admin" }; // private tool pages (noindex, not linked anywhere)

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
  // Cron (see wrangler.toml): copies approve/reject decisions made in the legacy admin into D1 even if the buyer never reopens the page.
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    const base = env.SITE_URL || "https://taskifyra.pages.dev";
    const rows = (await env.DB.prepare("SELECT id,okey FROM orders WHERE status='pending' AND item NOT LIKE 'x%' AND okey!='' AND created_at>? ORDER BY created_at DESC LIMIT 40").bind(Date.now() - 30 * 864e5).all()).results;
    for (const o of rows) {
      try {
        const r = await legacy.fetch(new Request(`${base}/api/order?id=${encodeURIComponent(o.id)}&key=${encodeURIComponent(o.okey)}`), env, ctx);
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

      if (PAGES[p]) {
        const r = new Response((await asset(env, url, PAGES[p])).body, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
        return secure(r);
      }
      if (p === "/sitemap.xml" && env.DB) return secure(await sitemap(env, url));
      if (/^\/api\/stripe/i.test(p)) return secure(J({ ok: false, error: "Card payments are not available. Please use bKash, Nagad or Rocket." }, 410));

      const sm = p.match(/^\/s\/([a-z0-9-]{3,30})$/i);
      if (sm && (req.method === "GET" || req.method === "HEAD")) return secure(await storePage(env, url, sm[1].toLowerCase()));

      // Resolve the logged-in user through the legacy worker's own session system (GET /api/me -> { user:{email,name} }).
      let me;
      const sessUser = async (r) => {
        if (me !== undefined) return me;
        me = null;
        const a = r.headers.get("Authorization");
        if (!a) return me;
        try {
          const res = await legacy.fetch(new Request(new URL("/api/me", r.url), { headers: { Authorization: a } }), env, ctx);
          const j = res.ok ? await res.json() : null;
          const u = j && (j.user || j), email = String((u && u.email) || "").trim().toLowerCase();
          if (email) me = { email, name: (u && u.name) || "" };
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

      // Legacy worker (+ non-blocking D1 mirror of catalogue orders).
      const isOrderPost = p === "/api/order" && req.method === "POST";
      const sent = isOrderPost ? await req.clone().json().catch(() => null) : null;
      const res = await legacy.fetch(req, env, ctx);
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
