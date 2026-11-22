/* Upgrade working /free/ and /vip/ links to Cloudflare subdomains when deployed. */
(()=>{"use strict";
const mapping=[
 ["gpFreeGo","https://free.goldpick.6uv0.xyz/"],
 ["gpVipGo","https://vip.goldpick.6uv0.xyz/"]
];
function init(){
 for(const [id,url]of mapping){
  const link=document.getElementById(id);if(!link)return;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),2600);
  fetch(url,{method:"GET",mode:"cors",cache:"no-store",signal:ctrl.signal})
    .then(r=>{if(r.ok&&r.headers.get("content-type")?.includes("text/html")){link.href=url;link.dataset.domainReady="true";}})
    .catch(()=>{}).finally(()=>clearTimeout(timer));
 }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
