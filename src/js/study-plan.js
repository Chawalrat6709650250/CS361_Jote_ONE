const API_URL =
  "https://uuo1em3vlb.execute-api.us-east-1.amazonaws.com/prod/api";

let allStudyPlans = [];

// ========================================
// INIT
// ========================================

document.addEventListener("DOMContentLoaded", async () => {
     setupBackButton();
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

  document
  .querySelectorAll("[data-close-modal]")
  .forEach((element) => {

    element.addEventListener(
      "click",
      closeCourseModal
    );

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
    await loadElectiveCourses(
  mappedPlan.curriculumId,
  mappedPlan.pathwayId
);
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
  id: studyPlan.study_plan_id,
  title: studyPlan.plan_name_th,
  titleEn: studyPlan.plan_name_en,
  curriculumId: studyPlan.curriculum_id,
  pathwayId: studyPlan.pathway_id,
  notes: studyPlan.notes,
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
    ? `
      <div class="plan-note-box">
        <strong>หมายเหตุแผนการเรียน</strong>
        <p>${escapeHtml(plan.notes)}</p>
      </div>
    `
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

function createRequirementRow(requirement) {
  const row = document.createElement("div");

  row.className = "course-row requirement-row";

  row.innerHTML = `
    <div class="course-code requirement-code">
      เลือก
    </div>

    <div class="course-name">
      <strong>
        ${escapeHtml(
          requirement.course_group || "รายวิชาเลือก"
        )}
      </strong>

      ${
        requirement.alternatives
          ? `
            <span>
              ${escapeHtml(requirement.alternatives)}
            </span>
          `
          : ""
      }

      ${
        requirement.notes
          ? `
            <span class="requirement-note">
              ${escapeHtml(requirement.notes)}
            </span>
          `
          : ""
      }
    </div>

    <div class="course-meta">
      <strong>
        ${Number(requirement.credits_required || 0)}
        หน่วยกิต
      </strong>

      <span class="requirement-type">
        ${getRequirementTypeText(requirement.requirement_type)}
      </span>
    </div>
  `;

  return row;
}

function getRequirementTypeText(type) {
  switch (type) {
    case "required":
      return "วิชาบังคับ";

    case "general_choice":
      return "วิชาเลือก";

    case "free_elective":
      return "วิชาเลือกเสรี";

    default:
      return type || "-";
  }
}
// ========================================
// REQUIREMENT CARD
// ========================================



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

function openCourseModal(apiData, fallbackCourse) {
  const modal =
    document.getElementById("courseModal");

  if (!modal) return;

  const detail =
    apiData?.detail || {};

  const course =
    detail.course || {};

  const classification =
    detail.classification || {};

  const curriculum =
    detail.curriculum || {};

  const prerequisite =
    detail.prerequisite ||
    apiData?.prerequisites ||
    {};

  const ploMappings =
    detail.plo_mappings ||
    apiData?.plo_mappings ||
    [];

  const dependentCourses =
    detail.dependent_courses || [];

  // =========================
  // HEADER
  // =========================

  const codeTh =
    course.course_code_th ||
    fallbackCourse?.courseCodeTh ||
    "";

  const code =
    course.course_code ||
    fallbackCourse?.courseCode ||
    "";

  const titleTh =
    course.title_th ||
    fallbackCourse?.titleTh ||
    "";

  const titleEn =
    course.title_en ||
    fallbackCourse?.titleEn ||
    "";

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

  // =========================
  // BASIC INFO
  // =========================

  const credits =
    course.credits?.total ??
    fallbackCourse?.credits ??
    "-";

  setTextIfExists(
    "modalCredits",
    `${credits} หน่วยกิต`
  );

  setTextIfExists(
    "modalCourseType",
    classification.course_type?.label_th || "-"
  );

  setTextIfExists(
    "modalCourseGroup",
    curriculum.course_group || "-"
  );

  const subcategoryText =
    classification.subcategories
      ?.map(item => item.label_th)
      .filter(Boolean)
      .join(", ") || "-";

  setTextIfExists(
    "modalCourseSubType",
    subcategoryText
  );

  setTextIfExists(
    "modalCurriculumType",
    getRequirementTypeText(
      curriculum.requirement_type
    )
  );

  // =========================
  // PREREQUISITE
  // =========================

  let prerequisiteText = "-";

  if (
    prerequisite.prerequisite_text_th
  ) {
    prerequisiteText =
      prerequisite.prerequisite_text_th;
  } else if (
    prerequisite.rules &&
    prerequisite.rules.length > 0
  ) {
    prerequisiteText =
      prerequisite.rules
        .map(rule =>
          rule.course_code_th ||
          rule.course_code ||
          ""
        )
        .filter(Boolean)
        .join(", ");
  }

  setTextIfExists(
    "modalPrerequisite",
    prerequisiteText
  );

  // =========================
  // DESCRIPTION
  // =========================

  setTextIfExists(
    "modalDescription",
    course.description_th || "-"
  );

  // =========================
  // PLO MAPPING
  // =========================

  const ploList =
    document.getElementById(
      "modalPloMapping"
    );

  if (ploList) {
    ploList.innerHTML = "";

    if (ploMappings.length === 0) {
      const li =
        document.createElement("li");

      li.textContent =
        "ไม่มีข้อมูล PLO Mapping";

      ploList.appendChild(li);
    } else {
      const sortedPlo =
        [...ploMappings].sort(
          (a, b) =>
            Number(
              a.display_order || 0
            ) -
            Number(
              b.display_order || 0
            )
        );

      sortedPlo.forEach((mapping) => {
        const li =
          document.createElement("li");

        li.innerHTML = `
          <strong>
            ${escapeHtml(
              mapping.plo_code || ""
            )}
            ${
              mapping.contribution_level
                ? `(${escapeHtml(
                    mapping.contribution_level
                  )})`
                : ""
            }
          </strong>
          ${escapeHtml(
            mapping.description_th || ""
          )}
        `;

        ploList.appendChild(li);
      });
    }
  }

  // =========================
  // DEPENDENT / NEXT COURSES
  // =========================

  const nextCoursesList =
    document.getElementById(
      "modalNextCourses"
    );

  if (nextCoursesList) {
    nextCoursesList.innerHTML = "";

    if (
      dependentCourses.length === 0
    ) {
      const li =
        document.createElement("li");

      li.textContent =
        "ไม่มีรายวิชาที่ต่อยอดจากวิชานี้";

      nextCoursesList.appendChild(li);
    } else {
      dependentCourses.forEach(
        (item) => {
          const li =
            document.createElement("li");

          li.innerHTML = `
            <strong>
              ${escapeHtml(
                item.course_code_th ||
                item.course_code ||
                ""
              )}
              ${escapeHtml(
                item.title_th || ""
              )}
            </strong>

            <span>
              ${escapeHtml(
                item.relationship_type_th ||
                item.notes ||
                ""
              )}
            </span>
          `;

          nextCoursesList.appendChild(
            li
          );
        }
      );
    }
  }

  // =========================
  // OPEN MODAL
  // =========================

  modal.classList.add("open");

  modal.setAttribute(
    "aria-hidden",
    "false"
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

function closeCourseModal() {
  const modal =
    document.getElementById("courseModal");

  if (!modal) return;

  modal.classList.remove("open");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}

async function loadElectiveCourses(
  curriculumId,
  pathwayId
) {
  const container =
    document.getElementById(
      "electiveCoursesContainer"
    );

  const countElement =
    document.getElementById(
      "electiveCourseCount"
    );

  if (!container) return;

  container.innerHTML = `
    <p class="loading-message">
      กำลังโหลดรายวิชาเลือก...
    </p>
  `;

  try {
    // ตอนนี้ยังไม่ใช้ curriculum_id parameter
    // เพราะ backend filter ยังคืน [] อยู่
    const response = await fetch(
      `${API_URL}?resource=courses`
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

    const allCourses =
      result.data?.courses || [];

    // กรองให้ตรงหลักสูตร + วิชาเอก + elective
    const electiveCourses =
      allCourses.filter((course) => {
        const curriculum =
          course.curriculum || {};

        return (
          course.active === true &&
          course.status === "active" &&
          curriculum.curriculum_id ===
            curriculumId &&
          curriculum.pathway_id ===
            pathwayId &&
          curriculum.requirement_type ===
            "elective"
        );
      });

    renderElectiveCourses(
      electiveCourses
    );

    if (countElement) {
      countElement.textContent =
        `${electiveCourses.length} รายวิชา`;
    }

  } catch (error) {
    console.error(
      "Failed to load elective courses:",
      error
    );

    container.innerHTML = `
      <p class="empty-message">
        ไม่สามารถโหลดรายวิชาเลือกได้
      </p>
    `;

    if (countElement) {
      countElement.textContent = "-";
    }
  }
}

function renderElectiveCourses(courses) {
  const container =
    document.getElementById(
      "electiveCoursesContainer"
    );

  if (!container) return;

  container.innerHTML = "";

  if (courses.length === 0) {
    container.innerHTML = `
      <p class="empty-message">
        ไม่พบรายวิชาเลือกสำหรับแผนการเรียนนี้
      </p>
    `;
    return;
  }

  // จัดกลุ่มตาม course_group
  const groups = {};

  courses.forEach((course) => {
    const group =
      course.curriculum?.course_group ||
      "รายวิชาเลือก";

    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push(course);
  });

  Object.entries(groups).forEach(
    ([groupName, groupCourses]) => {

      const group =
        document.createElement("div");

      group.className =
        "elective-group";

      const heading =
        document.createElement("h3");

      heading.textContent =
        groupName;

      group.appendChild(heading);

      const list =
        document.createElement("div");

      list.className =
        "course-list";

      groupCourses.forEach((course) => {
        const row =
          document.createElement("div");

        row.className = "course-row";

        row.innerHTML = `
          <div class="course-code">
            ${escapeHtml(
              course.course_code_th ||
              course.course_code
            )}
          </div>

          <div class="course-name">
            <strong>
              ${escapeHtml(
                course.title_th || ""
              )}
            </strong>

            <span>
              ${escapeHtml(
                course.title_en || ""
              )}
            </span>
          </div>

          <div class="course-meta">
            <strong>
              ${Number(
                course.credits_total || 0
              )} หน่วยกิต
            </strong>

            <span>
              วิชาเลือก
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
          row.querySelector(
            ".detail-btn"
          );

        button.addEventListener(
          "click",
          () => {
            loadCourseDetail(
              course.course_code,
              {
                courseCode:
                  course.course_code,
                courseCodeTh:
                  course.course_code_th,
                titleTh:
                  course.title_th,
                titleEn:
                  course.title_en,
                credits:
                  course.credits_total,
              }
            );
          }
        );

        list.appendChild(row);
      });

      group.appendChild(list);
      container.appendChild(group);
    }
  );
}

function setupBackButton() {
  const backButton =
    document.getElementById("backToDepartment");

  if (!backButton) return;

  const params =
    new URLSearchParams(window.location.search);

  const department =
    params.get("department");

  const departmentPages = {
    "computer-information":
      "computer-information.html",

    "applied-computer":
      "applied-computer.html",

    "computer-network":
      "computer-network.html",
  };

  const targetPage =
    departmentPages[department];

  if (targetPage) {
    backButton.href = `./${targetPage}`;
  } else {
    backButton.href = "../index.html";
  }
}