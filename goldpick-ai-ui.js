/* Gold Pick AI Studio: independent button binding and draft preview. */
(()=>{
"use strict";
const get=id=>document.getElementById(id);
const API="https://xyssumwioolllczqgwsr.supabase.co/functions/v1/goldpick-gemini";
let busy=false;
function message(txt,kind="info"){
 const items=[get("gpAiStatus"),...document.querySelectorAll(".gp-ai-inline-status")];
 for(const e of items){if(!e)continue;e.textContent=txt;e.dataset.kind=kind;}
}
function showSportsData(sportsData){
 const panel=get("gpAiDataStatus");
 if(!panel)return;
 panel.replaceChildren();
 if(!sportsData){panel.hidden=true;return;}
 panel.hidden=false;
 const home=sportsData.home?.recent?.length||0;
 const away=sportsData.away?.recent?.length||0;
 const title=document.createElement("strong");
 title.textContent=(home||away)
   ?"📊 ESPN 자동 수집 완료 · 홈팀 "+home+"경기 / 원정팀 "+away+"경기"
   :sportsData.fixture
   ?"📅 ESPN에서 경기 일정 확인 · 이전 전적은 미확보"
   :"⚠️ 자동 수집 기록 없음 · 근거가 부족한 예측";
 panel.appendChild(title);
 const sub=document.createElement("p");
 sub.textContent=home||away
   ?"완료된 과거 경기 결과만 사용합니다. 아래 출처에서 확인할 수 있어요."
   :sportsData.reason||"해당 종목/리그의 조회 가능한 기록을 찾지 못했습니다.";
 panel.appendChild(sub);
 const links=(Array.isArray(sportsData.sources)?sportsData.sources:[]).slice(0,4);
 const wrap=document.createElement("div");
 for(let i=0;i<links.length;i++){
  try{
   const u=new URL(links[i]);
   if(u.protocol!=="https:"||!["site.api.espn.com","www.espn.com"].includes(u.hostname))continue;
   const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";
   a.textContent="출처 "+(i+1);wrap.appendChild(a);
  }catch{}
 }
 panel.appendChild(wrap);
}
function setBusy(b){
 busy=b;
 for(const el of document.querySelectorAll("#gpAiGenerate,[data-gp-ai-create]")){
  el.disabled=b;el.setAttribute("aria-busy",String(b));
 }
}
async function generate(){
 if(busy)return;
 const home=get("gpHome")?.value.trim()||"",away=get("gpAway")?.value.trim()||"";
 if(!home||!away){message("홈팀과 원정팀을 먼저 입력해 주세요.","error");get(!home?"gpHome":"gpAway")?.focus();return;}
 const bridge=window.GOLDPICK_MEMBER_BRIDGE;
 const client=bridge?.getClient?.();
 if(!client){message("관리자 계정으로 로그인한 뒤 다시 시도해 주세요.","error");return;}
 let token;
 try{
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  token=data?.session?.access_token;
 }catch{message("로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.","error");return;}
 if(!token){message("로그인이 만료됐습니다. 다시 로그인해 주세요.","error");return;}
 if((get("gpTitle")?.value.trim()||get("gpBody")?.value.trim())&&!window.confirm("현재 제목·예상 결과·분석 내용을 Gemini 초안으로 교체할까요?"))return;
 setBusy(true);showSportsData(null);message("실제 경기 데이터 자동 수집 → Gemini 승부 분석 중...");
 try{
  const response=await fetch(API,{
   method:"POST",
   headers:{"content-type":"application/json","authorization":"Bearer "+token,"apikey":"sb_publishable_vqCZirS5_x5r7B7zDb7TxQ_GAuQi_O2"},
   body:JSON.stringify({
    home,away,sport:get("gpSport")?.value||"",
    matchAt:get("gpMatchAt")?.value||"",
    template:get("gpTemplate")?.value||"detailed",
    stage:get("gpAiStage")?.value||"auto",
    context:get("gpAiContext")?.value||""
   })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"HTTP "+response.status);
  if(typeof data.title!=="string"||typeof data.body!=="string"||!data.title.trim()||!data.body.trim())throw Error("AI가 올바른 초안을 반환하지 않았습니다.");
  showSportsData(data.sportsData);
  const fields=[["gpTitle",data.title,160],["gpPrediction",String(data.prediction||""),300],["gpBody",data.body,20000]];
  for(const [id,value,max] of fields){
   const el=get(id);if(!el)continue;
   el.value=value.slice(0,max);
   el.dispatchEvent(new Event("input",{bubbles:true}));
   el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  message("✅ 실제 경기 데이터를 반영한 분석 초안 작성 완료! 데이터 출처와 내용을 확인한 뒤 저장하세요.","success");
  get("gpBody")?.scrollIntoView({block:"center",behavior:"smooth"});
 }catch(err){
  const network=/failed to fetch|networkerror|load failed/i.test(String(err));
  message(network?"AI 서버에 연결되지 않습니다. Supabase Edge Function의 배포와 Secret을 확인해 주세요.":"AI 작성 실패: "+(err?.message||"알 수 없는 오류"),"error");
 }finally{setBusy(false);}
}
document.addEventListener("click",e=>{
 const button=e.target.closest?.("#gpAiGenerate,[data-gp-ai-create]");
 if(!button)return;
 e.preventDefault();
 void generate();
});
})();