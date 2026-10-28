(() => {
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
  if (!isPreview && window.Auth && !Auth.requireLogin()) return;

  const requirements = [
    {
      state: "passed",
      icon: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>',
      name: "1. หมวดวิชาศึกษาทั่วไป",
      result: "ผ่านแล้ว 28 / 30 หน่วยกิต",
      detail: "เหลือหน่วยกิตศึกษาทั่วไปอีก 2 หน่วยกิตตามแผนการเรียนของหลักสูตร",
    },
    {
      state: "passed",
      icon: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>',
      name: "2. หมวดวิชาเฉพาะ",
      result: "ผ่านแล้ว 58 / 75 หน่วยกิต",
      detail: "ผลการเรียนในหมวดวิชาเฉพาะผ่านเกณฑ์ขั้นต่ำแล้ว โปรดตรวจสอบแผนการเรียนที่เหลือ",
    },
    {
      state: "warning",
      icon: '<svg viewBox="0 0 24 24"><path d="M12 6.5v7M12 17.2h.01" /></svg>',
      name: "3. หมวดวิชาเลือกเสรี",
      result: "ผ่านแล้ว 12 / 18 หน่วยกิต",
      detail: "ยังต้องลงทะเบียนและผ่านวิชาเลือกเสรีเพิ่มอีก 6 หน่วยกิต",
    },
    {
      state: "passed",
      icon: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>',
      name: "4. หมวดกิจกรรมตลอดหลักสูตร",
      result: "ผ่านแล้ว 98 / 129 หน่วยกิต",
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

  function renderRequirements() {
    if (!list) return;
    list.innerHTML = requirements.map((requirement, index) => `
      <article class="graduation-requirement graduation-requirement--${requirement.state}">
        <button class="graduation-requirement__button" type="button" aria-expanded="false" aria-controls="requirement-detail-${index}">
          <span class="graduation-requirement__status" aria-hidden="true">${requirement.icon}</span>
          <span class="graduation-requirement__name">${requirement.name}</span>
          <span class="graduation-requirement__result">${requirement.result}</span>
          <span class="graduation-requirement__chevron" aria-hidden="true">›</span>
        </button>
        <div id="requirement-detail-${index}" class="graduation-requirement__detail">${requirement.detail}</div>
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

  function updateTimestamp() {
    if (!updated) return;
    const formatted = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    updated.textContent = `ข้อมูลล่าสุด: ${formatted} น.`;
  }

  refresh?.addEventListener("click", updateTimestamp);
  renderRequirements();
  updateTimestamp();
})();
