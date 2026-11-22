// Railway LTC payment watcher. Disabled by default until verified.
const KRW_PRICES={1:1900,7:9900,30:29900,90:69900,365:149000};
const required=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
const base=(process.env.LTC_EXPLORER_URL||"https://api.blockcypher.com/v1/ltc/main").replace(/\/$/,"");
const delay=Number(process.env.POLL_INTERVAL_MS||120000);
async function rpc(fn,payload={}){
 const url=process.env.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/rpc/"+fn;
 const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","apikey":process.env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY},body:JSON.stringify(payload)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(fn+" HTTP "+res.status+" "+JSON.stringify(data).slice(0,200));
 return data;
}

let lastPriceRefresh=0;
async function refreshLtcPrices(){
 const now=Date.now();
 if(now-lastPriceRefresh<600000)return;
 const url=process.env.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/";
 const headers={"apikey":process.env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY};
 const walletRes=await fetch(url+"gp_direct_wallets?select=coin,network&coin=eq.ltc&network=eq.litecoin",{headers});
 if(!walletRes.ok)throw Error("Wallet lookup HTTP "+walletRes.status);
 const wallets=await walletRes.json();
 if(!wallets.length){console.log("LTC wallet not configured yet; waiting");return;}
 const quoteRes=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=krw",{headers:{"accept":"application/json"}});
 if(!quoteRes.ok)throw Error("LTC KRW rate HTTP "+quoteRes.status);
 const quote=await quoteRes.json();
 const rate=Number(quote?.litecoin?.krw);
 if(!Number.isFinite(rate)||rate<1000||rate>10000000)throw Error("Invalid LTC/KRW quote");
 const rows=Object.entries(KRW_PRICES).map(([days,krw])=>({
  coin:"ltc",network:"litecoin",days:Number(days),
  amount:(Math.ceil(krw/rate*1e8)/1e8).toFixed(8)
 }));
 const res=await fetch(url+"gp_direct_prices?on_conflict=coin,network,days",{
  method:"POST",headers:{...headers,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},
  body:JSON.stringify(rows)
 });
 if(!res.ok)throw Error("Price update HTTP "+res.status+" "+(await res.text()).slice(0,200));
 lastPriceRefresh=now;
 console.log("LTC KRW prices refreshed",JSON.stringify({rate,prices:KRW_PRICES}));
}

async function transactions(address){
 if(!/^[A-Za-z0-9]{26,110}$/.test(address))throw Error("Invalid address");
 const u=new URL(base+"/addrs/"+encodeURIComponent(address)+"/full");
 u.searchParams.set("limit","50");
 if(process.env.BLOCKCYPHER_TOKEN)u.searchParams.set("token",process.env.BLOCKCYPHER_TOKEN);
 const r=await fetch(u,{headers:{accept:"application/json"}});
 if(!r.ok)throw Error("Explorer HTTP "+r.status);
 const d=await r.json();
 if(!Array.isArray(d.txs)||d.hasMore)throw Error("Incomplete transaction page");
 return d.txs;
}
function match(o,t){
 const created=Date.parse(o.createdAt),received=Date.parse(t.received||t.confirmed||"");
 if(!Number.isFinite(created)||!Number.isFinite(received)||received<created-120000)return false;
 if(!/^[a-f0-9]{64}$/i.test(String(t.hash||""))||Number(t.confirmations||0)<6)return false;
 const sats=Number(o.sats);
 return Number.isSafeInteger(sats)&&sats>0&&Array.isArray(t.outputs)&&
  t.outputs.some(x=>Number(x.value)===sats&&Array.isArray(x.addresses)&&x.addresses.includes(o.address));
}
async function scan(){
 const orders=await rpc("gp_ltc_pending_orders");
 if(!Array.isArray(orders))throw Error("Invalid pending orders");
 const groups=new Map();
 for(const o of orders){if(!groups.has(o.address))groups.set(o.address,[]);groups.get(o.address).push(o);}
 let credited=0,checked=0,errors=0;
 for(const [address,items] of groups){
  let txs;
  try{txs=await transactions(address);}catch(e){errors++;console.error("scan address",String(e));continue;}
  const consumed=new Set();
  for(const order of items){
   checked++;
   const matches=txs.filter(t=>!consumed.has(t.hash)&&match(order,t));
   if(matches.length!==1)continue;
   const tx=matches[0];
   try{
    const result=await rpc("gp_ltc_finalize",{p_order_id:order.id,p_txid:tx.hash,p_sats:Number(order.sats),p_confirmations:Number(tx.confirmations)});
    if(result?.credited){credited++;consumed.add(tx.hash);}
   }catch(e){errors++;console.error("finalize",String(e));}
  }
 }
 console.log(JSON.stringify({at:new Date().toISOString(),checked,credited,errors}));
}
async function main(){
 console.log("Gold Pick LTC Railway watcher started; enabled="+(process.env.LTC_AUTOPAY_ENABLED==="true"));
 if(process.env.LTC_AUTOPAY_ENABLED!=="true"){console.log("Disabled; set LTC_AUTOPAY_ENABLED=true only after end-to-end tests");setInterval(()=>{},3600000);return;}
 for(const key of required)if(!process.env[key])throw Error("Missing required secret "+key);
 if(!Number.isFinite(delay)||delay<60000)throw Error("Invalid poll interval");
 for(;;){try{await refreshLtcPrices();}catch(e){console.error("LTC KRW pricing",String(e));}try{await scan();}catch(e){console.error("watcher",String(e));}await new Promise(r=>setTimeout(r,delay));}
}
main().catch(e=>{console.error(e);process.exit(1);});
