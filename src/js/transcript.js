(() => {
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";

  // หน้าตัวอย่างเปิดได้โดยไม่ต้องเข้าสู่ระบบ ส่วนการใช้งานจริงต้องตรวจสอบการล็อกอินก่อน
  if (!isPreview && window.Auth && !Auth.requireLogin()) return;

  // ข้อมูลตัวอย่างของผลการเรียน: ภายหลังสามารถแทนที่ด้วยข้อมูลจาก API ได้
  const terms = [
    {
      term: "1/2567",
      standing: "Normal",
      summary: {
        CR: 24,
        CE: 24,
        CL: 18,
        GP: 52.5,
        GPA: 2.92,
      },
      cumulative: {
        CR: 24,
        CE: 24,
        CL: 18,
        GP: 52.5,
        GPAX: 2.92,
      },
      courses: [
        ["CS100", "BASIC WEB DEVELOPMENT", 3, "A"],
        ["CS101", "DISCRETE STRUCTURES", 3, "D+"],
        ["CS102", "PROBLEM SOLVING BASICS AND COMPUTER PROGRAMMING", 3, "D+"],
        ["ST216", "STATISTICS FOR SOCIAL SCIENCE 1", 3, "C+"],
        ["TU100", "CIVIC ENGAGEMENT", 3, "ACC"],
        ["TU101", "THAILAND, ASEAN, AND THE WORLD", 3, "A"],
        ["TU103", "LIFE AND SUSTAINABILITY", 3, "ACC"],
        ["TU108", "SELF DEVELOPMENT AND MANAGEMENT", 3, "A"],
      ],
    },
    {
      term: "2/2567",
      standing: "Normal",
      summary: {
        CR: 21,
        CE: 21,
        CL: 18,
        GP: 57,
        GPA: 3.17,
      },
      cumulative: {
        CR: 45,
        CE: 45,
        CL: 36,
        GP: 109.5,
        GPAX: 3.04,
      },
      courses: [
        ["CS213", "DATA STRUCTURES AND ALGORITHMS", 3, "B+"],
        ["CS234", "NETWORKS AND SECURITY", 3, "A"],
        ["CS251", "DATABASE SYSTEMS 1", 3, "B+"],
      ],
    },
    {
      term: "S/2567",
      standing: "Normal",
      summary: {
        CR: 3,
        CE: 3,
        CL: 3,
        GP: 12,
        GPA: 4,
      },
      cumulative: {
        CR: 48,
        CE: 48,
        CL: 39,
        GP: 121.5,
        GPAX: 3.12,
      },
      courses: [["TU109", "INNOVATION AND ENTREPRENEURSHIP", 3, "A"]],
    },
    {
      term: "1/2568",
      standing: "Normal",
      summary: {
        CR: 18,
        CE: 18,
        CL: 18,
        GP: 58.5,
        GPA: 3.25,
      },
      cumulative: {
        CR: 63,
        CE: 63,
        CL: 54,
        GP: 168,
        GPAX: 3.11,
      },
      courses: [
        ["CS265", "AI FUNDAMENTALS", 3, "B+"],
        ["EL295", "ENGLISH FOR COMMUNICATION", 3, "A"],
        ["CS271", "WEB APPLICATION DEVELOPMENT", 3, "B+"],
      ],
    },
    {
      term: "2/2568",
      standing: "Normal",
      summary: {
        CR: 18,
        CE: 18,
        CL: 18,
        GP: 60,
        GPA: 3.33,
      },
      cumulative: {
        CR: 81,
        CE: 81,
        CL: 72,
        GP: 228,
        GPAX: 3.17,
      },
      courses: [
        ["CS281", "SOFTWARE ENGINEERING", 3, "B+"],
        ["CS299", "FREE ELECTIVE", 3, "A"],
        ["CS306", "OPERATING SYSTEMS", 3, "B+"],
      ],
    },
  ];

  // อ้างอิงองค์ประกอบบนหน้าเว็บที่ JavaScript ต้องใช้
  const select = document.getElementById("transcript-term");
  const groups = document.getElementById("transcript-groups");
  const template = document.getElementById("transcript-group-template");
  const updated = document.getElementById("transcript-updated");
  const termButton = document.getElementById("transcript-term-button");
  const termLabel = document.getElementById("transcript-term-label");
  const termOptions = document.getElementById("transcript-term-options");

  // แปลงข้อมูลสรุป เช่น CR, CE, GPA ให้เป็นช่องสถิติด้านล่างของตาราง
  function metrics(summary) {
    return Object.entries(summary)
      .map(
        ([label, value]) => `
          <span>
            <small>${label}</small>
            <b>${value}</b>
          </span>
        `,
      )
      .join("");
  }

  // วาดตารางผลการเรียนใหม่ตามภาคการศึกษาที่ผู้ใช้เลือก
  function render() {
    const visibleTerms =
      select.value === "all"
        ? terms
        : terms.filter((item) => item.term === select.value);

    groups.replaceChildren();

    visibleTerms.forEach((item) => {
      const fragment = template.content.cloneNode(true);
      const rows = item.courses
        .map(
          ([code, name, credits, grade]) => `
            <tr>
              <td>${code}</td>
              <td>${name}</td>
              <td>${credits}</td>
              <td>${grade}</td>
            </tr>
          `,
        )
        .join("");

      fragment.querySelector(".transcript-group__title").textContent =
        `ภาคการศึกษา ${item.term}`;
      fragment.querySelector("tbody").innerHTML = rows;
      fragment.querySelector(".transcript-summary__this").innerHTML = metrics(item.summary);
      fragment.querySelector(".transcript-summary__standing").textContent = item.standing;
      fragment.querySelector(".transcript-summary__cumulative").innerHTML = metrics(
        item.cumulative,
      );

      groups.append(fragment);
    });
  }

  // แสดงวันและเวลาปัจจุบันเมื่อผู้ใช้กดรีเฟรช
  function updateTimestamp() {
    const dateTime = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    updated.textContent = `ข้อมูลล่าสุด: ${dateTime} น.`;
  }

  // ปิดรายการตัวเลือกภาคการศึกษา และคืนค่า aria เพื่อการเข้าถึง
  function closeTermOptions() {
    termOptions.hidden = true;
    termButton.setAttribute("aria-expanded", "false");
  }

  termButton.addEventListener("click", () => {
    const isOpen = !termOptions.hidden;

    termOptions.hidden = isOpen;
    termButton.setAttribute("aria-expanded", String(!isOpen));
  });

  termOptions.querySelectorAll("button").forEach((option) => {
    option.addEventListener("click", () => {
      select.value = option.dataset.value;
      termLabel.textContent = option.textContent;

      termOptions.querySelectorAll("button").forEach((item) => {
        item.setAttribute("aria-selected", String(item === option));
      });

      closeTermOptions();
      select.dispatchEvent(new Event("change"));
      termButton.focus();
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".transcript-select")) {
      closeTermOptions();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTermOptions();
    }
  });

  select.addEventListener("change", render);
  document.getElementById("transcript-refresh").addEventListener("click", updateTimestamp);

  updateTimestamp();
  render();
})();
