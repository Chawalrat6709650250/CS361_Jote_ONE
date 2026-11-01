// ตัวช่วยร่วมของหน้าอาจารย์/เจ้าหน้าที่ (window.Staff)
// เรียก API แบบ path-based (/grad/..., /registrar/...) ที่อยู่ระดับเดียวกับ /api
// ใช้ ?preview=1 เพื่อดูหน้าด้วยข้อมูลตัวอย่างโดยไม่ต้อง login (ไม่เรียก API จริง)
(function () {
  const params = new URLSearchParams(location.search);
  const isPreview = false;
  const ROLES = ["Professor", "Staff", "Admin"];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const apiRoot = () => window.APP_CONFIG.apiBase.replace(/\/api$/, "");

  function guard(roles = ROLES) {
    if (isPreview) return true;
    return Auth.requireLogin(roles);
  }
  const isStaff = () => isPreview || Auth.hasRole("Staff") || Auth.hasRole("Admin");

  async function api(path, { method = "GET", body, query } = {}) {
    if (isPreview) return Staff.mock(path, method, body);
    const token = await Auth.getToken();
    if (!token) { Auth.requireLogin(); throw new Error("กรุณาเข้าสู่ระบบใหม่"); }
    const qs = query ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString() : "";
    const res = await fetch(apiRoot() + path + qs, {
      method,
      headers: { Authorization: `${APP_CONFIG.authScheme} ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) { Auth.requireLogin(); }
    if (!res.ok || json.success === false) {
      const err = new Error(json?.error?.message || `เรียกระบบไม่สำเร็จ (HTTP ${res.status})`);
      err.status = res.status; err.errors = json?.data?.errors || []; throw err;
    }
    return json.data;
  }

  const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d)) return "-";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())} น.`;
  }

  const OVERALL = {
    eligible: ["ok", "ครบเงื่อนไข"],
    not_eligible: ["bad", "ยังไม่ครบเงื่อนไข"],
    unknown: ["warn", "ข้อมูลยังไม่ครบ"],
  };
  const CHECK = { pass: ["ok", "ผ่าน"], fail: ["bad", "ไม่ผ่าน"], pending: ["info", "รอผล"], unknown: ["warn", "สรุปไม่ได้"], in_progress: ["info", "กำลังเรียน"] };
  const badge = (map, key) => { const [c, t] = map[key] || ["mute", key || "-"]; return `<span class="st-badge st-badge--${c}">${esc(t)}</span>`; };

  const SYNC = {
    ok: ["ok", "✓", "ข้อมูลเป็นปัจจุบัน"], success: ["ok", "✓", "ข้อมูลเป็นปัจจุบัน"],
    stale: ["warn", "!", "ข้อมูลเก่า"], failed: ["bad", "✕", "ดึงข้อมูลล้มเหลว"], never: ["mute", "–", "ยังไม่เคยดึงข้อมูล"],
  };
  // แถบ "ข้อมูลล่าสุดจากทะเบียน" ใช้ data{ data_as_of, sync_status, source_label_th, warnings }
  function renderFreshness(el, d) {
    if (!el) return;
    if (!d) { el.innerHTML = ""; return; }
    const [c, icon, label] = SYNC[d.sync_status] || SYNC.never;
    const warns = (d.warnings || []).map((w) => `<li>${esc(w.message_th)}</li>`).join("");
    el.innerHTML = `
      <span class="st-fresh__icon" aria-hidden="true">🕒</span>
      <div class="st-fresh__body">
        <strong>ข้อมูลล่าสุดจากทะเบียน: ${esc(fmtDate(d.data_as_of))}</strong>
        <span>แหล่งข้อมูล: ${esc(d.source_label_th || "-")}</span>
        ${warns ? `<ul class="st-warnlist">${warns}</ul>` : ""}
      </div>
      <span class="st-badge st-badge--${c}" role="status">${icon} ${label}</span>`;
  }

  function demoBanner(el) {
    if (isPreview && el) el.innerHTML = `<div class="st-alert st-alert--info st-demo">โหมดตัวอย่าง (?preview=1) — ข้อมูลทั้งหมดเป็นข้อมูลจำลอง ไม่ได้เรียก API จริง</div>`;
  }

  window.Staff = { isPreview, ROLES, esc, guard, isStaff, api, fmtDate, badge, OVERALL, CHECK, renderFreshness, demoBanner, mock: () => { throw new Error("ไม่พบข้อมูลตัวอย่าง"); } };
})();
