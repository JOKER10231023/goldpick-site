/* 골드픽 실제 결과 기반 적중률 — 발표된 자료, 적중/(적중+미적중).
 * 결과 0건은 -%, 대기/적특 제외. 15초 단위 자동 동기화. */
(()=>{"use strict";
const output=document.getElementById("gpAccuracyPercent");if(!output)return;
let client=null,loading=false,started=false;
async function getClient(){
 if(client)return client;
 let bridge=window.GOLDPICK_MEMBER_BRIDGE;
 if(bridge?.getClient())return client=bridge.getClient();
 const cfg=window.GOLDPICK_AUTH_CONFIG;
 if(!cfg?.url||!cfg?.publishableKey)return null;
 const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
 return client=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
async function refresh(){
 if(loading||document.hidden)return;loading=true;
 try{
  let c=await getClient();if(!c)return;
  let {data,error}=await c.rpc("gp_public_accuracy");if(error)throw error;
  let hits=Number(data?.hit)||0,misses=Number(data?.miss)||0,total=hits+misses;
  output.textContent=total?((hits/total)*100).toFixed(1)+"%":"-%";
  output.title=total?"확정 "+total+"건 기준":"확정된 결과 없음";
  output.dataset.state=total?"ready":"empty";
 }catch(err){
  output.textContent="-%";output.dataset.state="unavailable";
  console.warn("Gold Pick accuracy: run V2 SQL migration",err?.message||err);
 }finally{loading=false}
}
function start(){if(started)return;started=true;refresh();setInterval(refresh,15000);}
window.addEventListener("DOMContentLoaded",start);
window.addEventListener("gp:posts-updated",refresh);
window.addEventListener("focus",refresh);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
if(document.readyState!=="loading")start();
})();
