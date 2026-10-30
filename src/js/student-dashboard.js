(() => {
  // ใช้ ?preview=1 สำหรับตรวจ UI ระหว่างระบบยืนยันตัวตน/ทะเบียนยังไม่พร้อม
  // หากไม่ใช่โหมดตัวอย่าง หน้านี้ยังต้องผ่าน Login ตามปกติ
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
  if (!isPreview && window.Auth && !Auth.requireLogin()) return;

  const timestamp = document.getElementById("data-freshness-time");
  const status = document.getElementById("data-freshness-status");
  const statusIndicator = document.getElementById("data-freshness-indicator");
  const statusLabel = document.getElementById("data-freshness-label");
  const statusDetail = document.getElementById("data-freshness-detail");
  if (!timestamp) return;

  const statuses = {
    current: {
      label: "ข้อมูลปัจจุบัน",
      detail: "ข้อมูลครบถ้วนล่าสุด",
      indicator: "✓",
    },
    stale: {
      label: "ข้อมูลอาจไม่เป็นปัจจุบัน",
      detail: "ข้อมูลอาจมีการเปลี่ยนแปลง",
      indicator: "!",
    },
    unavailable: {
      label: "ไม่สามารถดึงข้อมูลได้",
      detail: "เกิดข้อผิดพลาดในการดึงข้อมูล",
      indicator: "!",
    },
  };

  // Until registrar integration is ready, ?status=stale or ?status=unavailable
  // lets the team review every state in the local prototype.
  const requestedStatus = new URLSearchParams(window.location.search).get("status");
  const statusKey = Object.hasOwn(statuses, requestedStatus) ? requestedStatus : "current";
  const selectedStatus = statuses[statusKey];

  if (status && statusIndicator && statusLabel && statusDetail) {
    status.classList.remove(
      "data-freshness__status--current",
      "data-freshness__status--stale",
      "data-freshness__status--unavailable",
    );
    status.classList.add(`data-freshness__status--${statusKey}`);
    statusIndicator.textContent = selectedStatus.indicator;
    statusLabel.textContent = selectedStatus.label;
    statusDetail.textContent = selectedStatus.detail;
  }

  const now = new Date();
  const formatted = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(now);

  // Temporary display value until the registrar-data integration is available.
  timestamp.textContent = statusKey === "unavailable"
    ? "ข้อมูลไม่พร้อมใช้งานในขณะนี้"
    : `อัปเดตล่าสุด: ${formatted} น.`;

  document.querySelectorAll(".student-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      const target = new URL(card.href, window.location.href);
      if (
        target.pathname.endsWith("graduation-requirements.html") ||
        target.pathname.endsWith("graduation-check.html") ||
        target.pathname.endsWith("transcript.html") ||
        target.pathname.endsWith("faq.html")
      ) {
        if (
          isPreview &&
          (target.pathname.endsWith("graduation-check.html") ||
            target.pathname.endsWith("transcript.html"))
        ) {
          event.preventDefault();
          const nextPage = target.pathname.endsWith("graduation-check.html")
            ? "graduation-check.html"
            : "transcript.html";
          window.location.assign(`${nextPage}?preview=1`);
        }
        return;
      }

      // Keep routes that are still not available explicit instead of showing a browser 404.
      event.preventDefault();
      window.alert("หน้านี้กำลังพัฒนาและจะเปิดใช้งานในขั้นตอนถัดไปของ V4");
    });
  });
})();
