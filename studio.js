(() => {
  "use strict";
  const pageIds = new Set(["home", "research", "membership", "results", "login", "register", "admin"]);
  const sectionIds = new Set(["opening", "belief", "why", "process", "standards", "sports", "questions", "closing"]);
  const pages = [...document.querySelectorAll(".page")];
  const nav = document.getElementById("nav");
  const menuButton = document.getElementById("menuToggle");
  const progress = document.getElementById("scrollFill");
  const header = document.getElementById("header");
  const rail = document.getElementById("sectionRail");
  const overlay = document.getElementById("modalOverlay");
  const modalClose = document.getElementById("modalClose");
  const previousTitle = document.title;
  let currentPage = "home";
  let pendingSport = null;
  let returnFocus = null;
  let scrollingScheduled = false;

  const articles = {
    football: {
      title: "압박의 방향이 경기를 바꿀 때",
      description: "전방 압박은 단지 수비 활동량만 의미하지 않습니다. 어느 구역에서 공을 되찾는지, 공을 빼앗은 직후 어떤 선택을 하는지 등을 함께 살펴볼 때 경기의 전환 흐름을 더 깊이 이해할 수 있습니다."
    },
    basketball: {
      title: "공격 효율을 읽는 세 가지 관점",
      description: "득점만으로 공격의 질을 판단하기는 어렵습니다. 경기 속도, 슛 선택, 세컨드 찬스 등을 종합하면 숫자에 가려진 팀의 플레이 스타일을 좀 더 입체적으로 해석할 수 있습니다."
    },
    baseball: {
      title: "선발 투수를 숫자 너머에서 보기",
      description: "평균자책점 하나만으로 투수의 최근 흐름을 설명할 수 없습니다. 구종 비율, 투구 수, 이닝별 변화, 상대 타선의 성향까지 함께 살펴보는 분석 접근을 소개합니다."
    },
    esports: {
      title: "드래프트에서 시작되는 전략",
      description: "같은 팀이라도 밴픽과 조합에 따라 경기 운영 방향이 바뀝니다. 최근 패치와 선수별 선호 전략이 게임의 맥락을 어떻게 바꾸는지 살펴봅니다."
    }
  };

  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      entries.forEach(({target, isIntersecting}) => {
        if (isIntersecting) {
          target.classList.add("visible");
          revealObserver.unobserve(target);
        }
      });
    }, {threshold: 0.1, rootMargin: "0px 0px -35px 0px"})
    : null;

  function showReveals() {
    document.querySelectorAll(".page.active .reveal").forEach(el => {
      if (el.classList.contains("visible")) return;
      if (revealObserver) revealObserver.observe(el);
      else el.classList.add("visible");
    });
  }

  function closeMenu() {
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function selectFilter(category) {
    document.querySelectorAll("[data-filter]").forEach(button => {
      const selected = button.dataset.filter === category;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".article").forEach(article => {
      article.hidden = category !== "all" && article.dataset.category !== category;
    });
  }

  function route() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const page = pageIds.has(hash) ? hash : "home";
    const targetSection = sectionIds.has(hash) ? document.getElementById(hash) : null;
    currentPage = page;

    pages.forEach(el => {
      el.classList.toggle("active", el.id === page);
    });
    document.querySelectorAll("[data-page]").forEach(el => {
      el.classList.toggle("active", el.dataset.page === page);
    });
    if (rail) rail.hidden = page !== "home";
    closeMenu();

    if (page === "research" && pendingSport) {
      selectFilter(pendingSport);
      pendingSport = null;
    }

    requestAnimationFrame(() => {
      showReveals();
      if (targetSection) {
        const offset = targetSection.getBoundingClientRect().top + window.scrollY - 74;
        window.scrollTo({top: Math.max(0, offset), behavior: "smooth"});
      } else {
        window.scrollTo({top: 0, behavior: "instant"});
      }
      updateScroll();
    });

    document.title = page === "home" ? previousTitle : ({
      research: "Research — Gold Pick",
      membership: "Membership — Gold Pick",
      results: "Track Record — Gold Pick",
      login: "Login — Gold Pick",
      register: "Join — Gold Pick",
      admin: "Access — Gold Pick"
    }[page] || previousTitle);
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progress.style.width = Math.min(100, Math.max(0, 100 * window.scrollY / max)) + "%";
    header.classList.toggle("is-scrolled", window.scrollY > 15);
    if (currentPage === "home") {
      const midpoint = window.scrollY + window.innerHeight * 0.42;
      let active = "opening";
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= midpoint) active = id;
      }
      document.querySelectorAll("#sectionRail a").forEach(a => {
        const isActive = a.hash === "#" + active;
        a.classList.toggle("active", isActive);
        if (isActive) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", () => {
    if (!scrollingScheduled) {
      scrollingScheduled = true;
      requestAnimationFrame(() => {
        updateScroll();
        scrollingScheduled = false;
      });
    }
  }, {passive: true});
  window.addEventListener("resize", updateScroll, {passive: true});
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });

  document.querySelectorAll("[data-sport]").forEach(el => {
    el.addEventListener("click", () => {
      pendingSport = el.dataset.sport;
      if (location.hash === "#research") {
        selectFilter(pendingSport);
        pendingSport = null;
      }
    });
  });
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => selectFilter(button.dataset.filter));
  });

  if (window.matchMedia("(pointer:fine) and (prefers-reduced-motion:no-preference)").matches) {
    document.querySelectorAll(".hoverlight").forEach(card => {
      card.addEventListener("pointermove", e => {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - bounds.left) / bounds.width * 100).toFixed(2) + "%");
        card.style.setProperty("--my", ((e.clientY - bounds.top) / bounds.height * 100).toFixed(2) + "%");
      }, {passive: true});
    });
  }

  document.querySelectorAll(".faq-item button").forEach(button => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const shouldOpen = !item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach(el => {
        el.classList.remove("open");
        el.querySelector("button").setAttribute("aria-expanded", "false");
      });
      item.classList.toggle("open", shouldOpen);
      button.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  function closeModal() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
    if (returnFocus) returnFocus.focus();
  }
  document.querySelectorAll("[data-article]").forEach(button => {
    button.addEventListener("click", () => {
      const article = articles[button.dataset.article];
      if (!article) return;
      returnFocus = button;
      document.getElementById("modalTitle").textContent = article.title;
      document.getElementById("modalText").textContent = article.description;
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("locked");
      modalClose.focus();
    });
  });
  modalClose.addEventListener("click", closeModal);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") {
      e.preventDefault();
      modalClose.focus();
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
      const password = form.querySelector('[name="password"]');
      const confirmation = form.querySelector('[name="confirm"]');
      if (confirmation && password.value !== confirmation.value) {
        message.textContent = "비밀번호 확인이 일치하지 않습니다.";
        return;
      }
      message.textContent = "현재 화면 데모입니다. 입력한 정보는 저장되거나 전송되지 않습니다.";
    });
  });

  route();
  updateScroll();
})();
