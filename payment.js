/* Gold Pick crypto checkout — public UI. VIP rights come ONLY from the server. */
(() => {
  "use strict";
  const bridge = window.GOLDPICK_MEMBER_BRIDGE;
  if (!bridge) return;
  const el = id => document.getElementById(id);
  const cfg = window.GOLDPICK_PAYMENT_CONFIG || {};
  const apiBase = typeof cfg.apiBase === "string" ? cfg.apiBase.replace(/\/$/, "") : "";
  const apiOK = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(apiBase);
  let settings = null;
  let selectedOrder = null;
  let pollTimer = null;
  let busy = false;
  let viewOpen = false;
  let initId = 0;

  const koStatus = {
    creating:"주소 발급 중", waiting:"입금 대기", confirming:"입금 확인 중",
    confirmed:"블록체인 확인됨", sending:"정산 처리 중",
    finished:"VIP 지급 완료", partially_paid:"입금액 부족",
    expired:"결제 시간 만료", failed:"결제 실패",
    refunded:"환불 처리", needs_review:"관리자 검토 필요",
    verifying:"재확인 중"
  };
  const label = name => koStatus[name] || "확인 중";
  const setText = (id, str) => { el(id).textContent = String(str); };
  const date = iso => iso ? new Date(iso).toLocaleString("ko-KR",{
    year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"
  }) : "—";
  const coinLabel = code => settings?.coins?.find(x=>x.id===code)?.label || String(code||"");
  const option = (value,text) => {
    const node = document.createElement("option");
    node.value=String(value); node.textContent=text; return node;
  };
  function message(text,kind="info") {
    const box=el("payWaiting");box.textContent=text;box.dataset.kind=kind;
  }
  function connection(text,ready=false) {
    const node=el("payConnection");
    node.textContent=text;node.dataset.state=ready?"ready":"pending";
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer=null;
  }
  async function request(path, {method="GET", data, auth=true}={}) {
    if (!apiOK) throw new Error("코인 결제 서버가 연결되지 않았습니다.");
    const headers={"Content-Type":"application/json"};
    if (auth) {
      const client=bridge.getClient();
      if (!client || !bridge.getUser()) throw new Error("로그인이 필요합니다.");
      const {data:sessionData,error}=await client.auth.getSession();
      if (error || !sessionData?.session?.access_token) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      headers.Authorization="Bearer "+sessionData.session.access_token;
    }
    const res=await fetch(apiBase+path,{
      method,headers,cache:"no-store",
      body:data===undefined?undefined:JSON.stringify(data)
    });
    const body=await res.json().catch(()=>({}));
    if (!res.ok || body?.ok===false) {
      throw new Error(typeof body.message==="string" ? body.message :
        "결제 서버에 연결할 수 없습니다. ("+res.status+")");
    }
    return body;
  }
  async function loadSettings() {
    if (!apiOK) {
      settings={enabled:false,plans:[],coins:[]};
      connection("코인 결제 설정 전 · 현재 실제 입금은 받지 않습니다.");
      renderSettings();
      return;
    }
    connection("코인 결제 서버를 확인하고 있습니다...");
    try {
      settings=await request("/v1/config",{auth:false});
      connection(settings.enabled
        ? "코인 결제 연동 준비 완료 · 송금 주소는 결제 요청 시 발급됩니다."
        : "코인 결제 서비스 준비 중 · 현재 입금은 받지 않습니다.",!!settings.enabled);
    } catch {
      settings={enabled:false,plans:[],coins:[]};
      connection("결제 서비스에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.");
    }
    renderSettings();
  }
  function renderSettings() {
    const plans=el("payDays"),coins=el("payCoin");
    const oldDay=plans.value,oldCoin=coins.value;
    plans.replaceChildren(...(settings?.plans?.length
      ? settings.plans.map(x=>option(x.days,x.days+"일 VIP · $"+Number(x.usd).toFixed(2)))
      : [option("","가격 설정 전")]));
    coins.replaceChildren(...(settings?.coins?.length
      ? settings.coins.map(x=>option(x.id,x.label))
      : [option("","코인 미설정")]));
    if([...plans.options].some(x=>x.value===oldDay)) plans.value=oldDay;
    if([...coins.options].some(x=>x.value===oldCoin)) coins.value=oldCoin;
    plans.disabled=!settings?.enabled || busy;
    coins.disabled=!settings?.enabled || busy;
    el("payCreate").disabled=!settings?.enabled || busy;
    renderPrice();
  }
  function renderPrice() {
    const selected=settings?.plans?.find(p=>String(p.days)===el("payDays").value);
    setText("payPrice",selected?"USD $"+Number(selected.usd).toFixed(2):"가격 설정 전");
  }
  function renderOrder(order) {
    if (!order) return;
    selectedOrder=order;
    el("payPurchase").hidden=true;
    el("payInvoice").hidden=false;
    setText("payInvoiceStatus",label(order.status));
    setText("payAmount",String(order.amount||"—")+" "+(order.coin||"").toUpperCase());
    setText("payAddress",order.address||"—");
    setText("payNetwork",coinLabel(order.coin));
    setText("payMemo",order.memo||"—");
    el("payMemoWrap").hidden=!order.memo;
    setText("payInvoicePrice",order.days+"일 VIP · USD $"+Number(order.priceUsd).toFixed(2));
    setText("payExpires","결제 생성: "+date(order.createdAt));
    if (order.paid) {
      message("결제 완료! VIP 이용권이 지급됐습니다. 마이페이지에서 확인해 주세요.","success");
    } else if (["failed","expired","refunded"].includes(order.status)) {
      message("결제 요청이 "+label(order.status)+" 상태입니다. 입금했다면 TXID를 제출해 주세요.","warn");
    } else if (order.status==="needs_review") {
      message("결제 정보에 추가 확인이 필요합니다. TXID를 등록하고 운영자에게 문의해 주세요.","warn");
    } else if (order.status==="partially_paid") {
      message("입금액이 부족하다고 확인됐습니다. 운영자에게 문의해 주세요.","warn");
    } else if (order.status==="confirmed" || order.status==="sending") {
      message("입금이 감지됐습니다. 결제 서비스의 최종 완료를 확인하는 중입니다.","info");
    } else if (order.submittedTxid) {
      message("TXID가 접수됐습니다. 입금 정보를 재검증 중이며, 미확인 시 운영자 검토가 필요합니다.","info");
    } else {
      message("입금 감지 중 · 정확한 코인과 네트워크로 표시된 수량을 보내주세요.","info");
    }
    el("payRefresh").disabled=busy || !!order.paid;
    if (order.submittedTxid) el("payTxid").value=order.submittedTxid;
    stopPoll();
    if (!order.paid && viewOpen) {
      pollTimer=setInterval(() => {
        if (!busy && selectedOrder?.id===order.id) void refreshOrder(true);
      },20000);
    }
  }
  async function openPayment() {
    if (!bridge.getUser()) {bridge.openModal("login");return;}
    bridge.openModal("payment");
  }
  async function loadHistory() {
    if (!settings?.enabled || !bridge.getUser()) return;
    try {
      const {orders}=await request("/v1/orders");
      const list=el("payHistoryList");
      if (!orders?.length) {
        const empty=document.createElement("p");empty.className="pay-history-empty";
        empty.textContent="아직 생성된 결제 내역이 없습니다.";
        list.replaceChildren(empty);return;
      }
      list.replaceChildren(...orders.map(order=>{
        const button=document.createElement("button");
        button.type="button";button.className="pay-history-row";
        const left=document.createElement("span");
        const title=document.createElement("strong");
        title.textContent=order.days+"일 VIP · "+date(order.createdAt);
        const secondary=document.createElement("small");
        secondary.textContent=Number(order.priceUsd).toFixed(2)+" USD · "+coinLabel(order.coin);
        left.append(title,secondary);
        const right=document.createElement("em");
        right.textContent=order.paid?"완료":label(order.status);
        button.append(left,right);
        button.addEventListener("click",()=>{
          renderOrder(order);
          void refreshOrder(true);
        });
        return button;
      }));
    } catch {
      const empty=document.createElement("p");empty.className="pay-history-empty";
      empty.textContent="결제 내역을 불러오지 못했습니다.";
      el("payHistoryList").replaceChildren(empty);
    }
  }
  async function refreshOrder(silent=false) {
    if (!selectedOrder || busy) return;
    const orderId=selectedOrder.id;
    try {
      if (!silent) message("결제 상태를 새로 확인하고 있습니다...");
      const res=await request("/v1/orders/"+encodeURIComponent(orderId));
      if (!viewOpen || selectedOrder?.id!==orderId) return;
      const oldPaid=!!selectedOrder.paid;
      renderOrder(res.order);
      if (!oldPaid && res.order.paid) {
        await loadHistory();
        // Moving to My Page triggers a fresh membership lookup.
      }
    } catch (err) {
      if (!silent && viewOpen) message(err.message,"warn");
    }
  }
  async function createOrder() {
    if (busy || !settings?.enabled) return;
    const days=Number(el("payDays").value);
    const coin=el("payCoin").value;
    busy=true;el("payCreate").disabled=true;
    connection("새 결제 요청과 고유 입금 주소를 발급하고 있습니다...",true);
    try {
      const res=await request("/v1/orders",{method:"POST",data:{days,coin}});
      renderOrder(res.order);
      await loadHistory();
      connection("입금 대기 · 아래 금액과 주소를 확인해 주세요.",true);
    } catch (err) {
      connection("결제 주소를 발급하지 못했습니다. 입금하지 마세요.");
      message(err.message,"warn");
      const banner=el("payConnection");banner.textContent+=" "+err.message;
    } finally {
      busy=false;
      renderSettings();
      if (selectedOrder) el("payRefresh").disabled=!!selectedOrder.paid;
    }
  }
  async function submitTxid(event) {
    event.preventDefault();
    const order=selectedOrder;
    if (!order || busy) return;
    const txid=el("payTxid").value.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
      message("트랜잭션 ID는 64자리 16진수여야 합니다.","warn");return;
    }
    busy=true;
    const submit=el("payTxidForm").querySelector('[type="submit"]');
    submit.disabled=true;
    try {
      const res=await request("/v1/orders/"+encodeURIComponent(order.id)+"/txid",{
        method:"POST",data:{txid}
      });
      if (selectedOrder?.id===order.id) {
        renderOrder(res.order);
        if (!res.order.paid) message(res.message+" 거래 확인이 완료되지 않으면 운영자 검토가 필요합니다.","info");
      }
      await loadHistory();
    } catch (err) {
      message(err.message,"warn");
    } finally {
      busy=false;submit.disabled=false;
    }
  }
  async function copyText(id) {
    const txt=el(id).textContent.trim();
    if (!txt || txt==="—") return;
    try {
      await navigator.clipboard.writeText(id==="payAmount"?txt.split(" ")[0]:txt);
      message("클립보드에 복사했습니다. 코인과 네트워크를 반드시 확인해 주세요.","info");
    } catch {
      message("복사할 수 없습니다. 주소 또는 수량을 길게 눌러 복사해 주세요.","warn");
    }
  }
  async function initialize() {
    const call=++initId;
    viewOpen=true;
    await loadSettings();
    if (!viewOpen || call!==initId) return;
    if (settings?.enabled) {
      await loadHistory();
    }
  }
  for (const id of ["memberPaymentOpen","planPaymentOpen","vipLockedPaymentOpen"]) {
    el(id).addEventListener("click",()=>void openPayment());
  }
  el("payBackAccount").addEventListener("click",()=>bridge.setView("account"));
  el("payDays").addEventListener("change",renderPrice);
  el("payCreate").addEventListener("click",()=>void createOrder());
  el("payRefresh").addEventListener("click",()=>void refreshOrder());
  el("payHistoryReload").addEventListener("click",()=>void loadHistory());
  el("payNewOrder").addEventListener("click",()=>{
    stopPoll();selectedOrder=null;
    el("payInvoice").hidden=true;el("payPurchase").hidden=false;
    renderSettings();
  });
  el("payCopyAmount").addEventListener("click",()=>void copyText("payAmount"));
  el("payCopyAddress").addEventListener("click",()=>void copyText("payAddress"));
  el("payCopyMemo").addEventListener("click",()=>void copyText("payMemo"));
  el("payTxidForm").addEventListener("submit",submitTxid);
  window.addEventListener("goldpick:view",event=>{
    if (event.detail?.name!=="payment") {
      viewOpen=false;++initId;stopPoll();
      return;
    }
    void initialize();
  });
  window.addEventListener("goldpick:session",event=>{
    if (event.detail?.event!=="SIGNED_OUT") return;
    viewOpen=false;++initId;stopPoll();selectedOrder=null;
    el("payInvoice").hidden=true;el("payPurchase").hidden=false;
    el("payTxidForm").reset();
  });
})();
