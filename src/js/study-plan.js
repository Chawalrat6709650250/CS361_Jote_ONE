const API_URL =
  "https://uuo1em3vlb.execute-api.us-east-1.amazonaws.com/prod/api";

let allStudyPlans = [];

// ========================================
// INIT
// ========================================

document.addEventListener("DOMContentLoaded", async () => {
  const curriculumSelect = document.getElementById("curriculumSelect");
  const studyPlanSelect = document.getElementById("studyPlanSelect");

  if (!curriculumSelect || !studyPlanSelect) {
    console.error(
      "ไม่พบ curriculumSelect หรือ studyPlanSelect ใน HTML"
    );
    return;
  }

  curriculumSelect.addEventListener("change", async () => {
    populateStudyPlanDropdown();
    await loadSelectedPlan();
  });

  studyPlanSelect.addEventListener("change", async () => {
    await loadSelectedPlan();
  });

  await loadStudyPlans();
});

// ========================================
// LOAD ALL STUDY PLANS
// ========================================

async function loadStudyPlans() {
  try {
    showLoading();

    const response = await fetch(
      `${API_URL}?resource=study_plans`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error("API returned success = false");
    }

    allStudyPlans = result.data?.study_plans || [];

    allStudyPlans = allStudyPlans.filter(
      (plan) =>
        plan.active === true &&
        plan.status === "active"
    );

    // สร้าง dropdown ปี
    populateYearDropdown();

    // สร้าง dropdown แผน
    populateStudyPlanDropdown();

    // หา element ใหม่ใน scope นี้
    const curriculumSelect =
      document.getElementById("curriculumSelect");

    const studyPlanSelect =
      document.getElementById("studyPlanSelect");

    curriculumSelect.disabled = false;
    studyPlanSelect.disabled = false;

    // โหลดแผนแรก
    await loadSelectedPlan();

  } catch (error) {
    console.error(
      "Failed to load study plans:",
      error
    );

    showError(
      "ไม่สามารถโหลดข้อมูลแผนการเรียนได้"
    );
  }
}
// ========================================
// YEAR DROPDOWN
// ========================================

function populateYearDropdown() {
  const curriculumSelect =
    document.getElementById("curriculumSelect");

  const years = [
    ...new Set(
      allStudyPlans
        .map((plan) =>
          getYearFromCurriculumId(
            plan.curriculum_id
          )
        )
        .filter(Boolean)
    ),
  ].sort((a, b) => Number(a) - Number(b));

  curriculumSelect.innerHTML = "";

  years.forEach((year) => {
    const option =
      document.createElement("option");

    option.value = year;
    option.textContent = year;

    curriculumSelect.appendChild(option);
  });
}

function getYearFromCurriculumId(
  curriculumId
) {
  if (!curriculumId) return "";

  const parts = curriculumId.split("-");

  return parts[parts.length - 1] || "";
}

// ========================================
// STUDY PLAN DROPDOWN
// ========================================

function populateStudyPlanDropdown() {
  const curriculumSelect =
    document.getElementById("curriculumSelect");

  const studyPlanSelect =
    document.getElementById("studyPlanSelect");

  const selectedYear =
    curriculumSelect.value;

  const filteredPlans =
    allStudyPlans.filter((plan) => {
      const year =
        getYearFromCurriculumId(
          plan.curriculum_id
        );

      return year === selectedYear;
    });

  studyPlanSelect.innerHTML = "";

  if (filteredPlans.length === 0) {
    const option =
      document.createElement("option");

    option.value = "";
    option.textContent =
      "ไม่พบแผนการเรียน";

    studyPlanSelect.appendChild(option);

    return;
  }

  filteredPlans.forEach((plan) => {
    const option =
      document.createElement("option");

    option.value =
      plan.study_plan_id;

    option.textContent =
      plan.plan_name_th;

    studyPlanSelect.appendChild(option);
  });
}

// ========================================
// LOAD SELECTED PLAN
// ========================================

async function loadSelectedPlan() {
  const studyPlanSelect =
    document.getElementById("studyPlanSelect");

  const planId =
    studyPlanSelect?.value;

  if (!planId) return;

  try {
    showLoading();

    const response = await fetch(
      `${API_URL}?resource=study_plan&study_plan_id=${encodeURIComponent(
        planId
      )}`
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(
        "API returned success = false"
      );
    }

    const mappedPlan =
      mapApiStudyPlan(result.data);

    renderStudyPlan(mappedPlan);
  } catch (error) {
    console.error(
      "Failed to load selected plan:",
      error
    );

    showError(
      "ไม่สามารถโหลดรายละเอียดแผนการเรียนได้"
    );
  }
}

// ========================================
// MAP API DATA
// ========================================

function mapApiStudyPlan(data) {
  const studyPlan =
    data?.detail?.study_plan ||
    data?.summary ||
    {};

  const terms =
    data?.detail?.terms || [];

  const yearsMap = {};

  terms.forEach((term) => {
    const year = term.study_year;
    const semester =
      term.semester;

    if (!yearsMap[year]) {
      yearsMap[year] = {
        year,
        semesters: [],
      };
    }

    const courses = (
      term.courses || []
    ).map((item) => {
      const course =
        item.course || {};

      return {
        courseCode:
          course.course_code || "",
        courseCodeTh:
          course.course_code_th || "",
        titleTh:
          course.title_th || "",
        titleEn:
          course.title_en || "",
        credits:
          Number(
            course.credits_total || 0
          ),
        role:
          item.course_role || "",
        recommended:
          item.recommended ?? true,
        notes:
          item.notes || "",
        curriculumCourseId:
          item.curriculum_course_id ||
          "",
        studyPlanCourseId:
          item.study_plan_course_id ||
          "",
        sequence:
          item.sequence ?? null,
      };
    });

    const requirements =
      term.requirements || [];

    yearsMap[year].semesters.push({
      semester,
      courses,
      requirements,
    });
  });

  const years = Object.values(
    yearsMap
  ).sort(
    (a, b) =>
      Number(a.year) -
      Number(b.year)
  );

  years.forEach((year) => {
    year.semesters.sort(
      (a, b) =>
        Number(a.semester) -
        Number(b.semester)
    );
  });

  let totalCourses = 0;
  let totalCredits = 0;

  years.forEach((year) => {
    year.semesters.forEach(
      (semester) => {
        totalCourses +=
          semester.courses.length;

        totalCredits +=
          semester.courses.reduce(
            (sum, course) =>
              sum +
              Number(
                course.credits || 0
              ),
            0
          );

        totalCredits +=
          semester.requirements.reduce(
            (sum, req) =>
              sum +
              Number(
                req.credits_required ||
                  0
              ),
            0
          );
      }
    );
  });

  return {
    id:
      studyPlan.study_plan_id || "",
    title:
      studyPlan.plan_name_th || "",
    titleEn:
      studyPlan.plan_name_en || "",
    curriculumId:
      studyPlan.curriculum_id || "",
    notes:
      studyPlan.notes || "",
    years,
    totalCourses,
    totalCredits,
  };
}

// ========================================
// RENDER STUDY PLAN
// ========================================

function renderStudyPlan(plan) {
  const container =
    getStudyPlanContainer();

  if (!container) {
    console.error(
      "ไม่พบ container สำหรับแสดง Study Plan"
    );
    return;
  }

  container.innerHTML = "";

  const header =
    document.createElement("div");

  header.className =
    "study-plan-header";

  header.innerHTML = `
    <h2>${escapeHtml(
      plan.title
    )}</h2>

    ${
      plan.titleEn
        ? `<p>${escapeHtml(
            plan.titleEn
          )}</p>`
        : ""
    }

    ${
      plan.notes
        ? `<p class="plan-note">${escapeHtml(
            plan.notes
          )}</p>`
        : ""
    }
  `;

  container.appendChild(header);

  if (
    !plan.years ||
    plan.years.length === 0
  ) {
    container.innerHTML += `
      <div class="empty-message">
        ไม่พบข้อมูลแผนการเรียน
      </div>
    `;

    return;
  }

  plan.years.forEach(
    (yearData, index) => {
      const yearSection =
        createYearSection(
          yearData,
          index === 0
        );

      container.appendChild(
        yearSection
      );
    }
  );

  updateSummary(plan);
}

// ========================================
// CREATE YEAR ACCORDION
// ========================================

function createYearSection(yearData, openByDefault = false) {
  const section = document.createElement("section");

  section.className = "plan-section year-section";

  if (!openByDefault) {
    section.classList.add("collapsed");
  }

  const header = document.createElement("button");

  header.type = "button";
  header.className = "year-header";

  header.innerHTML = `
    <span>ชั้นปีที่${yearData.year}</span>
    <span class="chevron"></span>
  `;

  const body = document.createElement("div");

  body.className = "year-body";

  yearData.semesters.forEach((semester) => {
    body.appendChild(
      createSemesterSection(semester)
    );
  });

  header.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });

  section.appendChild(header);
  section.appendChild(body);

  return section;
}

// ========================================
// CREATE SEMESTER SECTION
// ========================================

function createSemesterSection(semesterData) {
  const semester = document.createElement("div");

  semester.className = "semester";

  const title = document.createElement("h3");

  title.className = "semester-title";
  title.textContent = getSemesterName(
    semesterData.semester
  );

  const courseList = document.createElement("div");

  courseList.className = "course-list";

  semesterData.courses.forEach((course) => {
    courseList.appendChild(
      createCourseRow(course)
    );
  });

  semesterData.requirements.forEach((requirement) => {
    courseList.appendChild(
      createRequirementRow(requirement)
    );
  });

  semester.appendChild(title);
  semester.appendChild(courseList);

  return semester;
}

function getSemesterName(
  semester
) {
  const value =
    String(semester).toLowerCase();

  if (
    value === "1" ||
    value === "semester1"
  ) {
    return "ภาคการศึกษาที่ 1";
  }

  if (
    value === "2" ||
    value === "semester2"
  ) {
    return "ภาคการศึกษาที่ 2";
  }

  if (
    value === "3" ||
    value === "summer"
  ) {
    return "ภาคฤดูร้อน";
  }

  return `ภาคการศึกษา ${semester}`;
}

// ========================================
// COURSE CARD
// ========================================

function createCourseRow(course) {
  const row = document.createElement("div");

  row.className = "course-row";

  const roleText =
    getCourseRoleText(course.role);

  row.innerHTML = `
    <div class="course-code">
      ${escapeHtml(
        course.courseCodeTh ||
        course.courseCode
      )}
    </div>

    <div class="course-name">
      <strong>
        ${escapeHtml(course.titleTh)}
      </strong>

      <span>
        ${escapeHtml(course.titleEn)}
      </span>
    </div>

    <div class="course-meta">
      <strong>
        ${course.credits} หน่วยกิต
      </strong>

      <span>
        ${escapeHtml(roleText)}
      </span>

      <button
        type="button"
        class="detail-btn"
      >
        ดูรายละเอียด →
      </button>
    </div>
  `;

  const button =
    row.querySelector(".detail-btn");

  button.addEventListener("click", () => {
    loadCourseDetail(
      course.courseCode,
      course
    );
  });

  return row;
}

// ========================================
// REQUIREMENT CARD
// ========================================

function createRequirementCard(
  requirement
) {
  const card =
    document.createElement("div");

  card.className =
    "requirement-card";

  card.innerHTML = `
    <div class="requirement-info">

      <div class="requirement-title">
        ${escapeHtml(
          requirement.course_group ||
            "รายวิชาเลือก"
        )}
      </div>

      ${
        requirement.alternatives
          ? `
          <div class="requirement-alternatives">
            ${escapeHtml(
              requirement.alternatives
            )}
          </div>
        `
          : ""
      }

      ${
        requirement.notes
          ? `
          <div class="requirement-note">
            ${escapeHtml(
              requirement.notes
            )}
          </div>
        `
          : ""
      }

    </div>

    <div class="requirement-credit">
      ${
        requirement.credits_required ||
        0
      } หน่วยกิต
    </div>
  `;

  return card;
}

// ========================================
// COURSE DETAIL
// ========================================

async function loadCourseDetail(
  courseCode,
  fallbackCourse = null
) {
  if (!courseCode) return;

  try {
    const response = await fetch(
      `${API_URL}?resource=course&course_code=${encodeURIComponent(
        courseCode
      )}`
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const result =
      await response.json();

    if (!result.success) {
      throw new Error(
        "API returned success = false"
      );
    }

    openCourseModal(
      result.data,
      fallbackCourse
    );
  } catch (error) {
    console.error(
      "Failed to load course detail:",
      error
    );

    if (fallbackCourse) {
      openCourseModal(
        null,
        fallbackCourse
      );
    }
  }
}

// ========================================
// MODAL
// ========================================

function openCourseModal(
  apiData,
  fallbackCourse
) {
  /*
    ตอนนี้ยังไม่รู้ JSON ของ resource=course แบบเต็ม
    จึงใช้ข้อมูลจาก study_plan เป็น fallback ก่อน

    ถ้า HTML เดิมของเธอมี modal อยู่แล้ว
    function นี้สามารถปรับ selector
    ให้ตรงกับ modal เดิมได้ภายหลัง
  */

  const course =
    apiData?.course ||
    apiData?.detail ||
    apiData ||
    fallbackCourse ||
    {};

  const code =
    course.course_code ||
    fallbackCourse?.courseCode ||
    "";

  const codeTh =
    course.course_code_th ||
    fallbackCourse?.courseCodeTh ||
    "";

  const titleTh =
    course.title_th ||
    fallbackCourse?.titleTh ||
    "";

  const titleEn =
    course.title_en ||
    fallbackCourse?.titleEn ||
    "";

  const credits =
    course.credits_total ??
    fallbackCourse?.credits ??
    "";

  // ลองหา modal เดิมก่อน
  const existingModal =
    document.getElementById(
      "courseModal"
    );

  setTextIfExists(
  "modalTitle",
  codeTh || code
);

setTextIfExists(
  "modalCourseName",
  titleTh
);

setTextIfExists(
  "modalCourseNameEn",
  titleEn
);

setTextIfExists(
  "modalCredits",
  credits
    ? `${credits} หน่วยกิต`
    : "-"
);
    existingModal.classList.add("open");
existingModal.setAttribute(
  "aria-hidden",
  "false"
);

  // fallback modal กรณี HTML ยังไม่มี
  const modal =
    document.createElement("div");

  modal.className =
    "simple-course-modal";

  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background =
    "rgba(0,0,0,0.45)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent =
    "center";
  modal.style.zIndex = "9999";

  modal.innerHTML = `
    <div
      style="
        background:#fff;
        width:min(620px,90%);
        max-height:85vh;
        overflow:auto;
        border-radius:16px;
        padding:24px;
      "
    >

      <button
        type="button"
        class="simple-modal-close"
        style="
          float:right;
          border:none;
          background:none;
          font-size:24px;
          cursor:pointer;
        "
      >
        ×
      </button>

      <h2>
        ${escapeHtml(
          codeTh || code
        )}
      </h2>

      <h3>
        ${escapeHtml(titleTh)}
      </h3>

      <p>
        ${escapeHtml(titleEn)}
      </p>

      ${
        credits !== ""
          ? `
          <p>
            <strong>
              หน่วยกิต:
            </strong>
            ${escapeHtml(
              String(credits)
            )}
          </p>
        `
          : ""
      }

      <p style="color:#666;">
        ข้อมูลรายละเอียดเพิ่มเติม
        เช่น PLO และวิชาบังคับก่อน
        จะเชื่อมจาก API course
        เมื่อกำหนดโครง JSON
        ครบแล้ว
      </p>

    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn =
    modal.querySelector(
      ".simple-modal-close"
    );

  closeBtn.addEventListener(
    "click",
    () => {
      modal.remove();
    }
  );

  modal.addEventListener(
    "click",
    (event) => {
      if (
        event.target === modal
      ) {
        modal.remove();
      }
    }
  );
}

function setTextIfExists(
  id,
  value
) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      value ?? "";
  }
}

// ========================================
// COURSE ROLE
// ========================================

function getCourseRoleText(role) {
  switch (role) {
    case "required":
      return "วิชาบังคับ";

    case "project":
      return "วิชาโครงงาน";

    case "elective":
      return "วิชาเลือก";

    case "free_elective":
      return "วิชาเลือกเสรี";

    default:
      return role || "";
  }
}

// ========================================
// SUMMARY
// ========================================

function updateSummary(plan) {
  const totalSemesters =
    plan.years.reduce(
      (sum, year) =>
        sum + year.semesters.length,
      0
    );

  setTextIfExists(
    "totalCourses",
    `${plan.totalCourses} รายการ`
  );

  setTextIfExists(
    "totalYears",
    `${plan.years.length} ปี`
  );

  setTextIfExists(
    "totalSemesters",
    `${totalSemesters} ภาคการศึกษา`
  );

  setTextIfExists(
    "totalCredits",
    `${plan.totalCredits} หน่วยกิต`
  );

  setTextIfExists(
    "planTitle",
    plan.title
  );

  const year =
    getYearFromCurriculumId(
      plan.curriculumId
    );

  setTextIfExists(
    "curriculumText",
    year
      ? `ปีหลักสูตร ${year}`
      : ""
  );

  setTextIfExists(
    "planNotes",
    plan.notes || ""
  );
}

// ========================================
// LOADING / ERROR
// ========================================

function getStudyPlanContainer() {
  return (
    document.getElementById(
      "studyPlanContent"
    ) ||
    document.getElementById(
      "studyPlanContainer"
    ) ||
    document.querySelector(
      ".study-plan-content"
    ) ||
    document.querySelector(
      ".study-plan-container"
    )
  );
}

function showLoading() {
  const container =
    getStudyPlanContainer();

  if (!container) return;

  container.innerHTML = `
    <div class="loading-message">
      กำลังโหลดข้อมูล...
    </div>
  `;
}

function showError(message) {
  const container =
    getStudyPlanContainer();

  if (!container) {
    alert(message);
    return;
  }

  container.innerHTML = `
    <div class="error-message">
      ${escapeHtml(message)}
    </div>
  `;
}

// ========================================
// SAFE HTML
// ========================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}