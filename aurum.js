(() => {
  "use strict";
  const pages = new Set(["home", "research", "membership", "results", "login", "register", "admin"]);
  const sections = ["opening", "principles", "pillars", "workflow", "insights", "lab", "sports", "records", "faq", "finale"];
  const pageNodes = [...document.querySelectorAll(".page")];
  const nav = document.getElementById("nav");
  const menuButton = document.getElementById("menuToggle");
  const progress = document.getElementById("scrollProgress");
  const header = document.getElementById("header");
  const rail = document.getElementById("sectionRail");
  const topBtn = document.getElementById("backTop");
  const overlay = document.getElementById("modalOverlay");
  const closeModalButton = document.getElementById("modalClose");
  const hero = document.getElementById("hero");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = matchMedia("(max-width: 650px)").matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  let page = "home";
  let pendingSport = "";
  let focusBeforeModal = null;
  let scrollQueued = false;

  const demoArticles = {
    football: {
      title: "압박의 방향이 경기를 바꿀 때",
      body: "전방 압박은 단지 수비 활동량만 의미하지 않습니다. 어느 구역에서 공을 되찾는지, 공을 빼앗은 직후 어떤 선택을 하는지 등을 함께 살펴보면 경기 흐름을 더 깊이 이해할 수 있습니다."
    },
    basketball: {
      title: "공격 효율을 읽는 세 가지 관점",
      body: "득점만으로 공격의 질을 판단하기 어렵습니다. 경기 속도, 슛 선택, 세컨드 찬스 등을 종합하면 숫자에 가려진 팀의 플레이 스타일을 더 입체적으로 해석할 수 있습니다."
    },
    baseball: {
      title: "선발 투수를 숫자 너머에서 보기",
      body: "평균자책점 하나만으로 최근 흐름을 설명하기는 어렵습니다. 구종 비율, 투구 수, 이닝별 변화, 상대 타선의 성향을 함께 살펴보는 분석 접근을 소개합니다."
    },
    esports: {
      title: "드래프트에서 시작되는 전략",
      body: "같은 팀이라도 밴픽과 조합에 따라 운영 방향이 달라집니다. 최근 패치와 선수별 선호 전략이 경기 흐름의 맥락을 어떻게 바꾸는지 살펴봅니다."
    }
  };
  const labData = {
    football: {
      label: "TACTICAL RESEARCH",
      title: "경기 전환의 속도",
      text: "점유율 그 자체보다 볼을 회수하는 위치와 다음 선택의 방향을 함께 살펴봅니다.",
      chips: ["압박 위치", "전환 패턴", "경기 속도"],
      points: "8,176 54,145 98,160 144,101 193,124 237,66 287,92 339,42 390,57 444,21"
    },
    basketball: {
      label: "EFFICIENCY RESEARCH",
      title: "공격의 질을 읽다",
      text: "득점 외에도 슛 선택과 페이스, 세컨드 찬스가 만들어내는 변화를 비교합니다.",
      chips: ["페이스", "슛 선택", "리바운드"],
      points: "8,176 54,122 98,138 144,115 193,66 237,84 287,46 339,79 390,33 444,20"
    },
    baseball: {
      label: "MATCHUP RESEARCH",
      title: "매치업의 세부 조건",
      text: "투수의 구종 선택과 타선의 상대 성향을 별도의 지표로 나누어 살펴봅니다.",
      chips: ["구종 구성", "이닝 패턴", "타선 매치업"],
      points: "8,164 54,171 98,120 144,145 193,104 237,116 287,82 339,94 390,45 444,34"
    },
    esports: {
      label: "STRATEGY RESEARCH",
      title: "전략의 흐름과 메타",
      text: "드래프트, 패치와 팀별 운영의 차이를 연결해 흐름의 변화를 해석합니다.",
      chips: ["드래프트", "메타 변화", "팀 스타일"],
      points: "8,172 54,143 98,156 144,96 193,117 237,97 287,61 339,75 390,37 444,29"
    }
  };

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: .09, rootMargin: "0px 0px -35px 0px" })
    : null;

  function reveals() {
    document.querySelectorAll(".page.active .reveal:not(.visible)").forEach(el => {
      if (observer && !reduceMotion) observer.observe(el);
      else el.classList.add("visible");
    });
  }

  function closeMenu() {
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function selectFilter(category) {
    document.querySelectorAll("[data-filter]").forEach(btn => {
      const selected = btn.dataset.filter === category;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".article").forEach(article => {
      article.hidden = category !== "all" && article.dataset.category !== category;
    });
  }

  function route() {
    let raw = location.hash.slice(1);
    try { raw = decodeURIComponent(raw); } catch { raw = "home"; }
    page = pages.has(raw) ? raw : "home";
    const target = sections.includes(raw) ? document.getElementById(raw) : null;
    pageNodes.forEach(node => node.classList.toggle("active", node.id === page));
    document.querySelectorAll("[data-page]").forEach(link => {
      link.classList.toggle("active", link.dataset.page === page);
    });
    rail.hidden = page !== "home";
    closeMenu();
    if (page === "research" && pendingSport) {
      selectFilter(pendingSport);
      pendingSport = "";
    }
    requestAnimationFrame(() => {
      reveals();
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({top: Math.max(0, y), behavior: reduceMotion ? "instant" : "smooth"});
      } else {
        window.scrollTo({top: 0, behavior: "instant"});
      }
      updateScroll();
    });
    document.title = page === "home" ? "Gold Pick — The Game, Reimagined" :
      ({ research: "Research — Gold Pick", membership: "Membership — Gold Pick", results: "Track Record — Gold Pick", login: "Login — Gold Pick", register: "Register — Gold Pick", admin: "Admin Access — Gold Pick" }[page] || "Gold Pick");
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    progress.style.width = Math.max(0, Math.min(100, scrollY / max * 100)) + "%";
    header.classList.toggle("scrolled", scrollY > 15);
    topBtn.classList.toggle("shown", scrollY > 650);
    if (page === "home") {
      const checkpoint = scrollY + innerHeight * .42;
      let current = "opening";
      for (const name of sections) {
        const el = document.getElementById(name);
        if (el && el.offsetTop <= checkpoint) current = name;
      }
      document.querySelectorAll("#sectionRail a").forEach(link => {
        const active = link.hash === "#" + current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }
  }

  window.addEventListener("hashchange", route);
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  window.addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      updateScroll();
      scrollQueued = false;
    });
  }, { passive: true });
  window.addEventListener("resize", updateScroll, { passive: true });
  topBtn.addEventListener("click", () => { location.hash = "#opening"; });

  document.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => selectFilter(btn.dataset.filter));
  });
  document.querySelectorAll("[data-sport]").forEach(link => {
    link.addEventListener("click", () => {
      pendingSport = link.dataset.sport;
      if (location.hash === "#research") {
        selectFilter(pendingSport);
        pendingSport = "";
      }
    });
  });

  function setLab(category) {
    const data = labData[category] || labData.football;
    document.querySelectorAll("[data-lab]").forEach(btn => {
      const active = btn.dataset.lab === category;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    document.getElementById("labLabel").textContent = data.label;
    document.getElementById("labTitle").textContent = data.title;
    document.getElementById("labText").textContent = data.text;
    document.getElementById("labChips").replaceChildren(...data.chips.map(chip => {
      const el = document.createElement("span");
      el.textContent = chip;
      return el;
    }));
    const poly = document.getElementById("labLine");
    poly.setAttribute("points", data.points);
    poly.style.animation = "none";
    void poly.getBoundingClientRect();
    poly.style.animation = "";
    document.getElementById("labArea").setAttribute("points", "8,215 " + data.points + " 444,215");
  }
  document.querySelectorAll("[data-lab]").forEach(btn =>
    btn.addEventListener("click", () => setLab(btn.dataset.lab))
  );
  setLab("football");

  document.querySelectorAll(".faq button").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq");
      const opening = !item.classList.contains("open");
      document.querySelectorAll(".faq").forEach(faq => {
        faq.classList.remove("open");
        faq.querySelector("button").setAttribute("aria-expanded", "false");
      });
      item.classList.toggle("open", opening);
      btn.setAttribute("aria-expanded", String(opening));
    });
  });

  if (matchMedia("(pointer:fine)").matches && !reduceMotion) {
    document.querySelectorAll(".pillar").forEach(card => {
      card.addEventListener("pointermove", event => {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty("--mx", (100 * (event.clientX - bounds.left) / bounds.width) + "%");
        card.style.setProperty("--my", (100 * (event.clientY - bounds.top) / bounds.height) + "%");
      }, { passive: true });
    });
  }

  function closeModal() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lock");
    if (focusBeforeModal) focusBeforeModal.focus();
  }
  document.querySelectorAll("[data-article]").forEach(btn => {
    btn.addEventListener("click", () => {
      const data = demoArticles[btn.dataset.article];
      if (!data) return;
      focusBeforeModal = btn;
      document.getElementById("modalTitle").textContent = data.title;
      document.getElementById("modalText").textContent = data.body;
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("lock");
      closeModalButton.focus();
    });
  });
  closeModalButton.addEventListener("click", closeModal);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") {
      e.preventDefault();
      closeModalButton.focus();
    }
  });

  document.querySelectorAll(".demo-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const message = form.querySelector(".form-msg");
      if (!form.checkValidity()) {
        message.textContent = "이메일과 비밀번호 형식을 확인해 주세요.";
        return;
      }
      const p = form.querySelector('[name="password"]');
      const confirm = form.querySelector('[name="confirm"]');
      if (confirm && p.value !== confirm.value) {
        message.textContent = "비밀번호가 일치하지 않습니다.";
        return;
      }
      message.textContent = "현재 디자인 데모입니다. 입력한 정보는 서버에 저장되거나 전송되지 않습니다.";
    });
  });

  // Decorative star field: throttled on desktop, lighter on mobile; off for reduced-motion / data saver.
  const canvas = document.getElementById("starfield");
  if (canvas && hero && !reduceMotion && !saveData && "getContext" in canvas) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (ctx) {
      let width = 0, height = 0, scale = 1, sparks = [], running = false, previous = 0;
      const count = lowPower ? 16 : 48;
      function resizeCanvas() {
        width = hero.clientWidth;
        height = hero.clientHeight;
        scale = Math.min(devicePixelRatio || 1, 1.5);
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        sparks = Array.from({length: count}, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          r: .5 + Math.random() * 1.6,
          vy: .11 + Math.random() * .3,
          drift: (Math.random() - .5) * .16,
          light: .2 + Math.random() * .5
        }));
      }
      function draw(time) {
        if (!running) return;
        requestAnimationFrame(draw);
        if (time - previous < (lowPower ? 50 : 36)) return;
        previous = time;
        ctx.clearRect(0, 0, width, height);
        sparks.forEach(s => {
          s.y -= s.vy;
          s.x += s.drift;
          if (s.y < -4) { s.y = height + 4; s.x = Math.random() * width; }
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(236,202,137," + s.light + ")";
          ctx.fill();
        });
      }
      resizeCanvas();
      const visibility = "IntersectionObserver" in window
        ? new IntersectionObserver(entries => {
          if (entries[0].isIntersecting && !document.hidden) {
            if (!running) { running = true; requestAnimationFrame(draw); }
          } else running = false;
        }, {threshold:0})
        : null;
      if (visibility) visibility.observe(hero);
      else { running = true; requestAnimationFrame(draw); }
      window.addEventListener("resize", resizeCanvas, {passive:true});
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) running = false;
        else if (hero.getBoundingClientRect().bottom > 0 && !running) {
          running = true;
          requestAnimationFrame(draw);
        }
      });
    }
  }

  route();
  updateScroll();
})();
