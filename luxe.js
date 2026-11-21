(() => {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const menu = $("#mobileNav"), menuToggle = $("#menuToggle");
  const overlay = $("#loginOverlay"), loginOpen = $("#loginOpen"), loginClose = $("#loginClose");
  const form = $("#loginForm");
  const progress = $("#progressFill");
  const header = $("#header");
  const revCard = $("#sampleReview");
  const revText = $("#sampleText");
  const revDots = $$("#reviewDots button");
  const reviewSamples = [
    "필요한 내용을 한눈에 살펴볼 수 있도록, 짧고 명확한 분석을 보여주는 화면을 구상했습니다.",
    "복잡한 설명 대신 핵심 근거를 먼저 확인할 수 있는 구조를 목표로 합니다.",
    "분석의 발행 시점과 근거를 명확하게 보여주는 기록 방식을 준비하고 있습니다."
  ];
  let activeReview = 0, reviewTimer;

  const revealObserver = "IntersectionObserver" in window ?
    new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
          revealObserver.unobserve(entry.target);
        }
      });
    }, {threshold:.09,rootMargin:"0px 0px -24px 0px"}) : null;
  $$(".reveal").forEach(el => {
    if (revealObserver && !reduced) revealObserver.observe(el);
    else el.classList.add("show");
  });

  function navClose() {
    menu.classList.remove("open");
    menuToggle.setAttribute("aria-expanded","false");
  }
  menuToggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded",String(open));
  });
  $$("#mobileNav a").forEach(a => a.addEventListener("click",navClose));

  function onScroll() {
    const max = Math.max(1,document.documentElement.scrollHeight-innerHeight);
    progress.style.width = (scrollY/max*100)+"%";
    header.classList.toggle("is-scrolled",scrollY>14);
    const anchor = scrollY + 150;
    let selected="";
    $$(".navlinks a[href^='#']").forEach(a => {
      const target = $(a.getAttribute("href"));
      if (target && target.offsetTop <= anchor) selected = a.getAttribute("href");
    });
    $$(".navlinks a").forEach(a => a.classList.toggle("current",a.getAttribute("href") === selected));
  }
  let ticking=false;
  addEventListener("scroll",() => {
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(() => {onScroll();ticking=false});
  },{passive:true});
  addEventListener("resize",onScroll,{passive:true});
  onScroll();

  // This area is explicitly a demo of the review visual style,
  // not representations by actual customers.
  function setSample(index) {
    activeReview=(index+reviewSamples.length)%reviewSamples.length;
    revText.textContent=reviewSamples[activeReview];
    revCard.classList.remove("fade");
    void revCard.offsetWidth;
    if (!reduced) revCard.classList.add("fade");
    revDots.forEach((btn,i) => {
      btn.classList.toggle("active",i===activeReview);
      btn.setAttribute("aria-pressed",String(i===activeReview));
    });
  }
  function stopReview(){if(reviewTimer){clearInterval(reviewTimer);reviewTimer=null}}
  function playReview(){
    stopReview();
    if (!reduced) reviewTimer=setInterval(()=>setSample(activeReview+1),5400);
  }
  revDots.forEach((btn,i)=>btn.addEventListener("click",()=>{setSample(i);playReview()}));
  revCard.addEventListener("mouseenter",stopReview);
  revCard.addEventListener("mouseleave",playReview);
  revCard.addEventListener("focusin",stopReview);
  revCard.addEventListener("focusout",playReview);
  document.addEventListener("visibilitychange",()=>document.hidden?stopReview():playReview());
  setSample(0);playReview();

  if(matchMedia("(pointer:fine)").matches && !reduced){
    $$(".feature").forEach(card=>{
      card.addEventListener("pointermove",event=>{
        const r=card.getBoundingClientRect();
        card.style.setProperty("--mx",((event.clientX-r.left)/r.width*100)+"%");
        card.style.setProperty("--my",((event.clientY-r.top)/r.height*100)+"%");
      },{passive:true});
    });
  }

  function showLogin(){
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden","false");
    document.body.classList.add("locked");
    navClose();
    loginClose.focus();
  }
  function hideLogin(){
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden","true");
    document.body.classList.remove("locked");
    loginOpen.focus();
  }
  loginOpen.addEventListener("click",showLogin);
  loginClose.addEventListener("click",hideLogin);
  overlay.addEventListener("click",e=>{if(e.target===overlay)hideLogin()});
  document.addEventListener("keydown",e=>{
    if(!overlay.classList.contains("open"))return;
    if(e.key==="Escape")hideLogin();
    if(e.key==="Tab"){
      const focusable=$$("input,button:not([disabled])",overlay);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  form.addEventListener("submit",e=>{
    e.preventDefault();
    $("#loginFeedback").textContent=form.checkValidity()?
      "지금은 화면 미리보기 단계입니다. 계정 정보가 전송되거나 저장되지 않습니다.":
      "이메일과 비밀번호를 확인해 주세요.";
  });
})();