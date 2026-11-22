/* GOLD PICK Gemini AI Studio | Cloudflare Worker
 * Secret required: GEMINI_API_KEY (actual key VALUE, not AI Studio key display name)
 * No auto-publication. Valid Supabase Gold Pick admin JWT required for every request.
 */
const SUPABASE_URL="https://xyssumwioolllczqgwsr.supabase.co";
const SUPABASE_PUBLISHABLE="sb_publishable_vqCZirS5_x5r7B7zDb7TxQ_GAuQi_O2";
const ALLOWED_ORIGIN="https://goldpick.6uv0.xyz";
const respond=(data,status=200,origin=ALLOWED_ORIGIN)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":origin,"access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"POST, OPTIONS","vary":"Origin"}});
export default {
 async fetch(request,env){
  const origin=request.headers.get("Origin");
  if(origin!==ALLOWED_ORIGIN)return respond({error:"허용되지 않은 사이트입니다."},403,"null");
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":ALLOWED_ORIGIN,"access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"POST, OPTIONS","access-control-max-age":"600","vary":"Origin"}});
  if(request.method!=="POST")return respond({error:"POST만 지원합니다."},405);
  if(new URL(request.url).pathname!=="/generate")return respond({error:"잘못된 경로입니다."},404);
  if(!env.GEMINI_API_KEY)return respond({error:"Cloudflare Worker에 GEMINI_API_KEY Secret을 설정해 주세요."},503);
  const token=(request.headers.get("Authorization")||"").match(/^Bearer (\S+)$/i)?.[1];
  if(!token||token.length>5000)return respond({error:"관리자 로그인이 필요합니다."},401);
  // goldpick_is_admin() executes as the authenticated user; server verifies JWT and admin membership.
  const check=await fetch(SUPABASE_URL+"/rest/v1/rpc/goldpick_is_admin",{method:"POST",headers:{"apikey":SUPABASE_PUBLISHABLE,"authorization":"Bearer "+token,"content-type":"application/json"},body:"{}"});
  if(!check.ok||await check.json()!==true)return respond({error:"관리자 권한이 없습니다. 다시 로그인해 주세요."},403);
  const size=Number(request.headers.get("content-length")||0);
  if(size>12000)return respond({error:"입력 내용이 너무 깁니다."},413);
  let data;
  try{data=await request.json();}catch{return respond({error:"입력 형식이 올바르지 않습니다."},400);}
  const cut=(v,n)=>String(v??"").trim().slice(0,n);
  const home=cut(data?.home,100),away=cut(data?.away,100),sport=cut(data?.sport,80)||"축구",matchAt=cut(data?.matchAt,40);
  const template=["basic","quick","image","detailed"].includes(data?.template)?data.template:"detailed";
  const context=cut(data?.context,4000);
  if(!home||!away)return respond({error:"홈팀과 원정팀을 모두 입력해 주세요."},400);
  const guide=`너는 Gold Pick 스포츠 기사 초안 작성 도우미다. 반드시 한국어. 사용자가 제공한 정보만 확정 사실로 다룬다. 인터넷 접속이나 현재 실시간 점수/라인업/최근 전적/부상 여부를 확인한 척하지 않는다. 외부에서 검증하지 못한 통계, 확률, 배당, 상대 전적, 실시간 스코어와 결과를 절대 만들지 않는다. 근거가 없으면 '확인된 최신 자료가 없어 추가 검증이 필요하다'고 명시한다. 이미 시작했거나 끝난 경기는 사전 예측이 아니라 사후/실시간 분석임을 명확히 한다. 사용자가 작성한 참고정보도 독립 검증되지 않았다고 설명한다. 객관적이고 읽기 쉬운 프리미엄 스포츠 기사로 작성한다. 확정적인 적중/수익 보장 표현 금지. 제목 160자 이내, 전망 300자 이내, 본문 10000자 이내. 본문에는 분석 개요, 확인된 정보, 핵심 변수, 불확실성, 종합 전망, 작성 시점 유의사항을 포함한다. 입력 자료가 제한적이면 이를 솔직히 표기. 특히 누락된 경기 기록을 지어내지 않는다. JSON만 응답: {"title":"...","prediction":"...","body":"..."}.`;
  const prompt=`현재 시각: ${new Date().toISOString()} UTC. 종목: ${sport}. 경기: ${home} 대 ${away}. 경기 시작 시간(입력값): ${matchAt||"미입력"}. 작성 유형: ${template}. 사용자가 입력한 확인용 참고사항(검증 안 됨): ${context||"없음"}. 위 정보에 맞게 한국어 게시글 초안을 작성하라.`;
  let ai;
  try{
   ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"x-goog-api-key":env.GEMINI_API_KEY,"content-type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:guide}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",maxOutputTokens:4096,temperature:0.45}})});
  }catch{return respond({error:"Gemini 서버 연결에 실패했습니다."},502);}
  if(!ai.ok){
   const code=ai.status;
   return respond({error:code===429?"Gemini 사용량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.":code===400||code===403?"Gemini API 키/모델 사용 권한을 확인해 주세요.":"Gemini 요청 실패 (HTTP "+code+")"},502);
  }
  let article;
  try{
   const payload=await ai.json();
   const text=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
   article=JSON.parse(text);
   if(!article.title||!article.body)throw Error("blank");
  }catch{return respond({error:"Gemini 응답을 읽지 못했습니다. 다시 생성해 주세요."},502);}
  return respond({title:cut(article.title,160),prediction:cut(article.prediction,300),body:cut(article.body,20000),generatedAt:new Date().toISOString()});
 }
};