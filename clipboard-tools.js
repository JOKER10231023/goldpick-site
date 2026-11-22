/* GOLD PICK universal admin clipboard controls — independent of Supabase/editor code. */
(()=>{
"use strict";
const scopes=["#gpStudioForm","#vipAdminForm","#directWalletAdminPanel","#directAdminReviews"];
const isTextControl=e=>e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement;
function report(message,error=false){
 const el=document.getElementById("gpClipboardNotice")||document.getElementById("gpStudioMsg");
 if(el){el.textContent=message;el.dataset.kind=error?"error":"success";el.hidden=false;}
}
function enhanceOtherAdminFields(){
 for(const selector of scopes.slice(1)){
  const area=document.querySelector(selector);if(!area)continue;
  for(const e of area.querySelectorAll("input,textarea,select")){
   if(e.closest(".gp-clipboard-row")||e.type==="file"||e.type==="checkbox"||e.type==="radio"||e.type==="hidden"||e.disabled||e.readOnly)continue;
   if(!e.id)e.id="gpPasteDynamic"+Math.random().toString(36).slice(2,10);
   const row=document.createElement("span");row.className="gp-clipboard-row gp-clipboard-extra";
   const btn=document.createElement("button");btn.type="button";btn.className="gp-clipboard-btn";btn.textContent="📋 붙여넣기";
   btn.dataset.pasteFor=e.id;btn.setAttribute("aria-label",e.id+"에 붙여넣기");
   e.parentNode.insertBefore(row,e);row.append(e,btn);
  }
 }
}
function parseDateTime(value){
 const raw=value.trim();
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw))return raw.slice(0,16);
 if(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw))return raw.replace(/\s+/,"T").slice(0,16);
 const parsed=new Date(raw);
 if(Number.isNaN(parsed.getTime()))return null;
 const local=new Date(parsed.getTime()-parsed.getTimezoneOffset()*60000).toISOString().slice(0,16);
 return local;
}
function apply(control,pasted){
 const value=pasted.trim();
 if(!value){report("클립보드에 복사한 텍스트가 없습니다.",true);return false;}
 if(control instanceof HTMLSelectElement){
  const options=Array.from(control.options);
  const norm=v=>String(v).trim().toLowerCase().replace(/\s+/g,"");
  const opt=options.find(o=>norm(o.value)===norm(value)||norm(o.textContent)===norm(value));
  if(!opt){report("선택 항목과 일치하지 않습니다. 목록의 이름이나 값을 복사해 주세요.",true);return false;}
  control.value=opt.value;
 }else if(control instanceof HTMLInputElement&&control.type==="datetime-local"){
  const date=parseDateTime(value);
  if(!date){report("날짜는 2026-11-22 23:00 형식으로 복사해 주세요.",true);return false;}
  control.value=date;
  if(!control.value){report("날짜가 올바르지 않습니다.",true);return false;}
 }else{
  const raw=control.value;
  let start=raw.length,end=start;
  try{if(control.selectionStart!==null){start=control.selectionStart;end=control.selectionEnd;}}catch{}
  const next=raw.slice(0,start)+pasted+raw.slice(end);
  if(control.maxLength>0&&next.length>control.maxLength){report("글자 수 제한을 초과했습니다. 내용을 줄여 주세요.",true);return false;}
  control.value=next;
  try{control.setSelectionRange(start+pasted.length,start+pasted.length);}catch{}
 }
 control.dispatchEvent(new Event("input",{bubbles:true}));
 control.dispatchEvent(new Event("change",{bubbles:true}));
 control.focus({preventScroll:true});
 report("붙여넣기 완료! 저장 버튼을 눌러 반영하세요.");
 return true;
}
async function paste(button){
 const control=document.getElementById(button.dataset.pasteFor);
 if(!isTextControl(control)){report("입력칸을 찾지 못했습니다.",true);return;}
 button.disabled=true;
 try{
  if(!navigator.clipboard?.readText)throw Error("clipboard-unavailable");
  const value=await navigator.clipboard.readText();
  apply(control,value);
 }catch(err){
  control.focus({preventScroll:true});
  report("클립보드 자동 읽기가 차단됐습니다. Chrome 또는 기본 브라우저에서 열고 클립보드 권한을 허용하거나 입력칸을 길게 눌러 붙여넣기 해 주세요.",true);
 }finally{button.disabled=false;}
}
document.addEventListener("click",e=>{
 const button=e.target.closest?.(".gp-clipboard-btn[data-paste-for]");
 if(!button)return;
 e.preventDefault();e.stopPropagation();
 void paste(button);
},true);
function init(){
 enhanceOtherAdminFields();
 const studio=document.getElementById("gpStudioForm");
 if(studio&&!document.getElementById("gpClipboardNotice")){
  const note=document.createElement("p");note.id="gpClipboardNotice";note.setAttribute("role","status");note.setAttribute("aria-live","polite");note.style.cssText="margin:8px 0;font-size:12px;line-height:1.8;color:#f3d49a;";
  studio.insertBefore(note,studio.firstChild);
 }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
