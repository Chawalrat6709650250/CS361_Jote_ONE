(() => {
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
  if (!isPreview && window.Auth && !Auth.requireStudent()) return;

  // ข้อมูลตัวอย่างสำหรับหน้า preview หรือกรณี API ใช้งานไม่ได้ชั่วคราว
  const fallbackRequirements = [
    {
      state: "warning",
      icon: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>',
      name: "1. หมวดวิชาศึกษาทั่วไป",
      result: "สะสม 28 / 30 หน่วยกิต",
      detail: "เหลือหน่วยกิตศึกษาทั่วไปอีก 2 หน่วยกิตตามแผนการเรียนของหลักสูตร",
    },
    {
      state: "warning",
      icon: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>',
      name: "2. หมวดวิชาเฉพาะ",
      result: "สะสม 58 / 75 หน่วยกิต",
      detail: "ผลการเรียนในหมวดวิชาเฉพาะผ่านเกณฑ์ขั้นต่ำแล้ว โปรดตรวจสอบแผนการเรียนที่เหลือ",
    },
    {
      state: "warning",
      icon: '<svg viewBox="0 0 24 24"><path d="M12 6.5v7M12 17.2h.01" /></svg>',
      name: "3. หมวดวิชาเลือกเสรี",
      result: "สะสม 12 / 18 หน่วยกิต",
      detail: "ยังต้องลงทะเบียนและผ่านวิชาเลือกเสรีเพิ่มอีก 6 หน่วยกิต",
    },
    {
      state: "warning",
      icon: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>',
      name: "4. หมวดกิจกรรมตลอดหลักสูตร",
      result: "สะสม 98 / 129 หน่วยกิต",
      detail: "จำนวนหน่วยกิตสะสมในปัจจุบันเป็นไปตามแผนการเรียน",
    },
    {
      state: "failed",
      icon: '<svg viewBox="0 0 24 24"><path d="m7.5 7.5 9 9m0-9-9 9" /></svg>',
      name: "5. รายวิชาบังคับก่อน",
      result: "ยังไม่ผ่าน 2 รายวิชา",
      detail: "โปรดตรวจสอบและลงทะเบียนเรียนซ้ำในรายวิชาบังคับที่ยังไม่ผ่าน",
    },
  ];

  const list = document.getElementById("graduation-requirement-list");
  const updated = document.getElementById("graduation-check-updated");
  const refresh = document.getElementById("graduation-check-refresh");
  const percent = document.getElementById("graduation-progress-percent");
  const progressBar = document.getElementById("graduation-progress-bar");
  const progressCompleted = document.getElementById("graduation-progress-completed");
  const progressRemaining = document.getElementById("graduation-progress-remaining");
  // ข้อมูลตัวอย่างใช้เฉพาะโหมด preview เท่านั้น — ผู้ใช้จริงต้องเห็นข้อมูลจากทะเบียน หรือข้อความแจ้งข้อจำกัด
  let requirements = isPreview ? fallbackRequirements : [];

  // แจ้งสถานะ/ข้อจำกัดของข้อมูลแทนรายการเงื่อนไข (เช่น ยังไม่ได้รับข้อมูลจากทะเบียน หรือเชื่อมต่อไม่ได้)
  function showNotice(message, tone = "warning") {
    if (!list) return;
    list.innerHTML = `<p class="graduation-notice graduation-notice--${tone}" role="status">${escapeHtml(message)}</p>`;
  }

  function resetProgress() {
    percent.textContent = "–";
    progressBar.style.width = "0%";
    progressBar.parentElement.setAttribute("aria-label", "ยังไม่มีข้อมูลความคืบหน้า");
    progressCompleted.textContent = "หน่วยกิตสะสม – / – หน่วยกิต";
    progressRemaining.textContent = "";
  }

  // คำเตือนจากระบบ เช่น ดึงข้อมูลทะเบียนรอบล่าสุดไม่สำเร็จ / ข้อมูลเก่า / บางรายวิชายังไม่มีผล
  function renderWarnings(warnings) {
    if (!list || !Array.isArray(warnings) || !warnings.length) return;
    list.insertAdjacentHTML(
      "afterbegin",
      `<div class="graduation-notice graduation-notice--warning" role="status">
        <strong>ข้อจำกัดของข้อมูลจากทะเบียน</strong>
        <ul>${warnings.map((w) => `<li>${escapeHtml(w.message_th || w.code || "")}</li>`).join("")}</ul>
      </div>`,
    );
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderRequirements() {
    if (!list) return;
    list.innerHTML = requirements.map((requirement, index) => `
      <article class="graduation-requirement graduation-requirement--${requirement.state}">
        <button
          class="graduation-requirement__button"
          type="button"
          aria-expanded="false"
          aria-controls="requirement-detail-${index}"
        >
          <span class="graduation-requirement__status" aria-hidden="true">${requirement.icon}</span>
          <span class="graduation-requirement__name">${escapeHtml(requirement.name)}</span>
          <span class="graduation-requirement__result">${escapeHtml(requirement.result)}</span>
          <span class="graduation-requirement__chevron" aria-hidden="true">›</span>
        </button>
        <div
          id="requirement-detail-${index}"
          class="graduation-requirement__detail"
        >${escapeHtml(requirement.detail)}</div>
      </article>
    `).join("");

    list.querySelectorAll(".graduation-requirement__button").forEach((button) => {
      button.addEventListener("click", () => {
        const detail = document.getElementById(button.getAttribute("aria-controls"));
        const open = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!open));
        detail?.classList.toggle("is-open", !open);
      });
    });
  }

  function updateTimestamp(value = new Date()) {
    if (!updated) return;
    const formatted = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
    updated.textContent = `ข้อมูลล่าสุด: ${formatted} น.`;
  }

  function statusIcon(status) {
    if (status === "pass") {
      return '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>';
    }
    if (status === "fail") {
      return '<svg viewBox="0 0 24 24"><path d="m7.5 7.5 9 9m0-9-9 9" /></svg>';
    }
    return '<svg viewBox="0 0 24 24"><path d="M12 6.5v7M12 17.2h.01" /></svg>';
  }

  function displayState(check) {
    if (Number.isFinite(check.earned) && Number.isFinite(check.required) && check.earned < check.required) {
      return "warning";
    }
    if (check.status === "pass") return "passed";
    if (check.status === "fail") return "failed";
    return "warning";
  }

  function checkResult(check) {
    if (Number.isFinite(check.earned) && Number.isFinite(check.required)) {
      const label = check.earned >= check.required ? "ครบแล้ว" : "สะสม";
      return `${label} ${check.earned} / ${check.required} หน่วยกิต`;
    }
    if (Array.isArray(check.missing) && check.missing.length) {
      return `ยังขาด ${check.missing.length} รายการ`;
    }
    return check.detail_th || "กำลังตรวจสอบ";
  }

  function updateProgress(summary) {
    const earned = Number(summary.credits_earned) || 0;
    const required = Number(summary.credits_required) || 0;
    const pending = Number(summary.credits_pending) || 0;
    const value = required ? Math.min(100, Math.round((earned / required) * 100)) : 0;

    percent.textContent = `${value}%`;
    progressBar.style.width = `${value}%`;
    progressBar.parentElement.setAttribute("aria-label", `ความคืบหน้า ${value} เปอร์เซ็นต์`);
    progressCompleted.textContent = `หน่วยกิตสะสม ${earned} / ${required} หน่วยกิต`;
    progressRemaining.textContent = pending ? `เหลืออีก ${pending} หน่วยกิต` : "ครบตามจำนวนหน่วยกิตแล้ว";
  }

  async function loadGraduationCheck() {
    if (isPreview) return;

    updated.textContent = "กำลังตรวจสอบข้อมูลล่าสุด…";
    try {
      const token = await Auth.getToken();
      if (!token) throw new Error("ไม่พบข้อมูลการเข้าสู่ระบบ");

      const apiRoot = APP_CONFIG.apiBase.replace(/\/api$/, "");
      const response = await fetch(`${apiRoot}/grad/me`, {
        headers: { Authorization: `${APP_CONFIG.authScheme} ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body?.error?.message || `HTTP ${response.status}`), {
          status: response.status,
        });
      }

      const payload = await response.json();
      const data = payload?.data;
      if (!payload?.success || !data?.summary || !Array.isArray(data.checks)) {
        throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
      }

      requirements = data.checks.map((check, index) => ({
        state: displayState(check),
        icon: statusIcon(check.status),
        name: `${index + 1}. ${check.label_th}`,
        result: checkResult(check),
        detail: check.detail_th || "ไม่มีรายละเอียดเพิ่มเติม",
      }));
      updateProgress(data.summary);
      renderRequirements();
      renderWarnings(data.data?.warnings);
      updateTimestamp(data.data?.data_as_of || data.computed_at);
    } catch (error) {
      console.warn("ไม่สามารถโหลดผลตรวจการจบจาก API ได้", error);
      // ไม่แสดงข้อมูลตัวอย่างแทนข้อมูลจริง — แจ้งข้อจำกัดให้ชัดเจนแทน
      requirements = [];
      resetProgress();
      updated.textContent = "ไม่สามารถโหลดข้อมูลล่าสุดได้";
      showNotice(
        error.status === 404
          ? "ยังไม่ได้รับข้อมูลผลการเรียนของคุณจากสำนักทะเบียน จึงยังตรวจสอบเงื่อนไขการจบไม่ได้ กรุณาลองใหม่ภายหลัง หรือติดต่ออาจารย์ที่ปรึกษา"
          : "ไม่สามารถเชื่อมต่อระบบตรวจสอบการจบหรือระบบทะเบียนได้ในขณะนี้ ผลด้านล่างจะแสดงเมื่อเชื่อมต่อได้ กรุณากดรีเฟรชอีกครั้งภายหลัง",
        "error",
      );
    }
  }

  refresh?.addEventListener("click", loadGraduationCheck);
  if (isPreview) {
    renderRequirements();
    updateTimestamp();
  } else {
    resetProgress();
    showNotice("กำลังโหลดผลตรวจเงื่อนไขการจบจากข้อมูลทะเบียน…", "info");
  }
  loadGraduationCheck();
})();
