(() => {
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
  if (!isPreview && window.Auth && !Auth.requireLogin()) return;

  const previewStudent = {
    name: "นางสาวเอ ครบถ้วน",
    student_code: "6609000001",
    curriculum_year: "2566",
    plan_name_th: "วิชาเอกคอมพิวเตอร์และวิทยาการสารสนเทศ — แผนโครงงานพิเศษ",
    advisor: { username: "mock.professor" },
  };

  const card = document.getElementById("student-profile-card");
  const status = document.getElementById("student-profile-status");
  const name = document.getElementById("student-profile-name");
  const code = document.getElementById("student-profile-code");
  const academicStatus = document.getElementById("student-profile-academic-status");
  const curriculum = document.getElementById("student-profile-curriculum");
  const plan = document.getElementById("student-profile-plan");
  const advisor = document.getElementById("student-profile-advisor");

  const avatar = document.getElementById("student-profile-avatar");
  const credits = document.getElementById("student-profile-credits");
  const creditsBar = document.getElementById("student-profile-credits-bar");
  const gpa = document.getElementById("student-profile-gpa");
  const gpaNote = document.getElementById("student-profile-gpa-note");
  const asOf = document.getElementById("student-profile-asof");
  const source = document.getElementById("student-profile-source");
  const links = document.getElementById("student-profile-links");

  // ตัวอักษรแรกของชื่อจริง (ตัดคำนำหน้า) สำหรับรูปย่อ
  function initialOf(fullName) {
    const given = String(fullName || "").replace(/^(นางสาว|น\.ส\.|นาย|นาง|Mr\.?|Mrs\.?|Miss|Ms\.?)\s*/i, "");
    return (given.match(/[ก-ฮA-Za-z0-9]/) || ["?"])[0].toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date) + " น.";
  }

  function renderStudent(profile) {
    const student = profile.student;
    const summary = profile.summary || {};

    avatar.textContent = initialOf(student.name);
    name.textContent = student.name || "ไม่พบชื่อในระบบ";
    code.textContent = student.student_code
      ? `รหัสนักศึกษา ${student.student_code}`
      : "ไม่พบรหัสนักศึกษา";
    academicStatus.textContent = profile.overall_label_th || "กำลังศึกษา";
    academicStatus.classList.toggle("is-success", profile.overall === "eligible");
    academicStatus.classList.toggle("is-unknown", profile.overall === "unknown");

    const earned = Number(summary.credits_earned);
    const required = Number(summary.credits_required);
    if (Number.isFinite(earned) && required > 0) {
      credits.textContent = `${earned} / ${required}`;
      creditsBar.style.width = `${Math.min(100, Math.round((earned / required) * 100))}%`;
    } else {
      credits.textContent = "-";
    }
    const gpaValue = summary.gpa == null ? null : Number(summary.gpa);
    gpa.textContent = Number.isFinite(gpaValue) ? gpaValue.toFixed(2) : "-";
    gpaNote.textContent = `เกณฑ์ขั้นต่ำ ${Number(summary.gpa_required ?? 2).toFixed(2)}`;
    asOf.textContent = formatDate(profile.data?.data_as_of);
    source.textContent = profile.data?.source_label_th ? `แหล่งข้อมูล: ${profile.data.source_label_th}` : "";

    curriculum.textContent = student.curriculum_year
      ? `หลักสูตรปี ${student.curriculum_year}`
      : "ไม่ระบุ";
    plan.textContent = student.plan_name_th || "ไม่ระบุ";
    advisor.textContent = student.advisor?.username || "ไม่ระบุ";
    card.hidden = false;
    links.hidden = false;
  }

  const ROLE_LABELS = {
    Admin: "ผู้ดูแลหลักสูตร (Admin)",
    Staff: "เจ้าหน้าที่",
    Professor: "อาจารย์",
    Student: "นักศึกษา",
  };

  // บัญชีที่ไม่ใช่นักศึกษา (อาจารย์/เจ้าหน้าที่/Admin รวมถึงบัญชี mock): แสดงข้อมูลบัญชีจาก token แทนผลการเรียน
  function renderAccount(user) {
    const groups = user.groups || [];
    const mainRole = ["Admin", "Staff", "Professor"].find((r) => groups.includes(r));
    const displayName = (user.claims?.name || user.name || user.username || "").trim();

    document.getElementById("student-profile-subtitle").textContent =
      "ข้อมูลบัญชีผู้ใช้และสิทธิ์การใช้งานของคุณ";
    document.getElementById("student-profile-role").textContent =
      `${ROLE_LABELS[mainRole] || "ผู้ใช้งาน"} · วิทยาการคอมพิวเตอร์ มธ.`;
    avatar.textContent = initialOf(displayName || mainRole || "?");
    name.textContent = displayName || "ไม่พบชื่อในระบบ";
    code.textContent = user.username ? `ชื่อผู้ใช้ ${user.username}` : "";
    academicStatus.textContent = String(user.username || "").toLowerCase().startsWith("mock.")
      ? "บัญชีทดสอบ"
      : "ใช้งานอยู่";
    academicStatus.classList.add("is-success");

    document.getElementById("student-profile-stats").hidden = true;
    document.getElementById("student-profile-details").hidden = true;
    document.getElementById("account-profile-details").hidden = false;
    document.getElementById("account-profile-username").textContent = user.username || "-";
    document.getElementById("account-profile-roles").textContent =
      groups.map((g) => ROLE_LABELS[g] || g).join(", ") || "-";
    document.getElementById("account-profile-email").textContent = user.claims?.email || "-";

    const accountLinks = document.getElementById("account-profile-links");
    const items = [
      ["staff-dashboard.html", "หน้าของอาจารย์/เจ้าหน้าที่", mainRole === "Professor" ? "นักศึกษาในที่ปรึกษาและสถานะข้อมูลทะเบียน" : "นักศึกษาทั้งหมดและสถานะข้อมูลทะเบียน"],
    ];
    if (groups.includes("Admin")) items.push(["admin.html", "จัดการหลักสูตร", "แก้รายวิชา วิชาบังคับก่อน และเงื่อนไขการจบ"]);
    accountLinks.innerHTML = items
      .map(([href, title, desc]) => `
        <a href="${href}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4Z" /><path d="M4 9h16M9 9v10" /></svg>
          <span><b>${title}</b><small>${desc}</small></span>
        </a>`)
      .join("");
    accountLinks.hidden = !mainRole;

    // breadcrumb: คนที่ไม่ใช่นักศึกษาไม่มีหน้าของนักศึกษา ให้กลับไปหน้าของอาจารย์/เจ้าหน้าที่แทน
    const crumb = document.querySelector(".student-profile-breadcrumb a");
    if (crumb && mainRole) {
      crumb.href = "staff-dashboard.html";
      crumb.setAttribute("aria-label", "หน้าของอาจารย์/เจ้าหน้าที่");
      crumb.querySelector("span").textContent = "หน้าของอาจารย์/เจ้าหน้าที่";
    }
    card.hidden = false;
    status.textContent = "ข้อมูลจากบัญชีที่เข้าสู่ระบบ";
  }

  async function loadProfile() {
    const user = !isPreview && window.Auth ? Auth.getUser() : null;
    if (user && !user.groups?.includes("Student")) {
      renderAccount(user);
      return;
    }

    if (isPreview) {
      renderStudent({
        student: previewStudent,
        overall: "eligible",
        overall_label_th: "ครบเงื่อนไขสำเร็จการศึกษา",
        summary: { credits_earned: 129, credits_required: 129, gpa: 3.21, gpa_required: 2 },
        data: { data_as_of: new Date().toISOString(), source_label_th: "ข้อมูลตัวอย่าง" },
      });
      status.textContent = "ข้อมูลตัวอย่างสำหรับตรวจสอบหน้าจอ";
      return;
    }

    try {
      const token = await Auth.getToken();
      if (!token) throw new Error("ไม่พบข้อมูลการเข้าสู่ระบบ");

      const apiRoot = APP_CONFIG.apiBase.replace(/\/api$/, "");
      const authorization = APP_CONFIG.authScheme
        ? `${APP_CONFIG.authScheme} ${token}`
        : token;
      const response = await fetch(`${apiRoot}/grad/me`, {
        headers: { Authorization: authorization },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const profile = payload?.data;
      if (!payload?.success || !profile?.student) throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");

      renderStudent(profile);
      status.textContent = "ข้อมูลจากระบบทะเบียนล่าสุด";
    } catch (error) {
      console.warn("ไม่สามารถโหลดข้อมูลส่วนตัวจาก API ได้", error);
      status.textContent = "ไม่สามารถโหลดข้อมูลส่วนตัวล่าสุดได้";
      status.classList.add("is-error");
    }
  }

  loadProfile();
})();
