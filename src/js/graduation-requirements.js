(() => {
  // Base URL ของ API กลางที่ทีม Backend ดูแล
  const API_BASE =
    "https://uuo1em3vlb.execute-api.us-east-1.amazonaws.com/prod/api";
  const form = document.getElementById("requirements-form");
  const programSelect = document.getElementById("program-select");
  const yearSelect = document.getElementById("year-select");
  const typeSelect = document.getElementById("program-type");
  const cards = document.getElementById("summary-cards");
  const accordions = document.getElementById("requirement-accordions");
  const criteriaList = document.getElementById("graduation-criteria-list");
  const status = document.getElementById("requirements-status");
  const selectedProgram = document.getElementById("selected-program");
  const searchButton = form.querySelector(".search-button");
  // ชุดข้อมูลที่มีหลักสูตรรองรับในระบบปัจจุบัน
  // หากเพิ่มหลักสูตรใหม่ ให้เพิ่มตัวเลือกใน HTML และเพิ่มกติกาที่นี่คู่กัน
  const supportedPrograms = {
    "BSC-CS-2566-CIS-PROJECT": { type: "regular", year: "2566" },
    "BSC-CS-2566-ACS-PROJECT": { type: "special", year: "2566" },
    "BSC-CNC-2568-PROJECT": { type: "special", year: "2568" },
  };

  // ข้อมูลสำรอง: ใช้แสดงผลระหว่างที่ API ยังตอบไม่ได้หรือยังติด CORS
  function getMockPlan(studyPlanId = programSelect.value) {
    const isCnc = studyPlanId.startsWith("BSC-CNC-2568");
    const isCis = studyPlanId.includes("-CIS-");
    const programName =
      programSelect.selectedOptions[0]?.textContent ?? "หลักสูตร";

    if (isCnc) {
      return {
        programName,
        year: "2568",
        type: typeSelect.selectedOptions[0]?.textContent ?? "ภาคปกติ",
        categories: [
          {
            key: "general",
            label: "วิชาศึกษาทั่วไป",
            credits: 24,
            rows: [
              [
                "วิชาศึกษาทั่วไป",
                24,
                "ศึกษาตามข้อกำหนดของมหาวิทยาลัยธรรมศาสตร์",
              ],
            ],
          },
          {
            key: "major",
            label: "วิชาเฉพาะ",
            credits: 96,
            rows: [
              ["วิชาพื้นฐานด้านคณิตศาสตร์", 9, "รายวิชาพื้นฐานด้านคณิตศาสตร์"],
              ["วิชาบังคับ", 81, "รายวิชาบังคับของสาขา"],
              ["วิชาโครงงานหรือสหกิจศึกษา", 6, "ตามโครงสร้างหลักสูตร"],
            ],
          },
          {
            key: "elective",
            label: "วิชาเลือกเสรี",
            credits: 6,
            rows: [["วิชาเลือกเสรี", 6, "เลือกศึกษาตามข้อกำหนดของมหาวิทยาลัย"]],
          },
        ],
        graduationCriteria: [
          "มีหน่วยกิตสะสมไม่ต่ำกว่า 126 หน่วยกิต",
          "บรรลุผลลัพธ์การเรียนรู้ตามมาตรฐานคุณวุฒิระดับปริญญาตรี",
          "มีค่าระดับเฉลี่ยสะสมไม่ต่ำกว่า 2.00",
          "ได้ค่าระดับไม่ต่ำกว่า C ในรายวิชา คคป.101, คคป.102, คคป.222, คคป.231 และ คคป.235",
          "ได้ค่าเฉลี่ยรวมไม่ต่ำกว่า 2.00 ในรายวิชา คคป.101, คคป.102, คคป.211, คคป.222, คคป.231, คคป.235 และ คคป.332",
        ],
      };
    }

    return {
      programName,
      year: "2566",
      type: typeSelect.selectedOptions[0]?.textContent ?? "ภาคพิเศษ",
      categories: [
        {
          key: "general",
          label: "หมวดศึกษาทั่วไป",
          credits: 30,
          rows: [
            [
              "วิชาศึกษาทั่วไป",
              30,
              "ศึกษารายวิชาศึกษาทั่วไปตามข้อกำหนดของมหาวิทยาลัยธรรมศาสตร์",
            ],
          ],
        },
        {
          key: "major",
          label: "วิชาเฉพาะ",
          credits: 87,
          rows: [
            ["วิชาแกน", 12, "รายวิชาแกนของหลักสูตร"],
            ["วิชาเฉพาะด้าน", 42, "รายวิชาเฉพาะด้านตามที่หลักสูตรกำหนด"],
            [
              isCis
                ? "วิชาเอกคอมพิวเตอร์และวิทยาการสารสนเทศ"
                : "วิชาเอกคอมพิวเตอร์ประยุกต์",
              30,
              "รายวิชาเฉพาะของวิชาเอก",
            ],
            ["วิชาบังคับนอกสาขา", 3, "รายวิชาบังคับนอกสาขาตามที่หลักสูตรกำหนด"],
          ],
        },
        {
          key: "elective",
          label: "หมวดวิชาเลือกเสรี",
          credits: 6,
          rows: [
            [
              "วิชาเลือกเสรี",
              6,
              "เลือกศึกษารายวิชาที่เปิดสอนในมหาวิทยาลัยธรรมศาสตร์",
            ],
          ],
        },
      ],
      graduationCriteria: [
        "บรรลุผลลัพธ์การเรียนรู้ตามมาตรฐานคุณวุฒิระดับปริญญาตรี",
        "มีหน่วยกิตสะสมไม่ต่ำกว่า 123 หน่วยกิต",
        "มีค่าระดับเฉลี่ยสะสมไม่ต่ำกว่า 2.00",
        "ได้ค่าระดับไม่ต่ำกว่า C ในรายวิชา คพ.101, คพ.102 และ คพ.111",
        "ได้ค่าเฉลี่ยรวมไม่ต่ำกว่า 2.00 ในรายวิชา คพ.100, คพ.101, คพ.102, คพ.111, คพ.232, คพ.240, คพ.251 และ คพ.261",
      ],
    };
  }

  const unwrap = (payload) => {
    if (Array.isArray(payload)) return payload;
    return (
      payload?.data ??
      payload?.items ??
      payload?.results ??
      payload?.body?.data ??
      payload?.body ??
      []
    );
  };
  // สร้าง URL พร้อม query parameters แล้วเรียก API แบบ GET
  const request = async (resource, params = {}) => {
    const url = new URL(API_BASE);
    url.searchParams.set("resource", resource);
    Object.entries(params).forEach(
      ([key, value]) => value && url.searchParams.set(key, value),
    );
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return unwrap(await response.json());
  };
  const text = (item, keys, fallback = "") =>
    keys
      .map((key) => item?.[key])
      .find((value) => value !== undefined && value !== null && value !== "") ??
    fallback;
  const number = (value) =>
    Number(String(value ?? "0").replace(/[^0-9.]/g, "")) || 0;
  const icon = (name) => {
    const paths = {
      general:
        '<path d="M5.5 3h12A1.5 1.5 0 0 1 19 4.5v14H7a2 2 0 0 0-2 2V3.5a.5.5 0 0 1 .5-.5Z"/><path d="M7.4 4.5v13" stroke="#fff" stroke-width="1.3"/><path d="M7 18.5h12" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      major:
        '<path d="m12 2.5 9 5-9 5-9-5 9-5Z"/><path d="m3 10 9 5 9-5v2l-9 5-9-5v-2Z"/><path d="m3 15 9 5 9-5v2l-9 5-9-5v-2Z"/>',
      elective:
        '<path d="M6 2.5h7l5 5v13A1.5 1.5 0 0 1 16.5 22h-10A1.5 1.5 0 0 1 5 20.5V4a1.5 1.5 0 0 1 1-1.5Z"/><path d="M13 2.5v5h5" fill="#fff" opacity=".75"/><path d="M8.5 13h6M8.5 16.5h6" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1.4"/>',
      total:
        '<path d="m2 9.5 10-5 10 5-10 5-10-5Z"/><path d="M6 11.5v4.3c0 1.7 2.7 3.2 6 3.2s6-1.5 6-3.2v-4.3l-6 3-6-3Z"/><path d="M21 10v5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><circle cx="21" cy="16.8" r="1.2"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.general}</svg>`;
  };

  // แปลงรูปแบบข้อมูลจาก API ให้เป็นโครงสร้างเดียวกับที่หน้าเว็บใช้แสดงผล
  function normalisePlan(raw) {
    const source = Array.isArray(raw) ? raw[0] : raw;

    // Structure returned by the team's `study_plan` endpoint.
    if (Array.isArray(source?.detail?.terms)) {
      const buckets = {
        general: [],
        major: [],
        elective: [],
      };
      const addEntry = (key, row) => buckets[key].push(row);

      source.detail.terms.forEach((term) => {
        (term.courses ?? []).forEach((item) => {
          const isGeneral = item.notes?.includes("ศึกษาทั่วไป");
          addEntry(isGeneral ? "general" : "major", [
            item.course?.title_th ?? item.course?.course_code ?? "รายวิชา",
            item.course?.credits_total ?? 0,
            item.notes ?? "รายวิชาตามแผนการศึกษา",
          ]);
        });

        (term.requirements ?? []).forEach((item) => {
          const key =
            item.requirement_type === "free_elective"
              ? "elective"
              : item.requirement_type === "general_choice"
                ? "general"
                : "major";
          addEntry(key, [
            item.course_group ?? "เงื่อนไขรายวิชา",
            item.credits_required ?? 0,
            item.alternatives ?? item.notes ?? "เลือกตามข้อกำหนดของหลักสูตร",
          ]);
        });
      });

      const categories = [
        ["general", "หมวดศึกษาทั่วไป"],
        ["major", "หมวดวิชาเฉพาะ"],
        ["elective", "หมวดวิชาเลือกเสรี"],
      ].map(([key, label]) => ({
        key,
        label,
        credits: buckets[key].reduce((sum, row) => sum + number(row[1]), 0),
        rows: buckets[key],
      }));

      const curriculumId = source.summary?.curriculum_id ?? "";
      const year = curriculumId.match(/(25\d{2})/)?.[1] ?? yearSelect.value;
      return {
        programName: programSelect.selectedOptions[0]?.textContent,
        year,
        type: typeSelect.selectedOptions[0]?.textContent,
        categories,
        graduationCriteria: getMockPlan(source.summary?.study_plan_id)
          .graduationCriteria,
      };
    }

    const rawCategories =
      source?.categories ??
      source?.requirement_categories ??
      source?.credit_requirements ??
      source?.requirements ??
      source?.groups;
    if (!source || !Array.isArray(rawCategories)) return null;
    const categoryNames = ["general", "major", "elective"];
    const categories = rawCategories.map((category, index) => ({
      key: text(
        category,
        ["key", "category_code", "code", "type"],
        categoryNames[index] ?? "other",
      )
        .toLowerCase()
        .includes("general")
        ? "general"
        : text(
              category,
              ["key", "category_code", "code", "type"],
              categoryNames[index],
            )
              .toLowerCase()
              .includes("elect")
          ? "elective"
          : index === 1
            ? "major"
            : (categoryNames[index] ?? "other"),
      label: text(
        category,
        ["name_th", "category_name", "name", "label", "title"],
        `หมวดวิชาที่ ${index + 1}`,
      ),
      credits: number(
        text(
          category,
          ["minimum_credits", "credits", "credit", "required_credits", "units"],
          0,
        ),
      ),
      rows: (
        category.details ??
        category.items ??
        category.subject_groups ??
        category.courses ??
        []
      ).map((row) => [
        text(row, ["name_th", "group_name", "name", "title"], "-"),
        text(row, ["minimum_credits", "credits", "credit", "units"], "-"),
        text(row, ["description_th", "description", "detail", "note"], "-"),
      ]),
    }));
    return {
      programName: text(
        source,
        ["program_name_th", "curriculum_name_th", "program_name", "name"],
        programSelect.selectedOptions[0]?.textContent,
      ),
      year: text(
        source,
        ["curriculum_year", "year", "academic_year"],
        yearSelect.value,
      ),
      type: typeSelect.selectedOptions[0]?.textContent,
      categories,
      graduationCriteria: getMockPlan().graduationCriteria,
    };
  }

  function displayPlan(plan, message = "แสดงข้อมูลล่าสุดจาก API") {
    const total = plan.categories.reduce(
      (sum, category) => sum + number(category.credits),
      0,
    );
    const colorKeys = ["general", "major", "elective", "total"];
    selectedProgram.textContent = `${plan.type} | ${plan.programName} | หลักสูตรปี ${plan.year}`;
    cards.innerHTML = [
      ...plan.categories,
      { key: "total", label: "หน่วยกิตรวมขั้นต่ำ", credits: total },
    ]
      .map(
        (category, index) => `
      <article class="summary-card summary-card--${colorKeys[index] ?? "total"}">
        <span class="summary-card__icon">${icon(category.key)}</span>
        <div><span class="summary-card__label">${category.label}</span><span class="summary-card__value">${category.credits}</span><span class="summary-card__unit">หน่วยกิต</span></div>
      </article>`,
      )
      .join("");
    accordions.innerHTML = plan.categories
      .map((category, index) => {
        const open = index === 0;
        const rows = category.rows.length
          ? category.rows
              .map(
                (row) =>
                  `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`,
              )
              .join("")
          : '<tr><td colspan="3">ไม่มีรายละเอียดรายหมวดจาก API</td></tr>';
        return `<article class="requirement-accordion requirement-accordion--${category.key}">
        <button class="requirement-accordion__button" type="button" aria-expanded="${open}" aria-controls="category-${index}">
          <span class="requirement-accordion__icon">${icon(category.key)}</span><span class="requirement-accordion__title">${category.label} (${category.credits} หน่วยกิต)</span><span class="requirement-accordion__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9.3c2.1 2.1 3.9 4.2 6 6.4 2.1-2.2 3.9-4.3 6-6.4"/></svg></span>
        </button>
        <div id="category-${index}" class="requirement-accordion__content${open ? " is-open" : ""}"><table class="requirement-table"><thead><tr><th>กลุ่มวิชา</th><th>หน่วยกิตขั้นต่ำ</th><th>รายละเอียด</th></tr></thead><tbody>${rows}</tbody></table></div>
      </article>`;
      })
      .join("");
    criteriaList.innerHTML = (plan.graduationCriteria ?? [])
      .map((criterion) => `<li>${criterion}</li>`)
      .join("");
    status.className = "requirements-status";
    status.textContent = message;
  }

  function bindAccordions() {
    accordions
      .querySelectorAll(".requirement-accordion__button")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const expanded = button.getAttribute("aria-expanded") === "true";
          button.setAttribute("aria-expanded", String(!expanded));
          document
            .getElementById(button.getAttribute("aria-controls"))
            .classList.toggle("is-open", !expanded);
        }),
      );
  }

  // แทน native select ด้วย dropdown ที่ออกแบบให้ตรงกับหน้าเว็บ
  function createCustomDropdowns() {
    document.querySelectorAll(".field-group select").forEach((select) => {
      const customSelect = document.createElement("div");
      customSelect.className = "custom-select";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "custom-select__trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML = `<span>${select.selectedOptions[0].textContent}</span><i class="custom-select__chevron" aria-hidden="true"></i>`;

      const menu = document.createElement("div");
      menu.className = "custom-select__menu";
      menu.setAttribute("role", "listbox");

      [...select.options].forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "custom-select__option";
        item.textContent = option.textContent;
        item.setAttribute("role", "option");
        item.dataset.value = option.value;
        item.classList.toggle("is-selected", option.selected);
        item.setAttribute("aria-selected", String(option.selected));

        item.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          trigger.querySelector("span").textContent = option.textContent;
          menu.querySelectorAll(".custom-select__option").forEach((choice) => {
            const selected = choice === item;
            choice.classList.toggle("is-selected", selected);
            choice.setAttribute("aria-selected", String(selected));
          });
          customSelect.classList.remove("is-open");
          trigger.setAttribute("aria-expanded", "false");
        });
        menu.append(item);
      });

      trigger.addEventListener("click", () => {
        const open = customSelect.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", String(open));
        document
          .querySelectorAll(".custom-select.is-open")
          .forEach((dropdown) => {
            if (dropdown !== customSelect) {
              dropdown.classList.remove("is-open");
              dropdown
                .querySelector(".custom-select__trigger")
                .setAttribute("aria-expanded", "false");
            }
          });
      });

      customSelect.append(trigger, menu);
      select.insertAdjacentElement("afterend", customSelect);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".custom-select")) {
        document
          .querySelectorAll(".custom-select.is-open")
          .forEach((dropdown) => {
            dropdown.classList.remove("is-open");
            dropdown
              .querySelector(".custom-select__trigger")
              .setAttribute("aria-expanded", "false");
          });
      }
    });
  }

  function setSearchAvailability() {
    // ป้องกันการเรียก API ด้วยชุดประเภทหลักสูตร/สาขา/ปีที่ไม่มีอยู่จริง
    const supportedProgram = supportedPrograms[programSelect.value];
    const incorrectFields = [];
    const requiredType = typeSelect.querySelector(
      `option[value="${supportedProgram.type}"]`,
    ).textContent;
    if (typeSelect.value !== supportedProgram.type) {
      incorrectFields.push(requiredType);
    }
    if (yearSelect.value !== supportedProgram.year) {
      incorrectFields.push(`ปี ${supportedProgram.year}`);
    }
    const isSupported = incorrectFields.length === 0;

    searchButton.disabled = !isSupported;
    searchButton.setAttribute("aria-disabled", String(!isSupported));

    if (!isSupported) {
      status.className = "requirements-status is-error";
      status.textContent = `ยังไม่มีหลักสูตร ${programSelect.selectedOptions[0].textContent} ในชุดที่เลือก กรุณาเลือก${incorrectFields.join(" และ ")}`;
    } else if (status.textContent.startsWith("ยังไม่มีหลักสูตร")) {
      status.className = "requirements-status";
      status.textContent = "พร้อมค้นหาเงื่อนไขการสำเร็จการศึกษา";
    }

    return isSupported;
  }

  async function loadRequirements() {
    status.className = "requirements-status is-loading";
    status.textContent = "กำลังโหลดข้อมูลเงื่อนไขการสำเร็จการศึกษา...";
    try {
      const detail = await request("study_plan", {
        study_plan_id: programSelect.value,
      });
      const normalised = normalisePlan(detail);
      if (!normalised)
        throw new Error("ข้อมูล API ไม่มีโครงสร้างหน่วยกิตที่แสดงผลได้");
      displayPlan(normalised);
      bindAccordions();
    } catch (error) {
      // หน้าเว็บยังใช้งานได้แม้ API ล้มเหลว โดยเปลี่ยนไปแสดงข้อมูลสำรอง
      displayPlan(
        getMockPlan(),
        "ยังไม่สามารถดึง API ได้ จึงแสดงข้อมูลตัวอย่างชั่วคราว",
      );
      status.className = "requirements-status is-error";
      bindAccordions();
      console.warn("Graduation requirements API error:", error);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!setSearchAvailability()) return;
    loadRequirements();
  });
  programSelect.addEventListener("change", setSearchAvailability);
  yearSelect.addEventListener("change", setSearchAvailability);
  typeSelect.addEventListener("change", setSearchAvailability);
  createCustomDropdowns();
  displayPlan(
    getMockPlan(),
    "กำลังแสดงข้อมูลตัวอย่าง กรุณาเลือกข้อมูลแล้วกดค้นหา",
  );
  setSearchAvailability();
  bindAccordions();
})();
