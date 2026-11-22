/* Gold Pick — admin UX only.
 * Authorization always happens inside Supabase SQL function, never in browser code.
 * No service_role keys belong in GitHub Pages. */
(() => {
  "use strict";

  const bridge = window.GOLDPICK_MEMBER_BRIDGE;
  if (!bridge) return;
  const el = id => document.getElementById(id);
  const adminButton = el("adminPanelOpen");
  const form = el("vipAdminForm");
  const result = el("vipAdminResult");
  const actionButtons = [...document.querySelectorAll("[data-vip-admin-action]")];
  let isAdmin = false;
  let checking = 0;
  let activeRequest = 0;

  function showAdminButton(show) {
    adminButton.hidden = !show;
    adminButton.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function status(message, kind = "info") {
    result.textContent = message;
    result.dataset.kind = kind;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    });
  }

  function errorText(error) {
    const code = String(error?.code || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    if (code === "42501" || error?.status === 403) return "관리자 권한이 없습니다.";
    if (code === "PGRST202" || error?.status === 404) return "Supabase 관리자 SQL 설정이 필요합니다.";
    if (error?.status === 429) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
    return "요청을 처리하지 못했습니다." + (code ? " (코드: " + code + ")" : "");
  }

  async function checkAdmin() {
    const user = bridge.getUser();
    const client = bridge.getClient();
    const run = ++checking;
    isAdmin = false;
    showAdminButton(false);
    if (!user || !client) return;
    try {
      const {data, error} = await client.rpc("goldpick_is_admin");
      if (run !== checking || bridge.getUser()?.id !== user.id) return;
      isAdmin = !error && data === true;
      showAdminButton(isAdmin);
    } catch {
      if (run === checking) showAdminButton(false);
    }
  }

  async function doAction(action) {
    if (!isAdmin || !bridge.getUser() || !bridge.getClient()) {
      bridge.setView("account");
      return;
    }
    if (!form.reportValidity()) return;
    if (!["lookup","grant","extend","revoke"].includes(action)) return;
    const email = String(new FormData(form).get("memberEmail") || "").trim();
    const days = Number(el("vipAdminDays").value);
    if (!email) return;
    if ((action === "grant" || action === "extend") &&
        (!Number.isInteger(days) || days < 1 || days > 3650)) {
      status("VIP 기간을 확인해 주세요.", "error");
      return;
    }
    const messages = {grant: "지급",extend: "연장",revoke: "회수"};
    if (action !== "lookup" &&
        !window.confirm(email + " 회원의 VIP를 " + messages[action] +
          (action === "revoke" ? "" : " (" + days + "일)") + "할까요?")) {
      return;
    }

    const userId = bridge.getUser().id;
    const run = ++activeRequest;
    actionButtons.forEach(button => button.disabled = true);
    status("Supabase에서 회원 정보를 확인하고 있습니다...");
    try {
      const {data, error} = await bridge.getClient().rpc("goldpick_manage_vip", {
        p_email: email,
        p_action: action,
        p_days: action === "grant" || action === "extend" ? days : null
      });
      if (run !== activeRequest || bridge.getUser()?.id !== userId) return;
      if (error) {
        if (String(error.code) === "42501" || error.status === 403) {
          isAdmin = false;
          showAdminButton(false);
          bridge.setView("account");
        }
        status(errorText(error), "error");
        return;
      }
      if (!data || data.ok !== true) {
        status(data?.message || "회원 조회 또는 VIP 처리에 실패했습니다.", "error");
        return;
      }
      const tier = {
        vip: "VIP 활성", free: "일반 회원", scheduled: "VIP 시작 예정",
        expired: "VIP 만료"
      }[data.status] || "확인됨";
      const details = ["회원: " + (data.email || email), "상태: " + tier];
      if (data.starts_at) details.push("시작: " + formatDate(data.starts_at));
      if (data.expires_at) details.push("만료: " + formatDate(data.expires_at));
      status((data.message ? data.message + "\n" : "") + details.join("\n"), "success");
    } catch (error) {
      if (run === activeRequest) status(errorText(error), "error");
    } finally {
      if (run === activeRequest) actionButtons.forEach(button => button.disabled = false);
    }
  }

  adminButton.addEventListener("click", async () => {
    await checkAdmin();
    if (isAdmin) {
      bridge.setView("admin");
      setTimeout(() => form.elements.memberEmail.focus(), 0);
    }
  });

  el("adminBack").addEventListener("click", () => bridge.setView("account"));
  actionButtons.forEach(button => {
    button.addEventListener("click", () => void doAction(button.dataset.vipAdminAction));
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    void doAction("lookup");
  });

  window.addEventListener("goldpick:view", event => {
    if (event.detail?.name === "account") {
      setTimeout(() => void checkAdmin(), 0);
    }
    if (event.detail?.name === "admin") {
      if (!isAdmin || !bridge.getUser()) {
        bridge.setView("account");
      }
    }
  });
  window.addEventListener("goldpick:session", event => {
    if (event.detail?.event !== "SIGNED_OUT") return;
    ++checking;
    ++activeRequest;
    isAdmin = false;
    showAdminButton(false);
    form.reset();
    status("회원의 이메일을 입력하고 조회해 주세요.");
  });
  showAdminButton(false);
})();
