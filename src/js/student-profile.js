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

  function renderStudent(profile) {
    const student = profile.student;

    name.textContent = student.name || "ไม่พบชื่อในระบบ";
    code.textContent = student.student_code
      ? `รหัสนักศึกษา ${student.student_code}`
      : "ไม่พบรหัสนักศึกษา";
    academicStatus.textContent = profile.overall_label_th || "สถานภาพกำลังศึกษา";
    academicStatus.classList.toggle("is-success", profile.overall === "eligible");
    curriculum.textContent = student.curriculum_year
      ? `หลักสูตรปี ${student.curriculum_year}`
      : "ไม่ระบุ";
    plan.textContent = student.plan_name_th || "ไม่ระบุ";
    advisor.textContent = student.advisor?.username || "ไม่ระบุ";
    card.hidden = false;
  }

  async function loadProfile() {
    if (isPreview) {
      renderStudent({
        student: previewStudent,
        overall: "eligible",
        overall_label_th: "ครบเงื่อนไขสำเร็จการศึกษา",
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
