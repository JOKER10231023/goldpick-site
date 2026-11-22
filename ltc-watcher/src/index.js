// Gold Pick LTC watcher — Cloudflare Workers cron.
// Uses BlockCypher Litecoin mainnet API. This is an example integration and
// MUST be validated with a real receiving wallet before live use.
// No secret is exposed to browser. No checkout is enabled by this Worker alone.
const asJSON=(obj,status=200)=>new Response(JSON.stringify(obj),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const trim=s=>String(s||"").replace(/\/$/,"");
async function supa(env,fn,body={}){
 const response=await fetch(trim(env.SUPABASE_URL)+"/rest/v1/rpc/"+fn,{
  method:"POST",headers:{"content-type":"application/json",
   "apikey":env.SUPABASE_SERVICE_ROLE_KEY,
   "authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY},
  body:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error("Supabase "+fn+": "+response.status+" "+
  JSON.stringify(data).slice(0,200));
 return data;
}
async function transactions(address,env){
 if(!/^[a-zA-Z0-9]{26,110}$/.test(address))throw Error("Invalid LTC address");
 const base=trim(env.LTC_EXPLORER_URL||"https://api.blockcypher.com/v1/ltc/main");
 const u=new URL(base+"/addrs/"+encodeURIComponent(address)+"/full");
 u.searchParams.set("limit","50");
 if(env.BLOCKCYPHER_TOKEN)u.searchParams.set("token",env.BLOCKCYPHER_TOKEN);
 const res=await fetch(u,{headers:{"accept":"application/json"}});
 if(!res.ok)throw Error("Explorer HTTP "+res.status);
 const json=await res.json();
 if(!Array.isArray(json.txs))throw Error("Explorer response has no transactions");
 // BlockCypher returns hasMore if >50 transactions. Do not silently
 // assume a complete address history; operator must use pagination.
 if(json.hasMore)throw Error("Address history exceeds page; pagination required");
 return json.txs;
}
function matchTx(order,tx){
 if(!/^[0-9a-f]{64}$/i.test(String(tx.hash||"")))return false;
 if(Number(tx.confirmations||0)<6)return false;
 const created=Date.parse(order.createdAt);
 const txTime=Date.parse(tx.received||tx.confirmed||"");
 if(!Number.isFinite(created)||!Number.isFinite(txTime)||
    txTime<created-120000)return false;
 const expected=Number(order.sats);
 if(!Number.isSafeInteger(expected)||expected<=0)return false;
 // Match a single output rather than summing unrelated outputs.
 return Array.isArray(tx.outputs)&&tx.outputs.some(out=>
  Number(out.value)===expected &&
  Array.isArray(out.addresses)&&out.addresses.includes(order.address)
 );
}
async function check(env){
 if(env.LTC_AUTOPAY_ENABLED!=="true")return {enabled:false};
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)
  throw Error("Missing Supabase service credentials");
 const orders=await supa(env,"gp_ltc_pending_orders");
 if(!Array.isArray(orders))throw Error("Invalid pending orders");
 const byAddress=new Map();
 for(const order of orders){
  if(!byAddress.has(order.address))byAddress.set(order.address,[]);
  byAddress.get(order.address).push(order);
 }
 let checked=0,credited=0,errors=0;
 for(const [address,items] of byAddress){
  let txs;
  try{txs=await transactions(address,env);}
  catch(e){errors++;console.error("LTC address scan failed",String(e));continue;}
  const consumed=new Set();
  for(const order of items){
   checked++;
   // If user supplied a TXID, verify it against the same address and amount.
   const matches=txs.filter(tx=>!consumed.has(tx.hash)&&matchTx(order,tx));
   if(matches.length!==1)continue; // ambiguous / none -> do not pay
   const tx=matches[0];
   try{
    const result=await supa(env,"gp_ltc_finalize",{
     p_order_id:order.id,p_txid:tx.hash,
     p_sats:Number(order.sats),p_confirmations:Number(tx.confirmations)
    });
    if(result?.credited){credited++;consumed.add(tx.hash);}
   }catch(e){errors++;console.error("LTC settlement failed",String(e));}
  }
 }
 return {enabled:true,checked,credited,errors};
}
export default {
 async scheduled(event,env,ctx){
  ctx.waitUntil(check(env).then(r=>console.log("LTC scan",JSON.stringify(r)))
   .catch(e=>console.error("LTC cron",String(e))));
 },
 async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname==="/health"&&request.method==="GET")
   return asJSON({service:"goldpick-ltc-watcher",
    enabled:env.LTC_AUTOPAY_ENABLED==="true",mode:"LTC mainnet",
    note:"Health does not confirm payment processing or provider availability"});
  return asJSON({error:"Not found"},404);
 }
};
