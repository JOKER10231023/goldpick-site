/* Gold Pick crypto payment Worker (Cloudflare, no Node dependencies)
 * Secrets: SUPABASE_SERVICE_ROLE_KEY, NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET
 * Config: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SITE_ORIGIN,
 *         VIP_PLANS_JSON, PAY_COINS, PAYMENTS_ENABLED, optionally NOWPAYMENTS_EMAIL/PASSWORD.
 *
 * SECURITY: This Worker is the only creator of orders and VIP credits.
 * Frontend/TXID/webhook text can never directly activate VIP.
 */
const NP = "https://api.nowpayments.io/v1";
let authCache = {token: "", until: 0};

function out(payload, code = 200, origin = "", env = {}) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin"
  });
  if (origin && origin === env.SITE_ORIGIN) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    h.set("Access-Control-Allow-Headers", "authorization,content-type");
    h.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(payload), {status: code, headers: h});
}
const fail = (message, code, origin, env) => out({ok: false, message}, code, origin, env);
const required = env => [
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"
].every(key => typeof env[key] === "string" && env[key].length > 8);
const enabled = env => env.PAYMENTS_ENABLED === "true" &&
  required(env) && !!env.SITE_ORIGIN && readPlans(env).length > 0;
const cryptoAllowed = env => {
  const map = {usdttrc20: "USDT · TRON (TRC20)", ltc: "Litecoin · LTC"};
  return String(env.PAY_COINS || "usdttrc20,ltc").toLowerCase()
    .split(",").map(x => x.trim()).filter(x => !!map[x])
    .filter((x, i, a) => a.indexOf(x) === i)
    .map(id => ({id, label: map[id]}));
};
function readPlans(env) {
  try {
    const src = JSON.parse(env.VIP_PLANS_JSON || "{}");
    return [1,7,30,90,365].filter(days => {
      const price = src[String(days)];
      return typeof price === "number" && Number.isFinite(price) &&
        price >= 1 && price <= 10000 && Number(price.toFixed(2)) === price;
    }).map(days => ({days, usd: src[String(days)]}));
  } catch { return []; }
}
function publicConfig(env) {
  return {
    ok: true, enabled: enabled(env), plans: enabled(env) ? readPlans(env) : [],
    coins: enabled(env) ? cryptoAllowed(env) : [],
    provider: "NOWPayments",
    note: enabled(env) ? "실시간 코인 견적은 결제 요청 시 확정됩니다." :
      "코인 결제 연결 전입니다. 현재 입금이나 VIP 자동 지급을 받지 않습니다."
  };
}
async function supa(path, env, {method = "GET", data, token, service = true, prefer} = {}) {
  const url = env.SUPABASE_URL.replace(/\/$/, "") + path;
  const apiKey = service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_PUBLISHABLE_KEY;
  const headers = {
    "apikey": apiKey,
    "Authorization": "Bearer " + (service ? apiKey : token),
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url, {method, headers, body: data === undefined ? undefined : JSON.stringify(data)});
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error("Database request failed");
    error.status = res.status;
    error.code = body?.code || "";
    throw error;
  }
  return body;
}
async function signedIn(request, env) {
  const raw = request.headers.get("Authorization") || "";
  const match = raw.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  if (!match) return null;
  const userUrl = env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user";
  const res = await fetch(userUrl, {
    headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: raw},
    cache: "no-store"
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? {id: user.id, jwt: match[1]} : null;
}
async function npToken(env) {
  if (authCache.token && Date.now() < authCache.until) return authCache.token;
  if (!env.NOWPAYMENTS_EMAIL || !env.NOWPAYMENTS_PASSWORD) return "";
  const res = await fetch(NP + "/auth", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({email: env.NOWPAYMENTS_EMAIL, password: env.NOWPAYMENTS_PASSWORD})
  });
  if (!res.ok) return "";
  const data = await res.json().catch(() => null);
  if (!data?.token) return "";
  authCache = {token: data.token, until: Date.now() + 4 * 60 * 1000};
  return data.token;
}
async function npCall(path, env, {method = "GET", body} = {}) {
  const headers = {"x-api-key": env.NOWPAYMENTS_API_KEY, "Content-Type": "application/json"};
  const go = async (authorization = "") => {
    const h = {...headers};
    if (authorization) h.Authorization = "Bearer " + authorization;
    return fetch(NP + path, {method, headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)});
  };
  let res = await go();
  if (res.status === 401) {
    const jwt = await npToken(env);
    if (jwt) res = await go(jwt);
  }
  const result = await res.json().catch(() => null);
  if (!res.ok || !result) {
    const error = new Error("Provider request failed");
    error.status = res.status;
    throw error;
  }
  return result;
}
async function readOrder(id, userId, env) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const query = "/rest/v1/goldpick_crypto_orders?select=*&id=eq." +
    encodeURIComponent(id) + "&user_id=eq." + encodeURIComponent(userId) + "&limit=1";
  const rows = await supa(query, env);
  return rows[0] || null;
}
async function readOrderByPayment(paymentId, env) {
  const rows = await supa("/rest/v1/goldpick_crypto_orders?select=*&provider_payment_id=eq." +
    encodeURIComponent(String(paymentId)) + "&limit=1",env);
  return rows[0] || null;
}
async function patchOrder(orderId, fields, env) {
  return supa("/rest/v1/goldpick_crypto_orders?id=eq." + encodeURIComponent(orderId),
    env, {method: "PATCH", data: {...fields,updated_at:new Date().toISOString()},
      prefer: "return=minimal"});
}
function sanitize(order) {
  return {
    id: order.id, days: order.plan_days, priceUsd: Number(order.price_usd),
    coin: order.pay_currency, amount: order.pay_amount === null ? null : String(order.pay_amount),
    address: order.pay_address || "", memo: order.pay_extra_id || "",
    status: order.provider_status, submittedTxid: order.submitted_txid || "",
    payinHash: order.payin_hash || "", paid: !!order.fulfilled_at,
    createdAt: order.created_at, expiresAt: order.expires_at
  };
}
function providerState(v) {
  const allowed = ["waiting","confirming","confirmed","sending",
    "finished","failed","expired","partially_paid","refunded"];
  const key = String(v || "").toLowerCase();
  return allowed.includes(key) ? key : "verifying";
}
function decimal(input) {
  if (typeof input !== "number" && typeof input !== "string") return null;
  const v = String(input);
  return /^(?:0|[1-9]\d*)(?:\.\d{1,14})?$/.test(v) && Number(v) > 0
    ? v : null;
}
async function reconcile(order, env) {
  if (!order?.provider_payment_id || order.fulfilled_at) return order;
  const paymentId = String(order.provider_payment_id);
  const p = await npCall("/payment/" + encodeURIComponent(paymentId), env);
  const status = providerState(p.payment_status);
  const sameId = String(p.payment_id) === paymentId;
  const sameOrder = String(p.order_id || "") === String(order.id);
  const sameCoin = String(p.pay_currency || "").toLowerCase() ===
    String(order.pay_currency).toLowerCase();
  const sameAddress = !!order.pay_address && String(p.pay_address || "") === order.pay_address;
  const sameAmount = decimal(p.pay_amount) !== null &&
    Number(p.pay_amount) === Number(order.pay_amount);
  if (!sameId || !sameOrder || !sameCoin || !sameAddress || !sameAmount) {
    await patchOrder(order.id, {
      provider_status: "needs_review", last_checked_at: new Date().toISOString()
    }, env);
    return {...order,provider_status: "needs_review"};
  }
  const actual = decimal(p.actually_paid);
  const payinHash = typeof p.payin_hash === "string" ? p.payin_hash.trim() : "";
  if (status === "finished") {
    if (!actual || Number(actual) < Number(order.pay_amount)) {
      await patchOrder(order.id, {
        provider_status: "needs_review",
        payin_hash: payinHash || order.payin_hash,
        last_checked_at: new Date().toISOString()
      }, env);
      return {...order,provider_status: "needs_review"};
    }
    const done = await supa("/rest/v1/rpc/goldpick_finalize_crypto_order",env,{
      method:"POST",data: {
        p_order_id: order.id, p_payment_id: paymentId,
        p_currency: p.pay_currency, p_pay_address: p.pay_address,
        p_pay_amount: p.pay_amount, p_actually_paid: p.actually_paid,
        p_payin_hash: payinHash || null
      }
    });
    if (done?.ok === true) {
      return {...order,provider_status:"finished",fulfilled_at:new Date().toISOString(),
        payin_hash:payinHash || order.payin_hash};
    }
    await patchOrder(order.id, {provider_status:"needs_review",
      last_checked_at: new Date().toISOString()}, env);
    return {...order,provider_status:"needs_review"};
  }
  await patchOrder(order.id, {
    provider_status:status, payin_hash: payinHash || order.payin_hash,
    last_checked_at: new Date().toISOString()
  },env);
  return {...order,provider_status:status,payin_hash:payinHash || order.payin_hash};
}
async function createOrder(request, user, env, origin) {
  if (!enabled(env)) return fail("코인 결제는 아직 준비 중입니다.",503,origin,env);
  const input = await request.json().catch(() => ({}));
  const days = Number(input.days);
  const coin = String(input.coin || "").toLowerCase();
  const plan = readPlans(env).find(p => p.days === days);
  if (!plan || !cryptoAllowed(env).some(c => c.id === coin)) {
    return fail("유효하지 않은 이용권 또는 네트워크입니다.",400,origin,env);
  }
  // Soft anti-abuse limit. Do not rely on it for high-volume merchant deployment.
  const time = new Date(Date.now()-60000).toISOString();
  const rows = await supa("/rest/v1/goldpick_crypto_orders?select=id&user_id=eq." +
    encodeURIComponent(user.id) + "&created_at=gte." +
    encodeURIComponent(time) + "&limit=1",env);
  if (rows.length) return fail("새 결제 요청은 1분 간격으로 생성할 수 있습니다.",429,origin,env);
  const inserted = await supa("/rest/v1/goldpick_crypto_orders",env,{
    method:"POST",data:{user_id:user.id,plan_days:days,price_usd:plan.usd,
      pay_currency:coin,provider_status:"creating"},
    prefer:"return=representation"
  });
  const order = inserted[0];
  if (!order) return fail("주문을 생성하지 못했습니다.",500,origin,env);
  try {
    const callback = new URL(request.url).origin + "/v1/webhooks/nowpayments";
    const p = await npCall("/payment",env,{method:"POST",body:{
      price_amount: plan.usd,price_currency:"usd",pay_currency:coin,
      order_id:order.id,order_description:"Gold Pick VIP "+days+" days",
      ipn_callback_url:callback
    }});
    if (!p.payment_id || !p.pay_address || !decimal(p.pay_amount) ||
      String(p.pay_currency || "").toLowerCase() !== coin) {
      throw new Error("Invalid provider payment quote");
    }
    await patchOrder(order.id, {
      provider_payment_id:String(p.payment_id),pay_address:String(p.pay_address),
      pay_amount:p.pay_amount,pay_extra_id: String(p.payin_extra_id || p.pay_extra_id || ""),
      provider_status:"waiting",
      expires_at: p.expiration_estimate_date || order.expires_at
    },env);
    const fresh = await readOrder(order.id,user.id,env);
    return out({ok:true,order:sanitize(fresh)},201,origin,env);
  } catch (error) {
    await patchOrder(order.id,{provider_status:"failed"},env).catch(()=>{});
    return fail("결제 주소 발급에 실패했습니다. 코인별 최소 금액과 결제 서비스 설정을 확인해 주세요.",502,origin,env);
  }
}
async function getOrders(user,env,origin) {
  const rows = await supa("/rest/v1/goldpick_crypto_orders?select=*&user_id=eq."+
    encodeURIComponent(user.id)+"&order=created_at.desc&limit=15",env);
  return out({ok:true,orders:rows.map(sanitize)},200,origin,env);
}
async function getOne(orderId,user,env,origin) {
  let order = await readOrder(orderId,user.id,env);
  if (!order) return fail("내 결제 요청을 찾지 못했습니다.",404,origin,env);
  const canCheck = !!order.provider_payment_id && !order.fulfilled_at &&
    Date.now()-new Date(order.last_checked_at || 0).getTime()>30000 &&
    !["failed","refunded"].includes(order.provider_status);
  if (canCheck) {
    try { await reconcile(order,env); } catch { /* retain old state */ }
    order = await readOrder(orderId,user.id,env) || order;
  }
  return out({ok:true,order:sanitize(order)},200,origin,env);
}
async function submitTxid(request,orderId,user,env,origin) {
  const order = await readOrder(orderId,user.id,env);
  if (!order) return fail("내 결제 요청을 찾을 수 없습니다.",404,origin,env);
  const input = await request.json().catch(()=>({}));
  const txid = String(input.txid || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(txid)) {
    return fail("TXID는 64자리 영숫자 해시여야 합니다.",400,origin,env);
  }
  const result = await supa("/rest/v1/rpc/goldpick_submit_payment_txid",env,{
    method:"POST",service:false,token:user.jwt,data:{p_order_id:order.id,p_txid:txid}
  });
  if (!result?.ok) return fail(result?.message || "TXID를 접수하지 못했습니다.",400,origin,env);
  try { await reconcile(order,env); } catch { /* status may require manual review */ }
  const fresh = await readOrder(orderId,user.id,env);
  return out({ok:true,message: result.message,
    order:sanitize(fresh || order)},200,origin,env);
}
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortObject(value[key]);
    return out;
  }
  return value;
}
async function verifyIpn(body,signature,secret) {
  if (!/^[0-9a-f]{128}$/i.test(signature||"") || !secret) return false;
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-512"},false,["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC",key,
    new TextEncoder().encode(JSON.stringify(sortObject(body)))));
  const actual = Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  const expected = signature.toLowerCase();
  let diff = 0;
  for (let i=0;i<actual.length;i++) diff |= actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
async function webhook(request,env) {
  if (!required(env)) return out({ok:false},503);
  const signature = request.headers.get("x-nowpayments-sig") || "";
  const raw = await request.text();
  if (raw.length > 20000) return out({ok:false},413);
  const body = JSON.parse(raw);
  if (!await verifyIpn(body,signature,env.NOWPAYMENTS_IPN_SECRET)) {
    return out({ok:false},401);
  }
  const paymentId = String(body.payment_id || "");
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(paymentId)) return out({ok:false},400);
  const order = await readOrderByPayment(paymentId,env);
  if (!order) return out({ok:false},404); // provider will retry
  if (!order.fulfilled_at) await reconcile(order,env);
  return out({ok:true},200);
}
async function pollPending(env) {
  if (!enabled(env)) return;
  const rows = await supa(
    "/rest/v1/goldpick_crypto_orders?select=*&fulfilled_at=is.null"+
    "&provider_payment_id=not.is.null"+
    "&provider_status=not.in.(failed,refunded)"+
    "&order=last_checked_at.asc.nullsfirst&limit=40",env);
  for (const order of rows) {
    if (order.last_checked_at &&
        Date.now()-new Date(order.last_checked_at).getTime()<90000) continue;
    try { await reconcile(order,env); } catch { /* cron retries later */ }
  }
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return out({ok:true},204,origin,env);
    }
    const url = new URL(request.url);
    if (origin && origin !== env.SITE_ORIGIN && url.pathname !== "/v1/webhooks/nowpayments") {
      return fail("허용되지 않은 사이트입니다.",403,origin,env);
    }
    try {
      if (request.method === "GET" && url.pathname === "/v1/config") {
        return out(publicConfig(env),200,origin,env);
      }
      if (request.method === "POST" && url.pathname === "/v1/webhooks/nowpayments") {
        return await webhook(request,env);
      }
      if (!required(env)) return fail("결제 서버 설정이 필요합니다.",503,origin,env);
      const user = await signedIn(request,env);
      if (!user) return fail("로그인이 필요합니다.",401,origin,env);
      if (request.method === "GET" && url.pathname === "/v1/orders") {
        return await getOrders(user,env,origin);
      }
      if (request.method === "POST" && url.pathname === "/v1/orders") {
        return await createOrder(request,user,env,origin);
      }
      const match = url.pathname.match(/^\/v1\/orders\/([a-f0-9-]{36})(?:\/(txid))?$/i);
      if (match) {
        if (request.method === "GET" && !match[2])
          return await getOne(match[1],user,env,origin);
        if (request.method === "POST" && match[2] === "txid")
          return await submitTxid(request,match[1],user,env,origin);
      }
      return fail("페이지를 찾을 수 없습니다.",404,origin,env);
    } catch {
      return fail("결제 처리 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",500,origin,env);
    }
  },
  async scheduled(event,env,ctx) {
    ctx.waitUntil(pollPending(env));
  }
};
