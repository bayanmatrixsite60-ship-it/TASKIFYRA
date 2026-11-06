// bKash Tokenized Checkout for marketplace orders (optional: active only when all secrets are set).
// Sandbox BKASH_BASE: https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/
// Live BKASH_BASE:    https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/
import { J, same, approveMarketOrder } from "./lib.js";

export const bkashOn = (env) => !!(env.BKASH_BASE && env.BKASH_USER && env.BKASH_PASS && env.BKASH_APP_KEY && env.BKASH_APP_SECRET);

async function call(env, path, body, tok) {
  const r = await fetch(env.BKASH_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(tok ? { Authorization: tok, "X-APP-Key": env.BKASH_APP_KEY } : { username: env.BKASH_USER, password: env.BKASH_PASS }) },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function grant(env) {
  const r = await call(env, "token/grant", { app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET });
  if (!r.id_token) throw new Error("bKash auth failed");
  return r.id_token;
}

export async function bkashRoutes(req, env, url, p, h) {
  if (!env.DB || !p.startsWith("/api/bkash/")) return null;
  if (!bkashOn(env)) return J({ ok: false, error: "bKash automatic payment is not enabled" }, 404);
  const origin = env.SITE_URL || url.origin;

  // POST {oid,key} -> {url} : send the buyer to bKash.
  if (p === "/api/bkash/start" && req.method === "POST") {
    const d = await req.json().catch(() => ({}));
    const o = await env.DB.prepare("SELECT id,okey,amount,phone,status FROM orders WHERE id=? AND method='bKash' AND item LIKE 'x%'").bind(String(d.oid || "")).first();
    if (!o || o.status !== "pending" || !same(o.okey || "", String(d.key || ""))) return J({ ok: false }, 403);
    const r = await call(env, "create", { mode: "0011", payerReference: o.phone, callbackURL: `${origin}/api/bkash/cb?oid=${o.id}`, amount: Number(o.amount).toFixed(2), currency: "BDT", intent: "sale", merchantInvoiceNumber: o.id }, await grant(env));
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
        const r = await call(env, "execute", { paymentID: pid }, await grant(env));
        if (r.transactionStatus === "Completed" && Number(r.amount) === Number(o.amount) && r.merchantInvoiceNumber === o.id)
          ok = await approveMarketOrder(env, h.ctx, o.id, { trx: r.trxID });
      } catch (e) { console.log("bkash cb", String(e && e.message)); }
    }
    return Response.redirect(`${origin}/s/${o.slug}?o=${o.id}.${o.okey}${ok ? "" : "&pay=failed"}`, 302);
  }
  return J({ ok: false }, 404);
        }
