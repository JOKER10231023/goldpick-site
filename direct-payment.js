/* GOLD PICK — Direct wallet checkout. No customer-side VIP granting. */
(() => {
  "use strict";
  const bridge=window.GOLDPICK_MEMBER_BRIDGE;
  if(!bridge) return;
  const el=id=>document.getElementById(id);
  let offers=[],orders=[],selectedOrder=null,opened=false,busy=false,poll=null;
  let loadToken=0;
  const statuses={
    awaiting_transfer:"입금 확인 대기",
    txid_submitted:"입금 검증 대기",
    approved:"VIP 지급 완료",rejected:"결제 반려"
  };
  const isLtc=order=>String(order?.coin||"").toLowerCase()==="ltc";
  function setText(id,value){el(id).textContent=String(value);}
  function date(value){
    const d=new Date(value);
    return Number.isNaN(d.getTime())?"—":d.toLocaleString("ko-KR",{
      timeZone:"Asia/Seoul",year:"numeric",month:"short",day:"numeric",
      hour:"2-digit",minute:"2-digit"
    });
  }
  function status(text,ok=false){
    const box=el("directPayStatus");
    box.textContent=text;box.dataset.state=ok?"ready":"pending";
  }
  function option(value,title){
    const node=document.createElement("option");
    node.value=String(value);node.textContent=title;return node;
  }
  async function rpc(fn,params={}){
    const client=bridge.getClient(),user=bridge.getUser();
    if(!client || !user)throw new Error("로그인 후 이용해 주세요.");
    const {data,error}=await client.rpc(fn,params);
    if(error){
      if(error.code==="PGRST202")throw new Error("결제 DB 설정 전입니다. 관리자에게 문의해 주세요.");
      throw new Error(error.code==="42501"?"이 작업을 수행할 권한이 없습니다.":
        "결제 정보 조회에 실패했습니다. (코드: "+String(error.code||"unknown").slice(0,30)+")");
    }
    if(data && typeof data==="object" && data.ok===false)
      throw new Error(data.message||"요청을 처리하지 못했습니다.");
    return data;
  }
  function currentWallet(){
    return offers.find(w=>w.coin===el("directPayCoin").value &&
      w.network===el("directPayNetwork").value);
  }
  function setupOptions(){
    const coins=el("directPayCoin");
    const oldCoin=coins.value;
    const distinct=[...new Map(offers.map(x=>[x.coin,x.coinLabel])).entries()];
    coins.replaceChildren(...(distinct.length?distinct.map(([coin,label])=>option(coin,label)):
      [option("","설정된 코인 없음")]));
    coins.disabled=!distinct.length;
    if(distinct.some(x=>x[0]===oldCoin))coins.value=oldCoin;
    renderNetworks();
  }
  function renderNetworks(){
    const coin=el("directPayCoin").value,select=el("directPayNetwork");
    const old=select.value;
    const list=offers.filter(x=>x.coin===coin);
    select.replaceChildren(...(list.length?list.map(x=>option(x.network,x.networkLabel)):
      [option("","네트워크 없음")]));
    select.disabled=!list.length;
    if(list.some(x=>x.network===old))select.value=old;
    renderDays();
  }
  function renderDays(){
    const wallet=currentWallet(),select=el("directPayDays");
    const old=select.value;
    const days=[1,7,30,90,365].filter(d=>wallet?.prices?.[String(d)]);
    select.replaceChildren(...(days.length?
      days.map(d=>option(d,d+"일 VIP")):[option("","가격 설정 전")]));
    select.disabled=!days.length;
    if(requestedDays&&days.some(x=>String(x)===requestedDays)){
      select.value=requestedDays;requestedDays=null;
    }else if(days.some(x=>String(x)===old))select.value=old;
    renderPreview();
  }
  function renderPreview(){
    const wallet=currentWallet();
    const amount=wallet?.prices?.[el("directPayDays").value];
    setText("directPayAmount",amount?(wallet.coin==="ltc"?"주문 시 정확한 LTC 수량 표시":amount+" "+wallet.coin.toUpperCase()):"미설정");
    el("directPayCreate").textContent=wallet?.coin==="ltc"?"LTC 자동결제 주문 생성":"결제 요청 생성";
    const krw={1:1900,7:9900,30:29900,90:69900,365:149000};
    const label=el("directKrwPrice");if(label)label.textContent=wallet?.coin==="ltc"&&krw[el("directPayDays").value]?"₩"+krw[el("directPayDays").value].toLocaleString("ko-KR")+" · 결제 수량은 주문 시 확정":"—";
    const guide=el("directPaymentNote");
    if(guide)guide.textContent=wallet?.coin==="ltc"?"LTC 자동결제: 주문 생성 후 표시되는 고유 수량을 정확히 보내세요. 서버가 입금을 자동 감지해 6회 확인 후 VIP를 지급합니다. 주문 전 송금하거나 임의의 수량을 보내면 자동 처리되지 않습니다.":"다른 코인은 기존 수동 검증 방식입니다. 주문 생성 후 TXID를 제출해야 합니다.";
    setText("directPayNetworkLabel",wallet?.networkLabel||"—");
    setText("directPayAddress",wallet?.address||"등록된 입금 주소 없음");
    setText("directPayTag",wallet?.tag||"—");
    el("directPayTagWrap").hidden=!wallet?.tag;
    el("directPayCopyPreview").disabled=!wallet?.address;
    el("directPayCreate").disabled=busy || !amount || !wallet?.address;
  }
  function clearPoll(){
    if(poll){clearInterval(poll);poll=null;}
  }
  function renderOrder(order){
    selectedOrder=order;
    el("directPaySetup").hidden=true;
    el("directPayOrder").hidden=false;
    setText("directOrderStatus",isLtc(order)&&order.status==="awaiting_transfer"?"블록체인 자동 입금 감지 중":statuses[order.status]||"상태 확인 중");
    setText("directOrderPlan",order.days+"일 VIP · "+order.coin.toUpperCase());
    setText("directOrderAmount",order.amount+" "+order.coin.toUpperCase());
    setText("directOrderAddress",order.address);
    setText("directOrderTag",order.tag||"—");
    el("directOrderTagWrap").hidden=!order.tag;
    setText("directOrderId",order.id);
    const hints={
      awaiting_transfer:isLtc(order)?"LTC 자동결제: 표시된 수량을 정확히 송금하면 블록체인 6회 확인 후 관리자 승인 없이 VIP가 자동 지급됩니다. TXID 제출은 필요하지 않습니다.":"송금 후 TXID를 제출하세요. 관리자 확인 후 VIP가 지급됩니다.",
      txid_submitted:"TXID가 접수됐습니다. 관리자 검토 중입니다.",
      approved:"검증된 입금에 대한 VIP가 지급됐습니다. 마이페이지에서 확인하세요.",
      rejected:"결제 요청이 반려됐습니다. 운영자에게 문의해 주세요."
    };
    const msg=el("directOrderMessage");msg.textContent=hints[order.status]||"결제 상태를 확인하는 중입니다.";
    msg.dataset.kind=order.status==="approved"?"success":
      order.status==="rejected"?"warn":"info";
    el("directTxidForm").hidden=isLtc(order)||["approved","rejected"].includes(order.status);
    el("directTxid").value=order.txid||"";
    clearPoll();
    if(opened && !["approved","rejected"].includes(order.status)){
      poll=setInterval(()=>{if(!busy)void reloadOrder();},isLtc(order)?12000:30000);
    }
  }
  async function loadOffers(){
    status("구매 가능한 코인·네트워크를 확인하고 있습니다...");
    try{
      const arr=await rpc("gp_direct_offers");
      offers=Array.isArray(arr)?arr:[];
      if(requestedDays){const ltc=offers.find(w=>w.coin==="ltc"&&w.network==="litecoin"&&w.prices?.[requestedDays]);if(ltc){el("directPayCoin").value="ltc";}}
      setupOptions();
      status(offers.length?
        "LTC는 자동 입금 확인 · 다른 코인은 관리자 검증 방식입니다. 송금 전 네트워크를 확인하세요.":
        "현재 공개된 결제 지갑이 없습니다. 관리자가 주소와 가격을 등록해야 구매할 수 있습니다.",!!offers.length);
    }catch(e){
      offers=[];setupOptions();status(e.message);
    }
  }
  function historyRow(order){
    const row=document.createElement("button");
    row.type="button";row.className="pay-history-row";
    const info=document.createElement("span"),title=document.createElement("strong");
    title.textContent=order.days+"일 VIP · "+order.coin.toUpperCase()+" / "+order.network;
    const small=document.createElement("small");
    small.textContent=order.amount+" "+order.coin.toUpperCase()+" · "+date(order.createdAt);
    info.append(title,small);
    const badge=document.createElement("em");
    badge.textContent=statuses[order.status]||order.status;
    row.append(info,badge);
    row.addEventListener("click",()=>renderOrder(order));
    return row;
  }
  async function loadHistory(){
    if(!bridge.getUser())return;
    try{
      const data=await rpc("gp_direct_my_orders");
      orders=Array.isArray(data)?data:[];
      const root=el("directPayHistory");
      if(!orders.length){
        const p=document.createElement("p");
        p.className="pay-history-empty";p.textContent="아직 결제 내역이 없습니다.";
        root.replaceChildren(p);
      }else root.replaceChildren(...orders.map(historyRow));
      if(selectedOrder){
        const updated=orders.find(x=>x.id===selectedOrder.id);
        if(updated)renderOrder(updated);
      }
    }catch{
      el("directPayHistory").textContent="결제 내역을 조회하지 못했습니다.";
    }
  }
  async function reloadOrder(){
    if(busy||!selectedOrder)return;
    await loadHistory();
  }
  async function createOrder(){
    if(busy)return;
    const wallet=currentWallet(),days=Number(el("directPayDays").value);
    if(!wallet||!wallet.prices?.[String(days)])return;
    busy=true;renderPreview();
    status("주문을 생성하고 있습니다...",true);
    try{
      const response=await rpc("gp_direct_create_order",{
        p_coin:wallet.coin,p_network:wallet.network,p_days:days
      });
      renderOrder(response.order);
      await loadHistory();
      status(isLtc(response.order)?"LTC 자동결제 주문 생성 완료! 주문 화면의 정확한 수량을 송금하세요.":"주문이 생성됐습니다. 송금 후 TXID를 접수해 주세요.",true);
    }catch(e){status(e.message);}
    finally{busy=false;renderPreview();}
  }
  async function submitTxid(event){
    event.preventDefault();
    if(busy||!selectedOrder)return;
    const txid=el("directTxid").value.trim();
    if(!/^[A-Za-z0-9:_/-]{16,140}$/.test(txid)){
      el("directOrderMessage").textContent="TXID의 길이 또는 문자를 확인해 주세요.";return;
    }
    busy=true;el("directTxidSubmit").disabled=true;
    try{
      const reply=await rpc("gp_direct_submit_txid",{
        p_order_id:selectedOrder.id,p_txid:txid
      });
      await loadHistory();
      const msg=el("directOrderMessage");
      msg.textContent=reply.message+" 입금 확인과 VIP 지급은 관리자 검증 후 진행됩니다.";
    }catch(e){el("directOrderMessage").textContent=e.message;}
    finally{busy=false;el("directTxidSubmit").disabled=false;}
  }
  async function copy(text){
    if(!text||text==="—")return;
    try{
      await navigator.clipboard.writeText(text);
      status("복사했습니다. 전송 전 네트워크를 확인하세요.",true);
    }catch{status("자동 복사할 수 없습니다. 내용을 길게 눌러 복사해 주세요.");}
  }
  let requestedDays=null;
  async function open(days=null){
    if(days!==null)requestedDays=String(days);
    if(!bridge.getUser()){bridge.openModal("login");return;}
    bridge.openModal("payment");
  }
  for(const id of ["memberPaymentOpen","vipLockedPaymentOpen"]){
    const button=el(id);if(button)button.addEventListener("click",()=>void open());
  }
  document.querySelectorAll("[data-gp-buy]").forEach(button=>{
    button.addEventListener("click",()=>void open(button.dataset.gpBuy));
  });
  el("directPayCoin").addEventListener("change",renderNetworks);
  el("directPayNetwork").addEventListener("change",renderDays);
  el("directPayDays").addEventListener("change",renderPreview);
  el("directPayCreate").addEventListener("click",()=>void createOrder());
  el("directPayCopyPreview").addEventListener("click",()=>void copy(currentWallet()?.address));
  el("directPayCopyTag").addEventListener("click",()=>void copy(currentWallet()?.tag));
  el("directOrderCopyAmount").addEventListener("click",()=>void copy(selectedOrder?.amount));
  el("directOrderCopyAddress").addEventListener("click",()=>void copy(selectedOrder?.address));
  el("directOrderCopyTag").addEventListener("click",()=>void copy(selectedOrder?.tag));
  el("directTxidForm").addEventListener("submit",submitTxid);
  el("directOrderRefresh").addEventListener("click",()=>void reloadOrder());
  el("directPayHistoryRefresh").addEventListener("click",()=>void loadHistory());
  el("directOrderNew").addEventListener("click",()=>{
    selectedOrder=null;clearPoll();el("directPayOrder").hidden=true;
    el("directPaySetup").hidden=false;renderPreview();
  });
  el("directPayBack").addEventListener("click",()=>bridge.setView("account"));
  window.addEventListener("goldpick:view",event=>{
    opened=event.detail?.name==="payment";
    if(!opened){++loadToken;clearPoll();return;}
    const stamp=++loadToken;
    setTimeout(async()=>{
      if(!opened||stamp!==loadToken)return;
      await loadOffers();
      if(!opened||stamp!==loadToken)return;
      await loadHistory();
    },0);
  });
  window.addEventListener("goldpick:session",event=>{
    if(event.detail?.event!=="SIGNED_OUT")return;
    opened=false;++loadToken;clearPoll();
    offers=[];orders=[];selectedOrder=null;
    el("directPayOrder").hidden=true;el("directPaySetup").hidden=false;
    el("directTxidForm").reset();
  });
})();
