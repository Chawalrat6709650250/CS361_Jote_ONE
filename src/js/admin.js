/* CSTU V4 Admin UI — uses existing Cognito login. No credentials stored here. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const root = document.body.dataset.root || "../";
  const guard = $("adm-guard");
  const user = window.Auth?.getUser?.();
  if (!window.Auth?.isLoggedIn?.()) {
    guard.hidden = false;
    guard.textContent =
      "กรุณาเข้าสู่ระบบด้วยบัญชี Admin ก่อนใช้งาน (ใช้แท็บนี้ในการเข้าสู่ระบบ เพื่อให้สถานะ Login ต่อเนื่อง)";
    const link = document.createElement("a");
    link.href =
      root + "pages/login.html?next=" + encodeURIComponent(location.pathname);
    link.textContent = " ไปหน้าเข้าสู่ระบบ";
    guard.append(link);
    return;
  }
  if (!window.Auth.hasRole("Admin")) {
    guard.hidden = false;
    guard.textContent =
      "บัญชีนี้ไม่มีสิทธิ์จัดการหลักสูตร (ต้องอยู่ในกลุ่ม Admin)";
    return;
  }
  $("adm-app").hidden = false;
  if ($("adm-user"))
    $("adm-user").textContent =
      `เข้าสู่ระบบในชื่อ ${user?.name || user?.username || "Admin"}`;
  const base = new URL(window.APP_CONFIG.apiBase).origin + "/prod";
  let courses = [];
  let editMode = "POST";
  let busy = false;
  let currentRule = null;
  const safe = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const pick = (obj, names, fallback = "") =>
    names.find((k) => obj?.[k] !== undefined && obj[k] !== null)
      ? obj[names.find((k) => obj?.[k] !== undefined && obj[k] !== null)]
      : fallback;
  function notice(message, kind = "") {
    const n = $("adm-notice");
    n.hidden = false;
    n.className = "adm-notice " + kind;
    n.textContent = message;
  }
  function error(e) {
    notice(e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
  }
  async function api(path, { method = "GET", body, params } = {}) {
    if (busy && method !== "GET") throw new Error("กำลังบันทึกข้อมูลก่อนหน้า");
    const token = await window.Auth.getToken();
    if (!token) throw new Error("Token หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    const url = new URL(base + path);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== "" && v != null) url.searchParams.set(k, v);
    });
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        Authorization:
          (window.APP_CONFIG.authScheme
            ? window.APP_CONFIG.authScheme + " "
            : "") + token,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }
    if (!res.ok) {
      const description =
        typeof data === "object"
          ? data?.message || data?.error || ""
          : String(data || "");
      throw new Error(
        `API ${res.status}: ${description || (res.status === 403 ? "ไม่มีสิทธิ์เข้าถึง" : "ไม่สามารถดำเนินการได้")}`,
      );
    }
    return data;
  }
  function arrayOf(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
    if (Array.isArray(data?.data)) return data.data;
    if (data?.data && typeof data.data === "object")
      return arrayOf(data.data, keys);
    if (Array.isArray(data?.body)) return data.body;
    return [];
  }
  function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const active = b.dataset.tab === name;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    document
      .querySelectorAll("[data-panel]")
      .forEach((p) => (p.hidden = p.dataset.panel !== name));
  }
  document
    .querySelectorAll("[data-tab]")
    .forEach((btn) =>
      btn.addEventListener("click", () => showTab(btn.dataset.tab)),
    );
  function renderCourses() {
    const q = $("course-search").value.trim().toLowerCase();
    const rows = courses.filter(
      (c) =>
        (!$("courses-year").value ||
          String(c.curriculum_year ?? c.year) === $("courses-year").value) &&
        JSON.stringify(c).toLowerCase().includes(q),
    );
    $("course-rows").innerHTML = rows.length
      ? rows
          .map(
            (c, i) =>
              `<tr><td><strong>${safe(pick(c, ["course_code", "courseCode", "code", "id"], "—"))}</strong></td><td>${safe(pick(c, ["title_en", "title_th", "course_name_th", "course_name", "name_th", "name", "title"], "—"))}</td><td>${safe(pick(c, ["credits", "credit", "credit_total"], "—"))}</td><td>${safe(pick(c, ["year", "curriculum_year", "curriculumYear"], "—"))}</td><td><button type="button" data-edit="${courses.indexOf(c)}">แก้ไข</button></td></tr>`,
          )
          .join("")
      : '<tr><td class="adm-empty" colspan="5">ไม่พบรายการ หรือ API ส่งข้อมูลในรูปแบบที่ยังไม่รองรับ</td></tr>';
  }
  async function loadCourses() {
    $("load-courses").disabled = true;
    $("load-courses").textContent = "กำลังโหลด…";
    $("course-rows").innerHTML =
      '<tr><td colspan="5">กำลังโหลดข้อมูล…</td></tr>';
    try {
      const data = await api("/admin/courses", {
        params: { year: $("courses-year").value.trim() },
      });
      courses = arrayOf(data, ["courses", "items", "results", "records"]);
      renderCourses();
      if (!courses.length)
        notice(
          "API ตอบกลับแล้ว แต่ไม่พบรายการรายวิชา กรุณาตรวจสอบรูปแบบ response ของ Backend",
        );
      else notice(`โหลดรายวิชาแล้ว ${courses.length} รายการ`, "success");
    } catch (e) {
      $("course-rows").innerHTML =
        '<tr><td colspan="5" class="adm-empty">โหลดรายวิชาไม่สำเร็จ กรุณากด “ลองอีกครั้ง” หรือตรวจสอบบัญชี Admin</td></tr>';
      error(e);
      $("load-courses").textContent = "↻ ลองอีกครั้ง";
    } finally {
      $("load-courses").disabled = false;
      if ($("load-courses").textContent === "กำลังโหลด…")
        $("load-courses").textContent = "↻ รีเฟรชข้อมูล";
    }
  }
  $("load-courses").addEventListener("click", loadCourses);
  $("course-search").addEventListener("input", renderCourses);
  $("courses-year").addEventListener("change", renderCourses);
  function openModal(mode, course) {
    editMode = mode;
    $("json-title").textContent =
      mode === "POST" ? "เพิ่มรายวิชาใหม่" : "แก้ไขข้อมูลรายวิชา";
    $("json-year").value = String(
      pick(
        course,
        ["year", "curriculum_year", "curriculumYear"],
        $("courses-year").value,
      ),
    );
    $("json-code").value = String(
      pick(course, ["course_code", "courseCode", "code", "id"], ""),
    );
    $("json-body").value = JSON.stringify(course || {}, null, 2);
    $("course-name").value = String(
      pick(course, ["title_en", "course_name", "name", "title"], ""),
    );
    $("course-credits").value = String(
      pick(course, ["credits", "credit", "credit_total"], ""),
    );
    $("course-name-th").value = String(
      pick(course, ["title_th", "course_name_th", "name_th"], ""),
    );
    $("course-category").value = String(pick(course, ["category"], ""));
    $("course-active").checked = pick(course, ["active"], true) !== false;
    $("json-modal").showModal();
  }
  function updateCourseDraft() {
    let obj;
    try {
      obj = JSON.parse($("json-body").value);
    } catch {
      return;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    const assign = (keys, value, defaultKey) => {
      const k =
        keys.find((x) => Object.prototype.hasOwnProperty.call(obj, x)) ||
        defaultKey;
      if (value !== "" || Object.prototype.hasOwnProperty.call(obj, k))
        obj[k] = value;
    };
    assign(
      ["curriculum_year", "year", "curriculumYear"],
      $("json-year").value,
      "curriculum_year",
    );
    assign(
      ["course_code", "courseCode", "code"],
      $("json-code").value.trim(),
      "course_code",
    );
    assign(
      ["title_en", "course_name", "name", "title"],
      $("course-name").value.trim(),
      "title_en",
    );
    assign(
      ["title_th", "course_name_th", "name_th"],
      $("course-name-th").value.trim(),
      "title_th",
    );
    assign(["category"], $("course-category").value, "category");
    obj.active = $("course-active").checked;
    const credit = $("course-credits").value;
    if (credit !== "")
      assign(["credits", "credit", "credit_total"], Number(credit), "credits");
    $("json-body").value = JSON.stringify(obj, null, 2);
  }
  [
    "json-year",
    "json-code",
    "course-name",
    "course-credits",
    "course-name-th",
    "course-category",
    "course-active",
  ].forEach((id) => $(id).addEventListener("input", updateCourseDraft));
  function updatePrereqDraft() {
    const vals = $("pre-list")
      .value.split(",")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
    const op = $("pre-op").value,
      condition = $("pre-condition").value,
      grade = $("pre-grade").value;
    const items = vals.map((course) =>
      condition === "min_grade"
        ? { course, condition, grade }
        : { course, condition },
    );
    $("pre-json").value = JSON.stringify(
      { prerequisite: { op, items } },
      null,
      2,
    );
    $("pre-grade").disabled = condition !== "min_grade";
  }
  ["pre-list", "pre-op", "pre-condition", "pre-grade"].forEach((id) =>
    $(id).addEventListener("change", updatePrereqDraft),
  );
  $("pre-list").addEventListener("input", updatePrereqDraft);
  updatePrereqDraft();
  $("add-course").addEventListener("click", () => openModal("POST"));
  $("course-rows").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-edit]");
    if (b) openModal("PUT", courses[Number(b.dataset.edit)]);
  });
  const closeModal = () => $("json-modal").close();
  $("close-json").addEventListener("click", closeModal);
  $("cancel-json").addEventListener("click", closeModal);
  function parseBody(id) {
    const val = $(id).value.trim();
    if (!val) throw new Error("กรุณากรอก JSON");
    let out;
    try {
      out = JSON.parse(val);
    } catch {
      throw new Error("JSON ไม่ถูกต้อง กรุณาตรวจสอบเครื่องหมาย , และวงเล็บ");
    }
    if (!out || typeof out !== "object" || Array.isArray(out))
      throw new Error("ข้อมูลต้องเป็น JSON object");
    return out;
  }
  function encoded(value) {
    return encodeURIComponent(String(value).trim());
  }
  async function save(method, path, body, after) {
    if (!confirm("ยืนยันการบันทึกข้อมูลจริงผ่าน API?")) return;
    busy = true;
    const buttons = [...document.querySelectorAll(".adm-btn")];
    buttons.forEach((x) => (x.disabled = true));
    try {
      await api(path, { method, body });
      notice(
        "บันทึกข้อมูลผ่าน API สำเร็จ กรุณาตรวจสอบประวัติการเปลี่ยนแปลง",
        "success",
      );
      if (after) await after();
    } catch (e) {
      error(e);
    } finally {
      busy = false;
      buttons.forEach((x) => (x.disabled = false));
    }
  }
  $("json-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      updateCourseDraft();
      const body = parseBody("json-body");
      const year = $("json-year").value.trim(),
        code = $("json-code").value.trim();
      if (!year || !code) throw new Error("ระบุปีหลักสูตรและรหัสวิชาก่อน");
      const path =
        editMode === "POST"
          ? "/admin/courses"
          : `/admin/courses/${encoded(year)}/${encoded(code)}`;
      notice(
        "เตรียมข้อมูลฟอร์มเรียบร้อยแล้ว แต่ยังไม่ส่งบันทึก: รอยืนยัน Request Body จาก Backend",
        "error",
      );
    } catch (e) {
      error(e);
    }
  });
  $("prereq-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      updatePrereqDraft();
      notice(
        "เตรียมเงื่อนไขเรียบร้อยแล้ว แต่ยังไม่ส่งบันทึก: รอยืนยัน Request Body จาก Backend",
        "error",
      );
    } catch (e) {
      error(e);
    }
  });
  // Public list for dropdown; Admin detail endpoint uses the Cognito ID token.
  async function loadPlanOptions() {
    const select = $("rule-plan");
    const previous = select.value;
    select.disabled = true;
    select.replaceChildren(new Option("กำลังโหลดแผนการเรียน…", ""));
    try {
      const url = new URL(base + "/api");
      url.searchParams.set("resource", "graduation_rules");
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(
          "โหลดแผนการเรียนไม่สำเร็จ (HTTP " + response.status + ")",
        );
      const payload = await response.json();
      if (payload?.success === false)
        throw new Error(payload.message || "โหลดแผนการเรียนไม่สำเร็จ");
      const plans = arrayOf(payload, ["plans"]);
      if (!plans.length) throw new Error("ไม่พบรายการแผนการเรียนจาก API");
      select.replaceChildren(new Option("เลือกแผนการเรียน", ""));
      const years = [
        ...new Set(
          plans.map((p) => String(p.curriculum_year || "")).filter(Boolean),
        ),
      ].sort();
      years.forEach((year) => {
        const group = document.createElement("optgroup");
        group.label = "หลักสูตรปี " + year;
        plans
          .filter((p) => String(p.curriculum_year) === year)
          .forEach((plan) => {
            const opt = new Option(
              plan.plan_name_th + " (" + plan.plan_code + ")",
              plan.study_plan_id,
            );
            group.append(opt);
          });
        select.append(group);
      });
      if (plans.some((p) => p.study_plan_id === previous))
        select.value = previous;
      $("rules-status").textContent =
        "เลือกแผนการเรียนจากรายการเพื่อดูรายละเอียด";
    } catch (err) {
      select.replaceChildren(new Option("โหลดแผนการเรียนไม่สำเร็จ", ""));
      $("rules-status").textContent =
        err.message + " — กรุณาลองกดรีเฟรชอีกครั้ง";
    } finally {
      select.disabled = false;
    }
  }
  function displayRuleDetails(payload) {
    const data = payload?.data || payload;
    if (!data || !data.study_plan_id)
      throw new Error("API ส่งข้อมูลเงื่อนไขในรูปแบบที่ไม่รองรับ");
    $("rules-json").value = JSON.stringify(data);
    currentRule = structuredClone(data);
    $("edit-rules").disabled = false;
    $("rule-edit-form").hidden = true;
    $("rule-edit-preview").hidden = true;
    $("rule-name").textContent = data.plan_name_th || data.study_plan_id;
    $("rule-version").textContent = "เวอร์ชัน " + (data.version ?? "—");
    $("rule-id").textContent = data.study_plan_id;
    $("rule-credits").textContent =
      (data.min_total_credits ?? "—") + " หน่วยกิต";
    $("rule-gpa").textContent =
      data.min_gpa === undefined ? "—" : Number(data.min_gpa).toFixed(2);
    $("rule-year").textContent = data.curriculum_year || "—";
    const cats = Array.isArray(data.categories) ? data.categories : [];
    const tbody = $("rule-categories");
    tbody.replaceChildren();
    cats.forEach((cat) => {
      const tr = document.createElement("tr");
      [cat.label_th || cat.id || "—", String(cat.min_credits ?? "—")].forEach(
        (value) => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        },
      );
      tbody.append(tr);
    });
    if (!cats.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.textContent = "ไม่มีข้อมูลหน่วยกิตรายหมวด";
      tr.append(td);
      tbody.append(tr);
    }
    function renderCodes(id, codes) {
      const element = $(id);
      element.replaceChildren();
      if (!Array.isArray(codes) || !codes.length) {
        element.textContent = "ไม่มีรายการ";
        return;
      }
      codes.forEach((code) => {
        const span = document.createElement("span");
        span.className = "adm-course-chip";
        span.textContent = String(code);
        element.append(span);
      });
    }
    // Display a course in only one section. The API can include project/coop
    // courses in required_courses as well; do not mutate the source data.
    const projectCourses = Array.isArray(data.project_or_coop_courses)
      ? data.project_or_coop_courses
      : [];
    const projectSet = new Set(
      projectCourses.map((code) => String(code).trim()),
    );
    const requiredCourses = Array.isArray(data.required_courses)
      ? data.required_courses.filter(
          (code) => !projectSet.has(String(code).trim()),
        )
      : [];
    renderCodes("rule-required", requiredCourses);
    $("rule-coop-block").hidden = projectCourses.length === 0;
    renderCodes("rule-coop", projectCourses);
    $("rule-source").hidden = !data.source_note_th;
    $("rule-source").textContent = data.source_note_th || "";
    $("rule-updated").textContent =
      "อัปเดตล่าสุด: " +
      (data.updated_at
        ? new Date(data.updated_at).toLocaleString("th-TH")
        : "ไม่ระบุ") +
      " · โดย " +
      (data.updated_by || "ไม่ระบุ");
    $("rules-display").hidden = false;
    $("rules-status").hidden = true;
  }
  async function loadRules() {
    const id = $("rule-plan").value;
    $("rules-display").hidden = true;
    $("edit-rules").disabled = true;
    $("rule-edit-form").hidden = true;
    currentRule = null;
    $("rules-status").hidden = false;
    if (!id) {
      $("rules-status").textContent = "กรุณาเลือกแผนการเรียน";
      return;
    }
    const button = $("load-rules");
    button.disabled = true;
    $("rules-status").textContent = "กำลังโหลดเงื่อนไขการจบ…";
    try {
      const data = await api("/admin/graduation-rules/" + encoded(id));
      displayRuleDetails(data);
    } catch (err) {
      $("rules-status").textContent = "โหลดข้อมูลไม่สำเร็จ: " + err.message;
    } finally {
      button.disabled = false;
    }
  }
  function updateRuleValidation() {
    const reason = $("edit-rule-reason").value.trim();
    const credits = Number($("edit-rule-credits").value);
    const gpa = Number($("edit-rule-gpa").value);
    const valid =
      reason.length >= 3 &&
      $("edit-rule-credits").value !== "" &&
      Number.isInteger(credits) &&
      credits >= 0 &&
      $("edit-rule-gpa").value !== "" &&
      Number.isFinite(gpa) &&
      gpa >= 0 &&
      gpa <= 4 &&
      [...document.querySelectorAll("[data-cat-id]")].every(
        (x) =>
          x.value !== "" &&
          Number.isInteger(Number(x.value)) &&
          Number(x.value) >= 0,
      );
    $("preview-rule-edit").disabled = !valid;
    $("edit-rule-reason-help").textContent =
      reason.length < 3
        ? "กรุณากรอกเหตุผลอย่างน้อย 3 ตัวอักษร"
        : "เหตุผลครบตามเงื่อนไขแล้ว";
    $("rule-edit-preview").hidden = true;
  }
  $("edit-rules").addEventListener("click", () => {
    if (!currentRule) return;
    $("rule-edit-form").hidden = false;
    $("edit-rule-credits").value = currentRule.min_total_credits ?? "";
    $("edit-rule-gpa").value = currentRule.min_gpa ?? "";
    $("edit-rule-reason").value = "";
    const holder = $("edit-rule-categories");
    holder.replaceChildren();
    (currentRule.categories || []).forEach((cat) => {
      const label = document.createElement("label");
      label.textContent = cat.label_th || cat.id;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.required = true;
      input.dataset.catId = cat.id;
      input.value = cat.min_credits ?? "";
      input.addEventListener("input", updateRuleValidation);
      label.append(input);
      holder.append(label);
    });
    updateRuleValidation();
    $("rule-edit-form").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
  ["edit-rule-credits", "edit-rule-gpa", "edit-rule-reason"].forEach((id) =>
    $(id).addEventListener("input", updateRuleValidation),
  );
  $("cancel-rule-edit").addEventListener("click", () => {
    $("rule-edit-form").hidden = true;
  });
  $("rule-edit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    updateRuleValidation();
    if ($("preview-rule-edit").disabled || !currentRule) return;
    const categories = (currentRule.categories || []).map((cat) => {
      const input = [...document.querySelectorAll("[data-cat-id]")].find(
        (x) => x.dataset.catId === cat.id,
      );
      return { ...cat, min_credits: Number(input.value) };
    });
    const preview = $("rule-edit-preview");
    preview.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = "ข้อมูลที่เตรียมแก้ไข (ยังไม่บันทึกลง AWS)";
    const details = document.createElement("p");
    details.textContent =
      "หน่วยกิตรวม: " +
      $("edit-rule-credits").value +
      " | GPA: " +
      $("edit-rule-gpa").value +
      " | หมวดวิชา: " +
      categories.length +
      " หมวด | เหตุผล: " +
      $("edit-rule-reason").value.trim();
    preview.append(title, details);
    preview.hidden = false;
  });
  $("rule-plan").addEventListener("change", loadRules);
  $("load-rules").addEventListener("click", () => {
    if (!$("rule-plan").value) loadPlanOptions();
    else loadRules();
  });
  document.querySelector('[data-tab="rules"]').addEventListener("click", () => {
    if ($("rule-plan").options.length <= 1 && !$("rule-plan").disabled)
      loadPlanOptions();
  });
  async function loadChanges() {
    $("change-rows").innerHTML =
      '<tr><td colspan="4">กำลังโหลดประวัติ…</td></tr>';
    try {
      const data = await api("/admin/changes", {
        params: { entity_id: $("change-entity").value.trim() },
      });
      const rows = arrayOf(data, [
        "changes",
        "logs",
        "items",
        "records",
        "results",
      ]);
      $("change-rows").innerHTML = rows.length
        ? rows
            .map(
              (c) =>
                `<tr><td>${safe(pick(c, ["changed_at", "created_at", "timestamp", "date", "time"], "—"))}</td><td>${safe(pick(c, ["changed_by", "actor", "user_id", "username", "admin_id"], "—"))}</td><td>${safe(pick(c, ["action", "change_type", "operation", "entity_type"], "—"))}</td><td><div class="adm-detail">${safe(JSON.stringify(c, null, 2))}</div></td></tr>`,
            )
            .join("")
        : '<tr><td colspan="4" class="adm-empty">ไม่มีประวัติการเปลี่ยนแปลงที่แสดงได้</td></tr>';
      notice(`โหลดประวัติแล้ว ${rows.length} รายการ`, "success");
    } catch (e) {
      $("change-rows").innerHTML =
        '<tr><td colspan="4">โหลดประวัติไม่สำเร็จ</td></tr>';
      error(e);
    }
  }
  $("load-changes").addEventListener("click", loadChanges);
  // Initial read-only fetch after a real Admin session has passed the guard.
  loadCourses();
})();
