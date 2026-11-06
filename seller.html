// Seller stores, marketplace orders, media, payouts, signed downloads, reviews and admin tools.
// Everything here is backed by D1 (env.DB) and R2 (env.FILES).
import { J, same, mac, rid, clean, dayStr, limited, sendMail, esc, approveMarketOrder } from "./lib.js";
import { bkashOn } from "./bkash.js";

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
export async function routes(req, env, url, p, h) {
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
    if (!raw || typeof raw.item !== "string" || raw.item[0] !== "x") return null; // own catalogue -> legacy worker
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
    return J({ ok: true, url: `/api/dl/get?oid=${oid}&pid=${pid}&x=${x}&s=${await mac(env, `${pid}.${oid}.${x}`)}` });
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
      if (["admin", "api", "img", "store", "s", "login", "seller"].includes(slug)) return J({ ok: false, error: "This store name is reserved" }, 400);
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
export async function mirrorNew(env, body, r) {
  try {
    const c = body.customer || {};
    await env.DB.prepare("INSERT OR IGNORE INTO orders(id,okey,item,method,currency,amount,trx,name,email,phone,status,created_at,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,0)")
      .bind(String(r.id), String(r.key || ""), String(body.item || ""), String(body.method || ""), body.currency === "USD" ? "USD" : "BDT", Number(r.amount) || 0, String(body.trx || ""), clean(c.name, 80), clean(c.email, 120).toLowerCase(), clean(c.phone, 20), Date.now()).run();
  } catch (e) { console.log("mirrorNew", String(e && e.message)); }
}
export async function mirrorStatus(env, id, status) {
  try {
    if (status === "approved" || status === "rejected")
      await env.DB.prepare("UPDATE orders SET status=?,approved_at=CASE WHEN ?='approved' AND approved_at=0 THEN ? ELSE approved_at END WHERE id=? AND status!=?").bind(status, status, Date.now(), id, status).run();
  } catch (e) { console.log("mirrorStatus", String(e && e.message)); }
}

// ---------- deployment self-check (admin only): shows exactly what is still missing ----------
async function health(env) {
  const out = { ok: true, problems: [] }, bad = (t) => { out.ok = false; out.problems.push(t); };
  try { out.tables = {}; for (const t of ["users", "stores", "products", "orders", "reviews", "payouts", "views"]) out.tables[t] = (await first(env, `SELECT COUNT(*) n FROM ${t}`)).n; } catch (e) { bad("D1 tables missing: run schema.sql / migration (" + String(e.message).slice(0, 80) + ")"); }
  try { await first(env, "SELECT banner_key,cover_key,proof_key FROM stores s, products p, orders o LIMIT 1"); } catch (e) { bad("D1 is missing columns banner_key/cover_key/proof_key: run migrations/0002_v10.sql"); }
  try { await env.FILES.list({ limit: 1 }); } catch (e) { bad("R2 bucket FILES not reachable"); }
  out.secrets = { RESEND_API_KEY: !!env.RESEND_API_KEY, SESSION_SECRET: !!env.SESSION_SECRET, ADMIN_API_KEY: !!env.ADMIN_API_KEY, bkash_auto: bkashOn(env) };
  for (const k of ["RESEND_API_KEY", "SESSION_SECRET", "ADMIN_API_KEY"]) if (!env[k]) bad("Secret missing: " + k);
  if (!/^[^<>@]*<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$|^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(env.FROM_EMAIL || "") || /re_[A-Za-z0-9_]{16,}/.test(env.FROM_EMAIL || "")) bad("FROM_EMAIL must look like: Taskifyra <orders@your-verified-domain.com> (never an API key)");
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
