(function () {
  const API_BASE = "https://uuo1em3vlb.execute-api.us-east-1.amazonaws.com/prod/api";
  const TIMEOUT_MS = 8000;

  const section = document.getElementById("system-status");
  if (!section) return;

  const curriculumsEl = section.querySelector("[data-status-curriculums]");
  const stateEl = section.querySelector("[data-status-state]");
  const updatedEl = section.querySelector("[data-status-updated]");
  const errorEl = section.querySelector("[data-status-error]");

  async function fetchResource(resource) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}?resource=${encodeURIComponent(resource)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.success === false) throw new Error(json.message || "API error");
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  function formatThaiDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " น.";
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }

  async function loadCurriculums() {
    try {
      const json = await fetchResource("study_plans");
      const list = Array.isArray(json) ? json
        : Array.isArray(json?.data) ? json.data
        : json?.data?.study_plans ?? [];

      const ids = [...new Set(list.map((p) => p?.curriculum_id).filter(Boolean))].sort();

      curriculumsEl.replaceChildren(
        ...(ids.length
          ? ids.map((id) => makeEl("span", "system-status__badge", id))
          : [makeEl("span", "system-status__muted", "ยังไม่มีข้อมูลหลักสูตร")])
      );
    } catch (err) {
      console.warn("[system-status] study_plans:", err);
      curriculumsEl.replaceChildren(
        makeEl("span", "system-status__muted", "ไม่สามารถโหลดข้อมูลหลักสูตรได้")
      );
    }
  }

  async function loadHealth() {
    try {
      const json = await fetchResource("health");
      const ts = json?.meta?.generated_at ?? json?.generated_at ?? json?.data?.timestamp;

      stateEl.textContent = "🟢 Online";
      stateEl.className = "system-status__state system-status__state--online";
      updatedEl.textContent = formatThaiDate(ts);
      if (ts) updatedEl.setAttribute("datetime", ts);
    } catch (err) {
      console.warn("[system-status] health:", err);
      stateEl.textContent = "🔴 Offline";
      stateEl.className = "system-status__state system-status__state--offline";
      updatedEl.textContent = "—";
      errorEl.textContent =
        err.name === "AbortError"
          ? "เชื่อมต่อเซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณาลองใหม่ภายหลัง"
          : "ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้ ข้อมูลบางส่วนอาจไม่แสดงผล";
      errorEl.hidden = false;
    }
  }

  loadCurriculums();
  loadHealth();
})();
