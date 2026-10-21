// ===== V3: รายวิชาทดสอบ (ตาราง TestCourses) บนหน้าหลักสูตร =====
// ใช้ API: ?resource=test_courses&year=2561  และ  ?resource=test_course&year=2561&course_code=CS254
(function () {
  const root = document.querySelector("[data-test-courses]");
  if (!root || !window.Auth) return;

  const YEARS = ["2561", "2566"];
  const tabs = root.querySelector(".test-courses__tabs");
  const list = root.querySelector(".test-courses__list");
  const detail = root.querySelector(".test-courses__detail");
  const status = root.querySelector(".test-courses__status");
  const cache = {};

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  // ปีเริ่มต้น: ตามกลุ่มผู้ใช้ (Student61 / Student66) ถ้าไม่มีใช้ปีแรก
  const groups = Auth.isLoggedIn() ? Auth.getUser()?.groups || [] : [];
  let year = groups.includes("Student66") ? "2566" : "2561";

  tabs.innerHTML = YEARS.map((y) =>
    `<button type="button" role="tab" data-year="${y}">หลักสูตร พ.ศ. ${y}</button>`).join("");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-year]");
    if (btn && btn.dataset.year !== year) loadYear(btn.dataset.year);
  });

  list.addEventListener("click", (e) => {
    const card = e.target.closest("[data-code]");
    if (card) openCourse(card.dataset.code);
  });

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
    status.hidden = !text;
  }

  function renderPrereq(p) {
    if (!p?.items?.length) return "<p>ไม่มีวิชาบังคับก่อน</p>";
    const items = p.items.map((it, i) =>
      `<li>${i ? `<span class="test-courses__op">${p.op === "OR" ? "หรือ" : "และ"}</span>` : ""}` +
      `<strong>${esc(it.course)}</strong>` +
      (it.condition === "min_grade"
        ? `<span class="test-courses__cond test-courses__cond--grade">เกรด ≥ ${esc(it.grade)}</span>`
        : `<span class="test-courses__cond">เคยศึกษา</span>`) + `</li>`).join("");
    return `<ul class="test-courses__prereq">${items}</ul>` +
      (p.text ? `<p class="test-courses__source">ตามเอกสารหลักสูตร: ${esc(p.text)}</p>` : "");
  }

  async function loadYear(y) {
    year = y;
    tabs.querySelectorAll("[data-year]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.year === y)));
    detail.hidden = true;
    list.innerHTML = "";
    setStatus("กำลังโหลดรายวิชา…");
    try {
      if (!cache[y]) {
        const body = await Auth.apiFetch("test_courses", { year: y });
        cache[y] = (body.data?.courses || []).sort((a, b) => a.course_code.localeCompare(b.course_code));
      }
      if (year !== y) return; // ผู้ใช้กดเปลี่ยนปีระหว่างรอ
      const courses = cache[y];
      if (!courses.length) return setStatus(`ไม่พบรายวิชาในหลักสูตร ${y}`);
      setStatus("");
      list.innerHTML = courses.map((c) => `
        <button type="button" class="test-courses__card" data-code="${esc(c.course_code)}">
          <span class="test-courses__code">${esc(c.course_code)}</span>
          <span class="test-courses__title">${esc(c.title_en)}</span>
          <span class="test-courses__credits">${esc(c.credits)} หน่วยกิต</span>
        </button>`).join("");
    } catch (err) {
      setStatus(`โหลดรายวิชาไม่สำเร็จ: ${err.message}`, true);
    }
  }

  async function openCourse(code) {
    list.querySelectorAll("[data-code]").forEach((b) => b.classList.toggle("is-active", b.dataset.code === code));
    detail.hidden = false;
    detail.innerHTML = "<p>กำลังโหลดรายละเอียด…</p>";
    try {
      const body = await Auth.apiFetch("test_course", { year, course_code: code });
      const c = body.data.course;
      detail.innerHTML = `
        <h3>${esc(c.course_code)} ${esc(c.title_en)}</h3>
        <dl class="test-courses__kv">
          <dt>ปีหลักสูตร</dt><dd>${esc(c.curriculum_year)}</dd>
          <dt>หน่วยกิต</dt><dd>${esc(c.credits)}</dd>
          <dt>วิชาบังคับก่อน</dt><dd>${renderPrereq(c.prerequisite)}</dd>
          ${c.test_note ? `<dt>หมายเหตุ</dt><dd>${esc(c.test_note)}</dd>` : ""}
        </dl>`;
    } catch (err) {
      detail.innerHTML = `<p class="test-courses__status is-error">โหลดรายละเอียดไม่สำเร็จ: ${esc(err.message)}</p>`;
    }
  }

  loadYear(year);
})();
