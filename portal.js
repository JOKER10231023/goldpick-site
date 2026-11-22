/* Gold Pick stand-alone FREE / VIP analysis portal. All rights enforced by Supabase RLS. */
(()=>{"use strict";
const $=id=>document.getElementById(id);
const mode=document.documentElement.dataset.portal==="vip"?"vip":"free";
const config={url:"https://xyssumwioolllczqgwsr.supabase.co",key:"sb_publishable_vqCZirS5_x5r7B7zDb7TxQ_GAuQi_O2"};
const projectHost=new URL(config.url).host;
let sb=null,user=null,articles=[],working=false,loaded=false;
const state={query:"",result:"all"};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
const date=x=>{if(!x)return "";const d=new Date(x);return Number.isNaN(d.valueOf())?"":d.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Seoul"});};
function notice(text,kind="info"){const n=$("portalNotice");n.textContent=text;n.dataset.kind=kind;}
function setHidden(id,v){const e=$(id);if(e)e.hidden=v;}
const resultLabels={pending:"결과 대기",hit:"적중",miss:"미적중",void:"적특"};
async function getImageUrl(ref){
 if(typeof ref!=="string"||!ref)return null;
 if(ref.startsWith("https://")){
   try{const u=new URL(ref);return u.host===projectHost?u.href:null;}catch{return null;}
 }
 const slash=ref.indexOf("/");if(slash<1)return null;
 const bucket=ref.slice(0,slash),path=ref.slice(slash+1);
 if(!path||!["gp-analysis","gp-vip-analysis"].includes(bucket))return null;
 if(bucket==="gp-vip-analysis"){
  const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,1800);
  if(error){console.warn("VIP image signing failed",error.message);return null;}
  return data?.signedUrl||null;
 }
 return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
async function appendImages(container,refs){
 if(!Array.isArray(refs)||!refs.length)return;
 const grid=el("div","portal-images");container.append(grid);
 for(const ref of refs){
  const url=await getImageUrl(ref);if(!url)continue;
  const a=el("a","portal-image-link");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
  const img=el("img");img.src=url;img.alt="경기 분석 첨부 이미지";img.loading="lazy";img.decoding="async";
  a.append(img);grid.append(a);
 }
}
function card(p){
 const a=el("button","portal-card");a.type="button";a.addEventListener("click",()=>void showArticle(p));
 const tags=el("div","portal-card-tags");
 tags.append(el("span","portal-pill",p.sport||"SPORTS"),el("span","portal-date",date(p.publish_at)));
 a.append(tags,el("h3","",p.title));
 if(p.home_team||p.away_team)a.append(el("p","portal-teams",([p.home_team,p.away_team].filter(Boolean)).join("  VS  ")));
 if(p.prediction)a.append(el("p","portal-pick","예상 · "+p.prediction));
 a.append(el("div","portal-card-foot",resultLabels[p.result]||resultLabels.pending+"  ·  상세 분석 보기 ↗"));
 return a;
}
function renderList(){
 $("portalDetail").hidden=true;$("portalListSection").hidden=false;
 const list=$("portalList");list.replaceChildren();
 const items=articles.filter(p=>(state.result==="all"||p.result===state.result)
  &&([p.title,p.home_team,p.away_team,p.sport,p.prediction].join(" ").toLowerCase().includes(state.query)));
 $("portalCount").textContent=items.length+"개의 분석";
 if(!items.length){list.append(el("div","portal-empty","해당 조건에 맞는 분석 자료가 없습니다."));return;}
 list.append(...items.map(card));
}
async function showArticle(p){
 const container=$("portalDetail");container.replaceChildren();
 $("portalListSection").hidden=true;container.hidden=false;
 const back=el("button","portal-back","← 목록으로");back.type="button";back.onclick=()=>{history.replaceState(null,"",location.pathname);renderList()};container.append(back);
 const header=el("div","portal-article-head");
 header.append(el("span","portal-pill",mode==="vip"?"VIP INSIGHT":"FREE INSIGHT"),el("span","portal-date",date(p.publish_at)));
 container.append(header,el("h1","portal-article-title",p.title));
 if(p.home_team||p.away_team)container.append(el("p","portal-article-teams",[p.home_team,p.away_team].filter(Boolean).join(" VS ")));
 if(p.match_at)container.append(el("p","portal-article-date","경기 시간 · "+new Date(p.match_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})));
 if(p.prediction)container.append(el("div","portal-article-pick","예상 결과 · "+p.prediction));
 const badge=el("span","portal-result",resultLabels[p.result]||resultLabels.pending);badge.dataset.result=p.result;container.append(badge);
 if(p.body)container.append(el("div","portal-article-body",p.body));
 await appendImages(container,p.image_urls);
 history.replaceState(null,"",location.pathname+"?id="+encodeURIComponent(p.id));
 window.scrollTo({top:0,behavior:"smooth"});
}
async function loadArticles(){
 if(working||!sb)return;working=true;
 $("portalList").replaceChildren(el("div","portal-empty","분석 자료를 불러오는 중입니다."));
 try{
  const {data,error}=await sb.from("gp_analysis_posts")
   .select("id,access_level,template,title,sport,home_team,away_team,match_at,prediction,body,image_urls,result,publish_at")
   .eq("access_level",mode).eq("status","published").lte("publish_at",new Date().toISOString())
   .order("publish_at",{ascending:false}).limit(100);
  if(error)throw error;
  articles=data||[];loaded=true;renderList();
  const id=new URLSearchParams(location.search).get("id");
  if(id){const found=articles.find(p=>String(p.id)===id);if(found)await showArticle(found);}
 }catch(err){$("portalList").replaceChildren(el("div","portal-empty","자료를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."));notice("자료 조회 오류: "+(err?.message||"확인 필요"),"error");}
 finally{working=false}
}
async function refreshUser(){
 if(!sb)return;
 try{const {data}=await sb.auth.getUser();user=data?.user||null;}catch{user=null;}
 if(mode==="free"){setHidden("portalGate",true);setHidden("portalContent",false);if(!loaded)await loadArticles();return;}
 $("portalLogin").hidden=!!user;$("portalLogout").hidden=!user;
 if(!user){setHidden("portalGate",false);setHidden("portalContent",true);$("portalGateState").textContent="회원 계정으로 로그인하면 VIP 이용권을 확인합니다.";return;}
 $("portalGateState").textContent="VIP 이용권 확인 중...";
 try{
   const {data,error}=await sb.rpc("gp_has_active_vip");if(error)throw error;
   if(data===true){setHidden("portalGate",true);setHidden("portalContent",false);loaded=false;await loadArticles();}
   else{setHidden("portalGate",false);setHidden("portalContent",true);$("portalGateState").textContent="현재 계정에 활성 VIP 이용권이 없습니다. 이용권이 있다면 계정을 확인해 주세요.";}
 }catch(err){setHidden("portalGate",false);setHidden("portalContent",true);$("portalGateState").textContent="권한 확인에 실패했습니다. Supabase 최신 SQL 적용 여부를 확인해 주세요.";console.warn(err);}
}
async function init(){
 $("portalSearch").addEventListener("input",e=>{state.query=e.target.value.trim().toLowerCase();renderList()});
 $("portalResultFilter").addEventListener("change",e=>{state.result=e.target.value;renderList()});
 $("portalRefresh").onclick=()=>{loaded=false;void loadArticles()};
 $("portalLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.currentTarget,button=f.querySelector("button[type=submit]");
  button.disabled=true;notice("로그인 확인 중...");
  try{
   const {error}=await sb.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});
   if(error)throw error;f.elements.password.value="";notice("");await refreshUser();
  }catch(err){notice("로그인 실패: "+(err?.message||"확인 필요"),"error")}
  finally{button.disabled=false}
 });
 $("portalLogout").onclick=async()=>{await sb.auth.signOut();user=null;loaded=false;articles=[];await refreshUser()};
 try{
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  sb=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  sb.auth.onAuthStateChange(()=>setTimeout(()=>void refreshUser(),0));
  await refreshUser();
 }catch(err){notice("서비스 연결에 실패했습니다. 네트워크를 확인해 주세요.","error");console.error(err)}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else void init();
})();
