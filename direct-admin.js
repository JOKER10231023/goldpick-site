/* GOLD PICK — wallet settings, asset catalogue and independent TXID review. */
(() => {
  "use strict";
  const bridge=window.GOLDPICK_MEMBER_BRIDGE;
  if(!bridge)return;
  const el=id=>document.getElementById(id);
  const days=[1,7,30,90,365];
  const krwPrices={1:1900,7:9900,30:29900,90:69900,365:149000};
  async function ltcRate(){const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=krw");if(!r.ok)throw Error("LTC 시세 조회 실패");const d=await r.json();const n=Number(d?.litecoin?.krw);if(!Number.isFinite(n)||n<1000)throw Error("LTC 시세를 확인할 수 없습니다.");return n;}
  let catalog=[],busy=false,active=false,refreshId=0;
  function notice(text,ok=false){
    const node=el("directAdminMessage");
    node.textContent=text;node.dataset.kind=ok?"success":"info";
  }
  function opt(value,title){
    const node=document.createElement("option");node.value=value;node.textContent=title;
    return node;
  }
  async function rpc(name,args={}){
    if(!bridge.getUser()||!bridge.getClient())throw new Error("관리자 로그인이 필요합니다.");
    const {data,error}=await bridge.getClient().rpc(name,args);
    if(error){
      if(error.code==="PGRST202")throw new Error("새 지갑 SQL 파일을 Supabase에서 먼저 실행해 주세요.");
      if(error.code==="42501")throw new Error("이 계정에는 관리자 권한이 없습니다.");
      throw new Error("설정 요청에 실패했습니다. (코드: "+String(error.code||"unknown").slice(0,35)+")");
    }
    if(data && typeof data==="object" && data.ok===false)
      throw new Error(data.message||"요청을 처리하지 못했습니다.");
    return data;
  }
  function selected(){
    return catalog.find(x=>x.coin===el("directAdminCoin").value &&
      x.network===el("directAdminNetwork").value);
  }
  function showNetworks(){
    const coin=el("directAdminCoin").value,select=el("directAdminNetwork"),before=select.value;
    const nets=catalog.filter(x=>x.coin===coin);
    select.replaceChildren(...(nets.length?nets.map(x=>opt(x.network,x.networkLabel)):
      [opt("","네트워크 없음")]));
    if(nets.some(x=>x.network===before))select.value=before;
    showWallet();
  }
  function showWallet(){
    const item=selected();
    el("directAdminAddress").value=item?.address||"";
    el("directAdminTag").value=item?.tag||"";
    el("directAdminEnabled").checked=!!item?.enabled;
    for(const d of days){
      document.querySelector('[data-direct-days="'+d+'"]').value=
        item?.coin==="ltc"&&item?.network==="litecoin"?String(krwPrices[d]):item?.prices?.[String(d)]||"";
    }
    for(const d of days){const input=document.querySelector('[data-direct-days="'+d+'"]');if(input)input.placeholder=item?.coin==="ltc"?"원화 가격":"코인 수량";}
    notice(item?
      (item.enabled?"현재 공개 중 · 구매자가 입금 주소를 볼 수 있습니다.":
        "비공개 상태 · 주소와 가격을 등록한 뒤 공개할 수 있습니다."):
      "코인·네트워크를 선택해 주세요.");
  }
  async function loadCatalog(){
    const stamp=++refreshId;
    notice("설정 가능한 코인·네트워크를 확인 중입니다...");
    try{
      const arr=await rpc("gp_direct_admin_catalog");
      if(!active||stamp!==refreshId)return;
      catalog=Array.isArray(arr)?arr:[];
      const select=el("directAdminCoin"),old=select.value;
      const coins=[...new Map(catalog.map(x=>[x.coin,x.coinLabel])).entries()];
      select.replaceChildren(...coins.map(([code,label])=>opt(code,label)));
      if(coins.some(x=>x[0]===old))select.value=old;
      showNetworks();
    }catch(e){if(stamp===refreshId)notice(e.message);}
  }
  async function saveWallet(){
    if(busy)return;
    const item=selected();
    if(!item)return;
    const address=el("directAdminAddress").value.trim();
    const tag=el("directAdminTag").value.trim();
    const enabled=el("directAdminEnabled").checked;
    const prices={};
    const isLtc=item.coin==="ltc"&&item.network==="litecoin";
    for(const d of days){
      const v=document.querySelector('[data-direct-days="'+d+'"]').value.trim();
      if(!v)continue;
      if(!/^(?:0|[1-9]\d*)(?:\.\d{1,14})?$/.test(v) || Number(v)<=0){
        notice(d+"일 가격은 0보다 큰 코인 수량을 입력해 주세요.");return;
      }
      prices[String(d)]=v;
    }
    if(enabled && (!address||!Object.keys(prices).length)){
      notice("공개하려면 주소와 한 가지 이상의 기간별 가격을 입력해 주세요.");return;
    }
    if(enabled && !window.confirm(
      item.coinLabel+" / "+item.networkLabel+" 결제 주소를 구매자에게 공개할까요?\n"+
      "계정 본인 소유 또는 제3자 입금이 허용된 수납 주소만 사용해야 합니다."
    ))return;
    busy=true;el("directAdminSave").disabled=true;
    try{
      if(isLtc){const rate=await ltcRate();for(const d of days){const krw=Number(prices[String(d)]);if(krw>0)prices[String(d)]=(Math.ceil(krw/rate*1e8)/1e8).toFixed(8);}}
      const resp=await rpc("gp_direct_admin_save_wallet",{
        p_coin:item.coin,p_network:item.network,p_address:address,
        p_tag:tag,p_enabled:enabled,p_prices:prices
      });
      const found=catalog.find(x=>x.coin===item.coin&&x.network===item.network);
      if(found){found.address=address;found.tag=tag;found.enabled=enabled;found.prices=prices;}
      notice(isLtc?"LTC 지갑 저장 완료 · 원화 가격은 Railway가 시세에 맞춰 자동 갱신합니다.":resp.message,true);
    }catch(e){notice(e.message);}
    finally{busy=false;el("directAdminSave").disabled=false;}
  }
  function makeCase(order){
    const card=document.createElement("div");card.className="admin-crypto-case";
    const name=document.createElement("strong");
    name.textContent=(order.email||"알 수 없는 회원")+" · "+order.days+"일 VIP";
    const detail=document.createElement("small");
    detail.textContent=order.amount+" "+order.coin.toUpperCase()+
      " / "+order.network+" · "+order.status;
    const address=document.createElement("code");
    address.textContent="입금 주소: "+order.address+(order.tag?" · 태그: "+order.tag:"");
    const hash=document.createElement("code");
    hash.textContent="TXID: "+(order.txid||"미제출");
    const note=document.createElement("textarea");
    note.className="direct-review-note";note.maxLength=500;
    note.placeholder="검증 근거 기록: 블록 탐색기/거래 내역, 네트워크, 금액, 주소, 확인 횟수 등";
    if(order.note)note.value=order.note;
    card.append(name,detail,address,hash);
    if(order.status==="approved"||order.status==="rejected"){
      const done=document.createElement("p");done.className="direct-review-done";
      done.textContent=order.status==="approved"?"지급 처리 완료 · 중복 지급 불가":"반려 완료";
      card.append(done);
      return card;
    }
    card.append(note);
    const btns=document.createElement("div");btns.className="direct-review-actions";
    const approve=document.createElement("button"),reject=document.createElement("button");
    approve.type=reject.type="button";
    approve.textContent="실제 입금 검증 완료 · VIP 지급";
    reject.textContent="입금 불일치 · 반려";
    approve.disabled=!order.txid||order.status!=="txid_submitted";
    approve.addEventListener("click",()=>void review(order,true,note,approve,reject));
    reject.addEventListener("click",()=>void review(order,false,note,approve,reject));
    btns.append(approve,reject);card.append(btns);
    return card;
  }
  async function loadOrders(){
    if(!active)return;
    const root=el("directAdminOrders");
    root.textContent="입금 요청을 조회 중입니다...";
    try{
      const data=await rpc("gp_direct_admin_orders");
      if(!active)return;
      if(!Array.isArray(data)||!data.length){
        root.textContent="아직 결제 요청이 없습니다.";return;
      }
      root.replaceChildren(...data.map(makeCase));
    }catch(e){root.textContent=e.message;}
  }
  async function review(order,approved,note,approve,reject){
    const explanation=note.value.trim();
    if(approved && explanation.length<10){
      window.alert("실제 온체인 거래와 수신 내역을 확인하고 검증 근거를 10자 이상 남겨주세요.");
      return;
    }
    const prompt=approved?
      "실제 송금액, 입금 주소, 코인·네트워크, 태그, 중복 여부를 모두 확인했나요?\n\n"+
      order.email+" 계정에 "+order.days+"일 VIP를 지급합니다.":
      "이 주문을 반려할까요?";
    if(!window.confirm(prompt))return;
    approve.disabled=reject.disabled=true;
    try{
      const reply=await rpc("gp_direct_admin_review",{
        p_order_id:order.id,p_approve:approved,p_note:explanation
      });
      window.alert(reply.message||"검토가 완료됐습니다.");
      await loadOrders();
    }catch(e){
      window.alert(e.message);
      approve.disabled=!order.txid;reject.disabled=false;
    }
  }
  el("directAdminCoin").addEventListener("change",showNetworks);
  el("directAdminNetwork").addEventListener("change",showWallet);
  el("directAdminSave").addEventListener("click",()=>void saveWallet());
  el("directAdminOrdersRefresh").addEventListener("click",()=>void loadOrders());
  window.addEventListener("goldpick:view",event=>{
    active=event.detail?.name==="admin";
    if(!active){++refreshId;return;}
    setTimeout(async()=>{
      await loadCatalog();
      if(active)await loadOrders();
    },0);
  });
  window.addEventListener("goldpick:session",event=>{
    if(event.detail?.event!=="SIGNED_OUT")return;
    active=false;++refreshId;catalog=[];
    el("directAdminOrders").textContent="관리자 로그인이 필요합니다.";
    notice("관리자 계정으로 다시 로그인해 주세요.");
  });
})();
