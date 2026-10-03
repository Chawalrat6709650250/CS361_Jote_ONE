const API_URL = "https://uuo1em3vlb.execute-api.us-east-1.amazonaws.com/prod/api";

/*
 * ตอนนี้หน้านี้ใช้ mock data เพื่อให้ทำ UI และทดสอบ interaction ได้ก่อน
 * เมื่อพร้อมเชื่อม API ให้เปลี่ยน USE_API เป็น true
 */
const USE_API = false;

const mockPlans = {
    "PLAN-APPLIED-2566": {
        title: "วิชาเอกคอมพิวเตอร์ประยุกต์ — แผนสหกิจศึกษา",
        curriculum: "2566",
        totalCourses: 54,
        totalCredits: "XX",
        years: [
            {
                year: "ชั้นปีที่ 1",
                semesters: [
                    {
                        name: "ภาคการศึกษาที่ 1",
                        courses: [
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" },
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" }
                        ]
                    },
                    {
                        name: "ภาคการศึกษาที่ 2",
                        courses: [
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "CS XXX" },
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" }
                        ]
                    },
                    {
                        name: "ภาคฤดูร้อน",
                        courses: [
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" },
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" }
                        ]
                    }
                ]
            },
            {
                year: "ชั้นปีที่ 2",
                semesters: [
                    {
                        name: "ภาคการศึกษาที่ 1",
                        courses: [
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "CS XXX" },
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" }
                        ]
                    }
                ]
            },
            {
                year: "ชั้นปีที่ 3",
                semesters: [
                    {
                        name: "ภาคการศึกษาที่ 1",
                        courses: [
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" }
                        ]
                    }
                ]
            },
            {
                year: "ชั้นปีที่ 4",
                semesters: [
                    {
                        name: "ภาคการศึกษาที่ 1",
                        courses: [
                            { code: "CS XXX", name: "ชื่อวิชาภาษาไทย", english: "Course Title in English", credits: "XX", prerequisite: "ไม่มี" }
                        ]
                    }
                ]
            }
        ]
    },
    "PLAN-APPLIED-2566-GENERAL": {
        title: "วิชาเอกคอมพิวเตอร์ประยุกต์ — แผนปกติ",
        curriculum: "2566",
        totalCourses: 52,
        totalCredits: "XX",
        years: []
    }
};

const studyPlanSelect = document.getElementById("studyPlanSelect");
const curriculumSelect = document.getElementById("curriculumSelect");
const studyPlanContainer = document.getElementById("studyPlanContainer");
const planTitle = document.getElementById("planTitle");
const curriculumText = document.getElementById("curriculumText");
const summaryCourses = document.getElementById("summaryCourses");
const summaryCredits = document.getElementById("summaryCredits");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderStudyPlan(plan) {
    if (!plan) {
        studyPlanContainer.innerHTML = `
            <section class="plan-section">
                <p>ไม่พบข้อมูลแผนการเรียน</p>
            </section>
        `;
        return;
    }

    planTitle.textContent = plan.title;
    curriculumText.textContent = `ปีหลักสูตร ${plan.curriculum}`;
    summaryCourses.textContent = `${plan.totalCourses} วิชา`;
    summaryCredits.textContent = `${plan.totalCredits} หน่วยกิต`;

    if (!plan.years.length) {
        studyPlanContainer.innerHTML = `
            <section class="plan-section">
                <p>ยังไม่มีข้อมูลตัวอย่างของแผนนี้</p>
            </section>
        `;
        return;
    }

    studyPlanContainer.innerHTML = plan.years.map((year, yearIndex) => `
        <section class="plan-section year-section ${yearIndex === 0 ? "" : "collapsed"}">
            <button class="year-header" type="button" aria-expanded="${yearIndex === 0}">
                <span>${escapeHtml(year.year)}</span>
                <span class="chevron"></span>
            </button>

            <div class="year-body">
                ${year.semesters.map(semester => `
                    <div class="semester">
                        <h3 class="semester-title">${escapeHtml(semester.name)}</h3>
                        <div class="course-list">
                            ${semester.courses.map(course => `
                                <article class="course-row">
                                    <div class="course-code">${escapeHtml(course.code)}</div>

                                    <div class="course-name">
                                        <strong>${escapeHtml(course.name)}</strong>
                                        <span>${escapeHtml(course.english)}</span>
                                    </div>

                                    <div class="course-meta">
                                        <strong>${escapeHtml(course.credits)} หน่วยกิต</strong>
                                        <span>รายวิชา</span>
                                        <button
                                            type="button"
                                            class="detail-btn"
                                            data-course='${encodeURIComponent(JSON.stringify(course))}'
                                        >
                                            ดูรายละเอียด →
                                        </button>
                                    </div>
                                </article>
                            `).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        </section>
    `).join("");

    bindYearToggles();
    bindCourseButtons();
}

function bindYearToggles() {
    document.querySelectorAll(".year-header").forEach(button => {
        button.addEventListener("click", () => {
            const section = button.closest(".year-section");
            const isCollapsed = section.classList.toggle("collapsed");
            button.setAttribute("aria-expanded", String(!isCollapsed));
        });
    });
}

function bindCourseButtons() {
    document.querySelectorAll(".detail-btn").forEach(button => {
        button.addEventListener("click", () => {
            const course = JSON.parse(decodeURIComponent(button.dataset.course));
            openCourseModal(course);
        });
    });
}

function openCourseModal(course) {

    // หัวข้อ
    document.getElementById("modalTitle").textContent =
        course.code;

    document.getElementById("modalCourseName").textContent =
        `${course.name} (${course.english})`;


    // ข้อมูลพื้นฐาน
    document.getElementById("modalCredits").textContent =
        `${course.credits} หน่วยกิต`;

    document.getElementById("modalCourseType").textContent =
        course.courseType || "XXX";

    document.getElementById("modalCourseGroup").textContent =
        course.courseGroup || "XXX";

    document.getElementById("modalCourseSubType").textContent =
        course.courseSubType || "XXX";

    document.getElementById("modalCurriculumType").textContent =
        course.curriculumType || "XXX";

    document.getElementById("modalPrerequisite").textContent =
        course.prerequisite || "ไม่มี";


    // คำอธิบายรายวิชา
    document.getElementById("modalDescription").textContent =
        course.description || "ไม่มีข้อมูล";


    // Course-PLO Mapping
    const ploContainer =
        document.getElementById("modalPloMapping");

    ploContainer.innerHTML = "";

    if (course.ploMapping && course.ploMapping.length > 0) {

        course.ploMapping.forEach(plo => {

            const li = document.createElement("li");

            li.innerHTML = `
                <strong>${escapeHtml(plo.code)}</strong>
                <span>${escapeHtml(plo.description)}</span>
            `;

            ploContainer.appendChild(li);
        });

    } else {

        ploContainer.innerHTML =
            "<li>ไม่มีข้อมูล PLO Mapping</li>";
    }


    // รายวิชาที่ต่อยอด
    const nextCoursesContainer =
        document.getElementById("modalNextCourses");

    nextCoursesContainer.innerHTML = "";

    if (course.nextCourses && course.nextCourses.length > 0) {

        course.nextCourses.forEach(nextCourse => {

            const li = document.createElement("li");

            li.innerHTML = `
                <strong>
                    ${escapeHtml(nextCourse.code)}
                    ${escapeHtml(nextCourse.name)}
                </strong>

                <span>
                    ${escapeHtml(nextCourse.description)}
                </span>
            `;

            nextCoursesContainer.appendChild(li);
        });

    } else {

        nextCoursesContainer.innerHTML =
            "<li>ไม่มีรายวิชาที่ต่อยอดจากวิชานี้</li>";
    }


    // เปิด Modal
    document
        .getElementById("courseModal")
        .classList.add("open");

    document
        .getElementById("courseModal")
        .setAttribute("aria-hidden", "false");
}

function closeCourseModal() {
    document.getElementById("courseModal").classList.remove("open");
    document.getElementById("courseModal").setAttribute("aria-hidden", "true");
}

document.querySelectorAll("[data-close-modal]").forEach(element => {
    element.addEventListener("click", closeCourseModal);
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeCourseModal();
    }
});

studyPlanSelect.addEventListener("change", async () => {
    await loadSelectedPlan();
});

curriculumSelect.addEventListener("change", async () => {
    await loadSelectedPlan();
});

async function loadSelectedPlan() {
    const planId = studyPlanSelect.value;

    if (!USE_API) {
        renderStudyPlan(mockPlans[planId]);
        return;
    }

    try {
        const url =
            `${API_URL}?resource=study_plan&study_plan_id=${encodeURIComponent(planId)}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // TODO:
        // ปรับ mapApiStudyPlan() ให้ตรงกับ JSON จริงจาก API ของอาจารย์
        renderStudyPlan(mapApiStudyPlan(data));
    } catch (error) {
        console.error("Study plan API error:", error);
        studyPlanContainer.innerHTML = `
            <section class="plan-section">
                <p>ไม่สามารถโหลดข้อมูลแผนการเรียนได้ กรุณาลองใหม่อีกครั้ง</p>
            </section>
        `;
    }
}

function mapApiStudyPlan(data) {
    /*
     * จุดนี้ตั้งใจแยกไว้เพื่อให้ตอน API จริงมา
     * เราแก้เฉพาะการ map JSON ไม่ต้องรื้อ HTML/CSS
     */
    return {
        title: data.title || "แผนการเรียน",
        curriculum: data.curriculum || curriculumSelect.value,
        totalCourses: data.total_courses ?? "XX",
        totalCredits: data.total_credits ?? "XX",
        years: data.years || []
    };
}

loadSelectedPlan();
