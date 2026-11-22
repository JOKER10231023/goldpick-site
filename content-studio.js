/* Gold Pick V2 — four-template editor, secure Storage uploads, thumbnail controls. */
(()=>{"use strict";
const bridge=window.GOLDPICK_MEMBER_BRIDGE,root=document.getElementById("gpStudio");
if(!bridge||!root)return;
const $=id=>document.getElementById(id);
let posts=[],editing=null,images=[],uploading=false,loading=false,previewSeq=0;
const validBuckets=["gp-analysis","gp-vip-analysis"];
const status=(text,kind="info")=>{let n=$("gpStudioMsg");n.textContent=text;n.dataset.kind=kind;};
const dateInput=value=>{if(!value)return "";let d=new Date(value);return Number.isNaN(d.valueOf())?"":new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const make=(tag,cls,txt)=>{let e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
const currentBucket=()=> $("gpAccess").value==="vip"?"gp-vip-analysis":"gp-analysis";
const refBucket=ref=>{if(typeof ref!=="string")return null;return validBuckets.find(b=>ref.startsWith(b+"/"))||null;};
const mismatch=()=>images.some(ref=>!refBucket(ref)||refBucket(ref)!==currentBucket());
function editableTemplate(){
 const t=$("gpTemplate").value;
 $("gpMatchFields").hidden=t==="image";
 $("gpPredictionField").hidden=t==="image";
 $("gpBodyField").hidden=t==="quick";
 $("gpImagesField").hidden=t==="quick";
}
function stateOf(p){if(p.status==="draft")return "임시저장";if(new Date(p.publish_at)>new Date())return "예약 발행";return "게시 중";}
function uploadText(err){
 const text=String(err?.message||err||"알 수 없는 오류");
 if(/row.level.security|permission denied|Unauthorized|status.*403|new row violates|policy/i.test(text))
  return "업로드 권한 오류입니다. Supabase의 goldpick-analysis-v2.sql 적용 후 다시 시도해 주세요. ("+text+")";
 if(/bucket not found/i.test(text))return "이미지 저장소가 없습니다. Supabase 수정 SQL을 실행해 주세요.";
 return "사진 업로드 실패: "+text;
}
async function rpc(name,args={}){
 const client=bridge.getClient();if(!client)throw Error("로그인 상태를 확인해 주세요.");
 const {data,error}=await client.rpc(name,args);
 if(error)throw error;return data;
}
async function load(){
 if(loading)return;loading=true;
 const list=$("gpStudioList");
 try{
  posts=await rpc("gp_analysis_admin_list");
  list.replaceChildren();
  if(!posts.length)list.append(make("p","gp-studio-empty","아직 작성된 자료가 없습니다. 위에서 첫 분석을 작성하세요."));
  for(const p of posts){
   const row=make("div","gp-studio-row");
   const info=make("div","gp-studio-row-info");
   info.append(make("strong","",p.title),make("span","",(p.access_level==="vip"?"VIP":"무료")+" · "+stateOf(p)+" · "+({pending:"대기",hit:"적중",miss:"미적중",void:"적특"}[p.result]||"대기")));
   const actions=make("div","gp-studio-row-actions");
   for(const [label,click] of [
    ["수정",()=>{fill(p);root.scrollIntoView({behavior:"smooth",block:"start"});}],
    ["복제",()=>{fill({...p,id:null,title:p.title+" (복사본)"});root.scrollIntoView({behavior:"smooth",block:"start"});}],
    ["삭제",async()=>{if(!confirm("이 자료를 삭제할까요?"))return;try{await rpc("gp_analysis_admin_delete",{p_id:p.id});status("삭제했습니다.","success");await load();window.dispatchEvent(new Event("gp:posts-updated"));}catch(e){status("삭제 실패: "+e.message,"error")}}]
   ]){let button=make("button","",label);button.type="button";button.onclick=click;actions.append(button);}
   row.append(info,actions);list.append(row);
  }
 }catch(err){status("자료 목록 조회 실패: "+(err.message||"SQL 설정 확인"),"error");}
 finally{loading=false;}
}
async function imageUrl(ref){
 const client=bridge.getClient();
 const bucket=refBucket(ref);
 if(!bucket){
  try{const u=new URL(ref);return u.protocol==="https:"?u.href:null;}catch{return null;}
 }
 const path=ref.slice(bucket.length+1);
 if(bucket==="gp-vip-analysis"){
  const {data,error}=await client.storage.from(bucket).createSignedUrl(path,900);
  if(error)return null;return data?.signedUrl||null;
 }
 return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
async function renderImages(){
 const seq=++previewSeq,box=$("gpImagePreview");if(!box)return;
 box.replaceChildren();
 $("gpImageNames").textContent=images.length+" / 8장 등록";
 for(const ref of images){
  let wrap=make("div","gp-upload-tile");
  let photo=make("div","gp-upload-placeholder","이미지 확인 중");
  let remove=make("button","gp-upload-remove","×");remove.type="button";remove.setAttribute("aria-label","첨부 이미지 제거");
  remove.onclick=()=>{images=images.filter(x=>x!==ref);void renderImages();};
  wrap.append(photo,remove);box.append(wrap);
  try{
   const url=await imageUrl(ref);if(seq!==previewSeq)return;
   if(url){const img=make("img");img.src=url;img.loading="lazy";img.alt="첨부된 사진";photo.replaceWith(img);}
   else photo.textContent="미리보기 불가";
  }catch{photo.textContent="미리보기 불가";}
 }
}
function fill(p={}){
 editing=p.id||null;
 const fields={
  gpTemplate:p.template||"basic",gpAccess:p.access_level||"free",
  gpTitle:p.title||"",gpSport:p.sport||"",gpHome:p.home_team||"",
  gpAway:p.away_team||"",gpPrediction:p.prediction||"",gpBody:p.body||"",
  gpResult:p.result||"pending",gpStatus:p.status||"draft"
 };
 for(const [id,value]of Object.entries(fields))$(id).value=value;
 $("gpMatchAt").value=dateInput(p.match_at);
 $("gpPublishAt").value=dateInput(p.publish_at);
 images=Array.isArray(p.image_urls)?[...p.image_urls]:[];
 $("gpImageInput").value="";
 editableTemplate();void renderImages();
 status(editing?"기존 글 수정 중 — 변경 후 저장을 눌러주세요.":"새 분석을 작성하세요.");
}
async function upload(files){
 if(uploading)return;
 if(!files.length)return;
 if(images.length+files.length>8){status("이미지는 총 8장까지 올릴 수 있습니다.","error");return;}
 const bucket=currentBucket(),client=bridge.getClient();
 if(!client||!bridge.getUser()){status("관리자 계정으로 다시 로그인해 주세요.","error");return;}
 uploading=true;$("gpSavePost").disabled=true;$("gpImageInput").disabled=true;
 let done=0;
 try{
  for(const file of files){
   if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type))
    throw Error("지원하지 않는 사진 형식입니다. JPG, PNG, WEBP, GIF만 가능합니다.");
   if(file.size>5*1024*1024)throw Error("사진은 한 장당 5MB까지 업로드할 수 있습니다.");
   const suffix={ "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type];
   const path="posts/"+new Date().toISOString().slice(0,10)+"/"+crypto.randomUUID()+"."+suffix;
   status("사진 업로드 중... "+(done+1)+" / "+files.length);
   const {error}=await client.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
   if(error)throw error;
   images.push(bucket+"/"+path);done++;await renderImages();
  }
  status(done+"장 업로드 완료! 아래의 ‘자료 저장’을 눌러 게시글에 첨부하세요.","success");
 }catch(err){status(uploadText(err),"error");console.error("Gold Pick photo upload",err);}
 finally{uploading=false;$("gpSavePost").disabled=false;$("gpImageInput").disabled=false;$("gpImageInput").value="";}
}
$("gpImageInput").addEventListener("change",e=>{const files=[...e.target.files];void upload(files)});
$("gpNewPost").addEventListener("click",()=>fill());
$("gpTemplate").addEventListener("change",editableTemplate);
$("gpAccess").addEventListener("change",e=>{
 if(!images.length)return;
 if(mismatch()){
  const accepted=confirm("무료와 VIP 사진은 저장소가 다릅니다. 공개 범위를 바꾸면 기존 첨부 이미지를 목록에서 지우고 다시 업로드해야 합니다. 계속할까요?");
  if(accepted){images=[];void renderImages();status("공개 범위를 변경했습니다. 사진을 다시 첨부해 주세요.");}
  else e.target.value=e.target.value==="vip"?"free":"vip";
 }
});
$("gpClearImages").addEventListener("click",()=>{
 if(images.length&&!confirm("첨부한 사진을 목록에서 모두 제외할까요?"))return;
 images=[];void renderImages();status("첨부 이미지 목록을 비웠습니다.");
});
$("gpStudioForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(uploading){status("사진 업로드가 끝난 뒤 저장해 주세요.","error");return;}
 if(mismatch()){status("VIP 자료의 이미지는 반드시 비공개 저장소에, 무료 자료는 공개 저장소에 올려야 합니다. 이미지를 지우고 다시 첨부해 주세요.","error");return;}
 const datetime=id=>$(id).value?new Date($(id).value).toISOString():null;
 const p={id:editing,template:$("gpTemplate").value,access_level:$("gpAccess").value,
  title:$("gpTitle").value.trim(),sport:$("gpSport").value.trim(),
  home_team:$("gpHome").value.trim(),away_team:$("gpAway").value.trim(),
  match_at:datetime("gpMatchAt"),prediction:$("gpPrediction").value.trim(),
  body:$("gpBody").value.trim(),image_urls:images,
  result:$("gpResult").value,status:$("gpStatus").value,
  publish_at:datetime("gpPublishAt")||new Date().toISOString()};
 $("gpSavePost").disabled=true;status("자료 저장 중...");
 try{
  await rpc("gp_analysis_admin_save",{p_data:p});
  fill();status("분석 자료 저장 완료! 홈페이지와 게시판에 반영됩니다.","success");
  await load();window.dispatchEvent(new Event("gp:posts-updated"));
 }catch(err){status("저장 실패: "+(err?.message||"다시 시도해 주세요."),"error");}
 finally{$("gpSavePost").disabled=false;}
});
window.addEventListener("goldpick:view",event=>{if(event.detail?.name==="admin")setTimeout(()=>void load(),0);});
fill();
})();
