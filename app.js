(() => {
  "use strict";
  const pages = [...document.querySelectorAll(".page")];
  const nav = document.getElementById("nav");
  const menuButton = document.getElementById("menuButton");
  const overlay = document.getElementById("modalOverlay");
  const closeButton = document.getElementById("modalClose");
  const modal = overlay.querySelector(".modal");
  let pendingSport = "";
  let previousFocus = null;
  const allowed = new Set(["home","research","membership","results","login","register","admin"]);
  const previews = {
    football: {
      title: "압박의 방향이 경기를 바꿀 때",
      text: "전방 압박은 수비 활동량만 의미하지 않습니다. 어느 구역에서 공을 되찾는지, 공을 빼앗은 직후 어떤 선택을 하는지 등을 함께 살펴볼 때 경기 흐름을 더 깊이 이해할 수 있습니다."
    },
    basket: {
      title: "공격 효율을 읽는 세 가지 관점",
      text: "득점만으로 공격의 질을 판단하기 어렵습니다. 경기 속도, 슛 선택, 세컨드 찬스 등을 함께 고려하면 숫자 뒤에 숨은 팀의 방향성을 확인할 수 있습니다."
    },
    baseball: {
      title: "선발 투수를 숫자 너머에서 보기",
      text: "평균자책점 하나만으로 투수의 최근 상태를 설명할 수 없습니다. 구종 비율, 투구 수, 이닝별 변화, 상대 타선의 성향 등을 종합적으로 살펴봐야 합니다."
    },
    esports: {
      title: "드래프트에서 시작되는 전략",
      text: "동일한 팀이라도 밴픽과 조합 구성에 따라 경기 운영 방향이 달라집니다. 최근 패치와 선수별 선호 전략까지 함께 살펴보는 접근을 소개합니다."
    }
  };

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .08 })
    : null;

  function revealElements() {
    document.querySelectorAll(".page.active .reveal:not(.visible)").forEach(el => {
      if (observer) observer.observe(el);
      else el.classList.add("visible");
    });
  }

  function closeMenu() {
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function setFilter(category) {
    document.querySelectorAll("[data-filter]").forEach(button => {
      const active = button.dataset.filter === category;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll(".article").forEach(article => {
      article.hidden = category !== "all" && article.dataset.category !== category;
    });
  }

  function route() {
    const hash = location.hash.slice(1);
    const page = allowed.has(hash) ? hash : "home";
    pages.forEach(el => el.classList.toggle("active", el.id === page));
    document.querySelectorAll("[data-route]").forEach(el =>
      el.classList.toggle("active", el.dataset.route === page)
    );
    if (page === "research" && pendingSport) {
      setFilter(pendingSport);
      pendingSport = "";
    }
    closeMenu();
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(revealElements);
  }

  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  window.addEventListener("hashchange", route);
  document.querySelectorAll("[data-filter]").forEach(button =>
    button.addEventListener("click", () => setFilter(button.dataset.filter))
  );
  document.querySelectorAll("[data-sport]").forEach(link => {
    link.addEventListener("click", () => {
      if (location.hash === "#research") setFilter(link.dataset.sport);
      else pendingSport = link.dataset.sport;
    });
  });

  if (window.matchMedia("(pointer:fine) and (prefers-reduced-motion:no-preference)").matches) {
    document.querySelectorAll(".interactive").forEach(card => {
      card.addEventListener("pointermove", e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (100 * (e.clientX - r.left) / r.width) + "%");
        card.style.setProperty("--my", (100 * (e.clientY - r.top) / r.height) + "%");
      }, { passive: true });
    });
  }

  function closeModal() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (previousFocus) previousFocus.focus();
  }

  document.querySelectorAll("[data-article]").forEach(button => {
    button.addEventListener("click", () => {
      const article = previews[button.dataset.article];
      if (!article) return;
      previousFocus = button;
      document.getElementById("modalTitle").textContent = article.title;
      document.getElementById("modalText").textContent = article.text;
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      closeButton.focus();
    });
  });
  closeButton.addEventListener("click", closeModal);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener("keydown", event => {
    if (!overlay.classList.contains("open")) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab") {
      // The close control is the only interactive control in the dialog.
      event.preventDefault();
      closeButton.focus();
    }
  });

  document.querySelectorAll(".demo-form").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
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
      message.textContent = "현재 디자인 데모입니다. 실제 계정은 생성되지 않으며 입력한 정보는 서버로 전송되지 않습니다.";
    });
  });
  route();
})();