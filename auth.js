(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const modal = $("#loginOverlay");
  const closeButton = $("#loginClose");
  const loginOpen = $("#loginOpen");
  const signupOpen = $("#signupOpen");
  const notice = $("#authNotice");
  const banner = $("#authConnectStatus");
  const views = $$(".auth-view");
  const forms = $$(".auth-form");
  const errorMessages = {
    invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
    email_provider_disabled: "Supabase에서 이메일 회원가입 기능이 꺼져 있습니다. Authentication → Providers → Email을 확인해 주세요.",
    email_exists: "이미 등록된 이메일일 수 있습니다. 로그인 또는 비밀번호 찾기를 이용해 주세요.",
    unexpected_failure: "인증 서버 내부 오류입니다. 가입 중이었다면 인증 메일 발송 또는 데이터베이스 설정을 확인해 주세요.",
    request_timeout: "인증 요청 시간이 초과됐습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    captcha_failed: "인증 문자 또는 보안 검증이 실패했습니다. 설정을 확인해 주세요.",
    email_not_confirmed: "Supabase에서 이메일 인증이 활성화되어 있습니다. Authentication → Providers → Email에서 Confirm email을 꺼 주세요.",
    weak_password: "비밀번호가 너무 단순합니다. 더 안전하게 설정해 주세요.",
    user_already_exists: "이미 등록된 이메일입니다.",
    email_address_not_authorized: "현재 테스트용 이메일만 발송할 수 있습니다. 운영자에게 메일 설정을 요청해 주세요.",
    over_email_send_rate_limit: "이메일 발송 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    over_request_rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    too_many_requests: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    otp_expired: "링크의 유효기간이 지났습니다. 새 링크를 요청해 주세요.",
    signup_disabled: "현재 신규 가입이 비활성화되어 있습니다.",
    validation_failed: "입력 정보를 다시 확인해 주세요."
  };
  let client = null;
  let currentUser = null;
  let recoveryMode = false;
  let activeView = "login";
  let lastFocused = null;
  let connected = false;

  const config = window.GOLDPICK_AUTH_CONFIG || {};
  const url = typeof config.url === "string" ? config.url.trim().replace(/\/$/, "") : "";
  const key = typeof config.publishableKey === "string" ? config.publishableKey.trim() : "";
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
  const validKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);

  function setNotice(message, type = "info") {
    notice.textContent = message || "";
    notice.dataset.kind = type;
  }

  function setBanner(text, state = "pending") {
    banner.textContent = text;
    banner.dataset.state = state;
  }

  function setView(name) {
    if (name === "account" && !currentUser) name = "login";
    activeView = name;
    views.forEach(view => {
      view.hidden = view.dataset.view !== name;
    });
    setNotice("");
    if (name === "account") {
      $("#accountEmail").textContent = currentUser?.email || "이메일 정보 없음";
      $("#accountVerified").textContent = currentUser?.email_confirmed_at ? "이메일 인증됨" : "이메일 미인증";
    }
    const currentTitle = $(".auth-view:not([hidden]) h2");
    if (currentTitle) $("#authDialog").setAttribute("aria-labelledby", currentTitle.id);
  }

  function openModal(view) {
    lastFocused = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    setView(view || (currentUser ? "account" : "login"));
    closeButton.focus();
  }
  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  loginOpen.addEventListener("click", () => openModal(currentUser ? "account" : "login"));
  signupOpen?.addEventListener("click", () => openModal("signup"));
  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", event => {
    if (!modal.classList.contains("open")) return;
    if (event.key === "Escape") {
      closeModal();
      return;
    }
    if (event.key === "Tab") {
      const available = $$("button:not(:disabled), input:not(:disabled), a[href]", $("#authDialog"))
        .filter(element => element.offsetParent !== null);
      if (!available.length) return;
      const first = available[0], last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });

  $$("[data-auth-view]").forEach(button => {
    button.addEventListener("click", () => setView(button.dataset.authView));
  });

  function updateHeader() {
    $("#loginLabel").textContent = currentUser ? "마이페이지" : "로그인";
    document.documentElement.classList.toggle("authenticated", Boolean(currentUser));
    if (currentUser && activeView === "account") setView("account");
  }

  function simpleError(error, context = "") {
    if (!error) return "원인을 확인할 수 없는 오류입니다.";
    const code = String(error.code || "").slice(0, 60).replace(/[^a-zA-Z0-9_-]/g, "");
    const status = Number(error.status);
    const message = String(error.message || "").toLowerCase();
    let explanation = errorMessages[code] || "";
    if (!explanation) {
      if (message.includes("email address not authorized") || message.includes("default smtp")) {
        explanation = errorMessages.email_address_not_authorized;
      } else if (message.includes("error sending confirmation email") || message.includes("error sending recovery email")) {
        explanation = "인증 메일 발송에 실패했습니다. Supabase의 SMTP 설정과 이메일 발송 제한을 확인해 주세요.";
      } else if (message.includes("email not confirmed")) {
        explanation = errorMessages.email_not_confirmed;
      } else if (message.includes("invalid login") || message.includes("invalid credentials")) {
        explanation = errorMessages.invalid_credentials;
      } else if (message.includes("rate limit") || status === 429) {
        explanation = "인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
      } else if (message.includes("signups not allowed") || message.includes("signup disabled")) {
        explanation = errorMessages.signup_disabled;
      } else if (message.includes("invalid api key") || message.includes("invalid jwt") || status === 401) {
        explanation = "인증 키가 올바르지 않거나 권한이 없습니다. Supabase 프로젝트의 공개 키 설정을 확인해 주세요.";
      } else if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network request failed")) {
        explanation = "인증 서버와 통신하지 못했습니다. 인터넷 연결, 브라우저 차단 기능 또는 프로젝트 상태를 확인해 주세요.";
      } else if (message.includes("database error")) {
        explanation = "사용자 정보 저장 중 데이터베이스 오류가 발생했습니다. Supabase Authentication 로그를 확인해 주세요.";
      } else if (status >= 500) {
        explanation = context === "signup" ?
          "회원가입 처리 중 인증 서버 오류가 발생했습니다. 메일 발송(SMTP) 또는 Auth 로그를 확인해 주세요." :
          "인증 서버 내부 오류입니다. 잠시 후 다시 시도해 주세요.";
      } else if (error.name === "TypeError") {
        explanation = "웹사이트 처리 과정에서 오류가 발생했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.";
      } else {
        explanation = "인증 요청에 실패했습니다. Supabase 인증 로그를 확인해 주세요.";
      }
    }
    // Display only the server-supplied error *code* and HTTP status,
    // never a raw exception or any user's email, password or token.
    const detail = [
      code ? "코드: " + code : "",
      Number.isInteger(status) && status >= 400 && status <= 599 ? "HTTP " + status : ""
    ].filter(Boolean).join(" / ");
    return explanation + (detail ? " (" + detail + ")" : "");
  }

  function assertConnected() {
    if (connected && client) return true;
    setNotice("인증 서비스 연결을 준비 중입니다. 관리자 설정이 완료되면 이용할 수 있습니다.", "error");
    return false;
  }

  async function runForm(form, operation, context = "") {
    if (!assertConnected()) return;
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setNotice("처리하고 있습니다...", "info");
    try { await operation(new FormData(form)); }
    catch (error) { setNotice(simpleError(error, context), "error"); }
    finally { submit.disabled = false; }
  }

  function redirectedHome() {
    return "https://goldpick.6uv0.xyz/";
  }

  $("#loginForm").addEventListener("submit", event => {
    event.preventDefault();
    // currentTarget becomes null after the synchronous event callback returns.
    // Keep a stable form reference for the asynchronous auth request.
    const form = event.currentTarget;
    runForm(form, async data => {
      const {error} = await client.auth.signInWithPassword({
        email: String(data.get("email")).trim(),
        password: String(data.get("password"))
      });
      if (error) throw error;
      form.reset();
      const {data: response} = await client.auth.getUser();
      currentUser = response?.user || currentUser;
      updateHeader();
      setView("account");
      setNotice("로그인되었습니다.", "success");
    });
  });

  $("#signupForm").addEventListener("submit", event => {
    event.preventDefault();
    // currentTarget becomes null after the synchronous event callback returns.
    // Keep a stable form reference for the asynchronous auth request.
    const form = event.currentTarget;
    runForm(form, async data => {
      const password = String(data.get("password"));
      const confirm = String(data.get("confirm"));
      if (password !== confirm) {
        setNotice("비밀번호 확인이 일치하지 않습니다.", "error");
        return;
      }
      if (password.length < 10) {
        setNotice("비밀번호는 10자 이상 입력해 주세요.", "error");
        return;
      }
      const {data: result, error} = await client.auth.signUp({
        email: String(data.get("email")).trim(),
        password
      });
      if (error) throw error;
      form.reset();
      if (result?.session) {
        currentUser = result.user;
        updateHeader();
        setView("account");
        setNotice("회원가입 및 로그인이 완료되었습니다.", "success");
      } else {
        setNotice("가입 요청은 접수됐지만 즉시 로그인되지 않았습니다. Supabase에서 이메일 확인 기능이 꺼져 있는지 확인해 주세요.", "info");
      }
    }, "signup");
  });

  $("#forgotForm").addEventListener("submit", event => {
    event.preventDefault();
    // currentTarget becomes null after the synchronous event callback returns.
    // Keep a stable form reference for the asynchronous auth request.
    const form = event.currentTarget;
    runForm(form, async data => {
      const {error} = await client.auth.resetPasswordForEmail(String(data.get("email")).trim(), {
        redirectTo: redirectedHome()
      });
      if (error) throw error;
      form.reset();
      setNotice("이메일 주소가 등록되어 있다면 비밀번호 재설정 링크를 보내드립니다.", "success");
    });
  });

  $("#resetForm").addEventListener("submit", event => {
    event.preventDefault();
    // currentTarget becomes null after the synchronous event callback returns.
    // Keep a stable form reference for the asynchronous auth request.
    const form = event.currentTarget;
    runForm(form, async data => {
      const password = String(data.get("password"));
      if (password !== String(data.get("confirm"))) {
        setNotice("비밀번호 확인이 일치하지 않습니다.", "error");
        return;
      }
      if (password.length < 10) {
        setNotice("새 비밀번호는 10자 이상 입력해 주세요.", "error");
        return;
      }
      const {error} = await client.auth.updateUser({password});
      if (error) throw error;
      await client.auth.signOut();
      currentUser = null;
      recoveryMode = false;
      updateHeader();
      form.reset();
      setView("login");
      setNotice("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.", "success");
    });
  });

  $("#logoutButton").addEventListener("click", async () => {
    if (!assertConnected()) return;
    const button = $("#logoutButton");
    button.disabled = true;
    setNotice("로그아웃 중...", "info");
    try {
      const {error} = await client.auth.signOut();
      if (error) throw error;
      currentUser = null;
      updateHeader();
      setView("login");
      setNotice("로그아웃되었습니다.", "success");
    } catch (error) {
      setNotice(simpleError(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  function onAuthChange(event, session) {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      openModal("reset");
      return;
    }
    if (event === "SIGNED_OUT") {
      currentUser = null;
      updateHeader();
      if (activeView === "account") setView("login");
      return;
    }
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
      currentUser = session?.user || null;
      updateHeader();
    }
  }

  async function init() {
    if (!validUrl || !validKey) {
      setBanner("인증 시스템 설정 전 · 준비 중", "pending");
      return;
    }
    setBanner("인증 서비스 연결 중...", "pending");
    try {
      const {createClient} = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      client = createClient(url, key, {
        auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit"}
      });
      client.auth.onAuthStateChange(onAuthChange);
      const {data, error} = await client.auth.getUser();
      if (error && error.name !== "AuthSessionMissingError") {
        // A temporarily unreachable auth API should not be displayed as ready.
        if (error.status >= 500 || error.status === 0) throw error;
      }
      currentUser = data?.user || null;
      connected = true;
      updateHeader();
      setBanner("인증 설정 로드됨 · 서버 확인은 가입 시 진행", "ready");
      if (location.hash.includes("error=")) {
        openModal("login");
        setNotice("이메일 인증 또는 재설정 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.", "error");
      }
      if (recoveryMode) openModal("reset");
    } catch {
      setBanner("인증 연결 실패 · 잠시 후 다시 시도해 주세요", "error");
      setNotice("인증 서비스에 연결하지 못했습니다. 네트워크 또는 관리자 설정을 확인해 주세요.", "error");
    }
  }
  init();
})();