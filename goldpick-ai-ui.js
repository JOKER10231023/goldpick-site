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
 setBusy(true);message("Gemini AI가 분석을 작성 중입니다...");
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
  const fields=[["gpTitle",data.title,160],["gpPrediction",String(data.prediction||""),300],["gpBody",data.body,20000]];
  for(const [id,value,max] of fields){
   const el=get(id);if(!el)continue;
   el.value=value.slice(0,max);
   el.dispatchEvent(new Event("input",{bubbles:true}));
   el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  message("✅ AI 초안 작성 완료! 내용을 확인한 다음 ‘자료 저장’을 누르세요.","success");
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