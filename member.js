/* Gold Pick Membership Center — client display only; real access is enforced by Supabase RLS. */
(() => {
  "use strict";

  const bridge = window.GOLDPICK_MEMBER_BRIDGE;
  if (!bridge) return;
  const el = id => document.getElementById(id);
  let membership = {status: "loading"};
  let requestId = 0;
  let contentRequestId = 0;

  const dateLabel = value => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf())
      ? date.toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric"})
      : "—";
  };
  const currentUser = () => bridge.getUser();
  const currentClient = () => bridge.getClient();
  const show = (element, visible) => { element.hidden = !visible; };
  const setText = (id, value) => { el(id).textContent = String(value); };

  function renderMembership() {
    const user = currentUser();
    const state = membership.status;
    const validVip = state === "vip";
    const pass = el("memberPass");
    const labels = {
      loading: ["조회 중", "CHECKING", "VIP 권한을 확인하고 있습니다."],
      unavailable: ["조회 불가", "PENDING", "VIP 정보 서버 연결을 확인해 주세요."],
      free: ["일반 회원", "FREE", "VIP 이용권이 아직 발급되지 않았습니다."],
      vip: ["VIP 회원", "VIP", "VIP 이용권이 활성화되어 있습니다."],
      scheduled: ["일반 회원", "FREE", "VIP 이용권의 시작일이 아직 지나지 않았습니다."],
      expired: ["일반 회원", "EXPIRED", "이전 VIP 이용권이 만료되었습니다."]
    };
    const [tier, badge, desc] = labels[state] || labels.loading;
    pass.dataset.level = state;
    setText("memberTier", tier);
    setText("memberBadge", badge);
    setText("memberDescription", desc);
    setText("memberJoined", dateLabel(user?.created_at));
    setText("memberExpires", membership.expiresAt ? dateLabel(membership.expiresAt) : (state === "loading" || state === "unavailable" ? "확인 중" : "해당 없음"));
    const days = membership.expiresAt && validVip
      ? Math.max(0, Math.ceil((new Date(membership.expiresAt).getTime() - Date.now()) / 86400000))
      : null;
    setText("memberRemaining", days === null ? "—" : days + "일");
    const info = {
      loading: "서버에서 내 멤버십 정보를 불러오고 있습니다.",
      unavailable: "VIP 데이터 연결이 아직 준비되지 않았거나 일시적으로 조회할 수 없습니다. 일반 계정 로그인은 계속 이용할 수 있습니다.",
      free: "VIP 콘텐츠를 이용하려면 관리자가 발급한 활성 이용권이 필요합니다. 결제·자동 발급은 아직 준비 중입니다.",
      vip: "VIP 이용권은 만료일 이후 자동으로 접근이 제한됩니다. 상태가 달라졌다면 새로고침해 주세요.",
      scheduled: "VIP 시작일: " + dateLabel(membership.startsAt) + " · 그날부터 이용할 수 있습니다.",
      expired: "이용권 기간이 종료되었습니다. 새 이용권은 운영자 발급이 필요합니다."
    };
    setText("memberStatusInfo", info[state] || info.loading);
    const vipMsg = {
      loading: "VIP 이용권을 확인하고 있습니다.",
      unavailable: "VIP 이용권 서버 연결이 필요합니다.",
      free: "현재 일반 회원입니다.",
      vip: "VIP 이용권 확인 완료 · 전용 콘텐츠 이용 가능",
      scheduled: "VIP 이용권 활성화 전입니다.",
      expired: "VIP 이용권이 만료되었습니다."
    };
    const stateBox = el("vipAccessState");
    stateBox.dataset.level = state;
    stateBox.textContent = vipMsg[state] || vipMsg.loading;
    show(el("vipLocked"), !validVip);
    show(el("vipUnlocked"), validVip);
    const lockTitles = {loading:"확인 중", unavailable:"VIP 연동 준비 중",free:"VIP 이용권 필요",scheduled:"VIP 시작 예정",expired:"VIP 이용권 만료"};
    const lockDescriptions = {
      loading:"회원의 이용권 상태를 불러오고 있습니다.",
      unavailable:"서버에서 VIP 이용권 정보를 확인할 수 없습니다. 운영자에게 문의해 주세요.",
      free:"VIP 전용 분석 콘텐츠는 활성 VIP 회원만 열람할 수 있습니다.",
      scheduled:"이용권 시작일이 지나면 VIP 라운지에 입장할 수 있습니다.",
      expired:"VIP 이용 기간이 종료되어 전용 콘텐츠를 열람할 수 없습니다."
    };
    setText("vipLockedTitle", lockTitles[state] || "VIP 전용");
    setText("vipLockedText", lockDescriptions[state] || "확인 중입니다.");
    if (validVip) setText("vipAccessExpires", dateLabel(membership.expiresAt) + " 만료");
  }

  async function fetchMembership() {
    const user = currentUser();
    const client = currentClient();
    const run = ++requestId;
    membership = {status: "loading"};
    renderMembership();
    if (!user || !client) return membership;
    try {
      const {data, error} = await client.from("vip_memberships")
        .select("starts_at,expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (run !== requestId || currentUser()?.id !== user.id) return null;
      if (error) {
        membership = {status: "unavailable"};
      } else if (!data) {
        membership = {status: "free"};
      } else {
        const start = new Date(data.starts_at).getTime();
        const end = new Date(data.expires_at).getTime();
        const now = Date.now();
        membership = {
          status: !Number.isFinite(start) || !Number.isFinite(end)
            ? "unavailable" : end <= now ? "expired" : start > now ? "scheduled" : "vip",
          startsAt: data.starts_at,
          expiresAt: data.expires_at
        };
      }
    } catch {
      if (run !== requestId || currentUser()?.id !== user.id) return null;
      membership = {status: "unavailable"};
    }
    if (run === requestId) renderMembership();
    return membership;
  }

  function clearVipArticles() {
    ++contentRequestId;
    el("vipArticleList").replaceChildren();
    el("vipArticleDetail").hidden = true;
    el("vipArticleList").hidden = false;
    setText("vipArticleTitle", "—");
    setText("vipArticleBody", "");
  }

  async function loadVipArticles() {
    const user = currentUser();
    const client = currentClient();
    const run = ++contentRequestId;
    if (!user || !client) return;
    const list = el("vipArticleList");
    const intro = document.createElement("p");
    intro.className = "vip-empty";
    intro.textContent = "VIP 콘텐츠를 불러오고 있습니다.";
    list.replaceChildren(intro);
    try {
      const {data, error} = await client.from("vip_articles")
        .select("id,title,summary,published_at")
        .order("published_at", {ascending: false})
        .limit(20);
      if (run !== contentRequestId || currentUser()?.id !== user.id || membership.status !== "vip") return;
      if (error) {
        intro.textContent = "콘텐츠 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        return;
      }
      if (!data?.length) {
        intro.textContent = "아직 공개된 VIP 콘텐츠가 없습니다. 콘텐츠가 등록되면 이곳에 표시됩니다.";
        return;
      }
      const cards = data.map(article => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "vip-article-card";
        const published = document.createElement("small");
        published.textContent = dateLabel(article.published_at);
        const title = document.createElement("strong");
        title.textContent = article.title || "제목 없음";
        const summary = document.createElement("span");
        summary.textContent = article.summary || "내용 보기";
        card.append(published,title,summary);
        card.addEventListener("click", () => void openVipArticle(article.id));
        return card;
      });
      list.replaceChildren(...cards);
    } catch {
      if (run === contentRequestId) intro.textContent = "콘텐츠 요청 중 오류가 발생했습니다.";
    }
  }

  async function openVipArticle(articleId) {
    const user = currentUser();
    const client = currentClient();
    if (!user || !client || membership.status !== "vip") return;
    const run = ++contentRequestId;
    el("vipArticleDetail").hidden = false;
    el("vipArticleList").hidden = true;
    setText("vipArticleTitle", "불러오는 중...");
    setText("vipArticleBody", "");
    try {
      const {data, error} = await client.from("vip_articles")
        .select("id,title,content")
        .eq("id", articleId)
        .maybeSingle();
      if (run !== contentRequestId || currentUser()?.id !== user.id) return;
      if (error || !data) {
        setText("vipArticleTitle", "콘텐츠를 볼 수 없습니다.");
        setText("vipArticleBody", "VIP 이용권이 유효한지 확인해 주세요.");
        return;
      }
      setText("vipArticleTitle", data.title);
      setText("vipArticleBody", data.content);
    } catch {
      if (run === contentRequestId) {
        setText("vipArticleTitle", "콘텐츠 불러오기 실패");
        setText("vipArticleBody", "잠시 후 다시 시도해 주세요.");
      }
    }
  }

  async function openLounge() {
    clearVipArticles();
    if (!currentUser()) {
      bridge.openModal("login");
      return;
    }
    bridge.openModal("vip");
  }

  el("vipLoungeOpen").addEventListener("click", () => void openLounge());
  el("memberVipOpen").addEventListener("click", () => {
    bridge.setView("vip");
  });
  el("vipToAccount").addEventListener("click", () => bridge.setView("account"));
  el("memberRefresh").addEventListener("click", () => void fetchMembership());
  el("vipArticleBack").addEventListener("click", () => {
    ++contentRequestId;
    el("vipArticleDetail").hidden = true;
    el("vipArticleList").hidden = false;
  });

  // Defer database calls outside Supabase's auth-state-change callback.
  window.addEventListener("goldpick:view", event => {
    const view = event.detail?.name;
    if (view === "account") setTimeout(() => { if (currentUser()) void fetchMembership(); }, 0);
    if (view === "vip") setTimeout(async () => {
      if (!currentUser()) return;
      clearVipArticles();
      const state = await fetchMembership();
      if (state?.status === "vip") void loadVipArticles();
    }, 0);
  });
  window.addEventListener("goldpick:session", event => {
    if (event.detail?.event !== "SIGNED_OUT") return;
    ++requestId; // Ignore in-flight entitlement responses.
    membership = {status: "loading"};
    clearVipArticles();
    renderMembership();
  });
  renderMembership();
})();
