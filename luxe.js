(() => {
  "use strict";
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const menu=$("#mobileNav"), menuToggle=$("#menuToggle");
  const progress=$("#progressFill"), header=$("#header");
  const stage=$("#sampleReview"), quote=$("#sampleText");
  const dots=$$("#reviewDots button");
  const sampleText=[
    "필요한 내용을 한눈에 살펴볼 수 있도록, 짧고 명확한 분석을 보여주는 화면을 구상했습니다.",
    "복잡한 설명 대신 핵심 근거를 먼저 확인할 수 있는 구조를 목표로 합니다.",
    "분석의 발행 시점과 근거를 명확하게 보여주는 기록 방식을 준비하고 있습니다."
  ];
  let selected=0,timer=null,ticking=false;
  const observer="IntersectionObserver" in window ? new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      entry.target.classList.add("show");observer.unobserve(entry.target);
    }
  },{threshold:.08,rootMargin:"0px 0px -24px 0px"}):null;
  $$(".reveal").forEach(el=>observer&&!reduced?observer.observe(el):el.classList.add("show"));

  function closeMenu(){menu.classList.remove("open");menuToggle.setAttribute("aria-expanded","false")}
  menuToggle.addEventListener("click",()=>{
    const open=menu.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded",String(open));
  });
  $$("#mobileNav a").forEach(a=>a.addEventListener("click",closeMenu));
  function onScroll(){
    const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    progress.style.width=(scrollY/max*100)+"%";
    header.classList.toggle("is-scrolled",scrollY>14);
    const anchor=scrollY+150;let current="";
    $$(".navlinks a[href^='#']").forEach(a=>{
      const el=$(a.getAttribute("href"));
      if(el&&el.offsetTop<=anchor)current=a.getAttribute("href");
    });
    $$(".navlinks a").forEach(a=>a.classList.toggle("current",a.getAttribute("href")===current));
  }
  addEventListener("scroll",()=>{
    if(ticking)return;
    ticking=true;requestAnimationFrame(()=>{onScroll();ticking=false});
  },{passive:true});
  addEventListener("resize",onScroll,{passive:true});onScroll();

  // Clearly labeled conceptual statements, not actual customer testimonials.
  function select(index){
    selected=(index+sampleText.length)%sampleText.length;
    quote.textContent=sampleText[selected];
    stage.classList.remove("fade");
    void stage.offsetWidth;
    if(!reduced)stage.classList.add("fade");
    dots.forEach((btn,i)=>{
      const active=i===selected;
      btn.classList.toggle("active",active);
      btn.setAttribute("aria-pressed",String(active));
    });
  }
  function stop(){if(timer){clearInterval(timer);timer=null}}
  function play(){stop();if(!reduced)timer=setInterval(()=>select(selected+1),5400)}
  dots.forEach((btn,i)=>btn.addEventListener("click",()=>{select(i);play()}));
  stage.addEventListener("mouseenter",stop);
  stage.addEventListener("mouseleave",play);
  stage.addEventListener("focusin",stop);
  stage.addEventListener("focusout",play);
  document.addEventListener("visibilitychange",()=>document.hidden?stop():play());
  select(0);play();
  if(matchMedia("(pointer: fine)").matches&&!reduced){
    $$(".feature").forEach(card=>card.addEventListener("pointermove",event=>{
      const r=card.getBoundingClientRect();
      card.style.setProperty("--mx",((event.clientX-r.left)/r.width*100)+"%");
      card.style.setProperty("--my",((event.clientY-r.top)/r.height*100)+"%");
    },{passive:true}));
  }
})();