(async function () {
  if (!Staff.guard()) return;
  const { esc } = Staff;
  Staff.demoBanner(document.getElementById("demo"));
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { $("msg").innerHTML = `<div class="st-alert st-alert--bad">ไม่ระบุนักศึกษา — <a href="advisor-students.html">กลับไปเลือกจากรายชื่อ</a></div>`; return; }

  try {
    const [d, rec] = await Promise.all([
      Staff.api(`/grad/students/${encodeURIComponent(id)}`),
      Staff.api(`/grad/students/${encodeURIComponent(id)}/records`),
    ]);
    const s = d.student, sm = d.summary;
    document.title = `${s.name} | CSTU`;
    const initial = (s.name.replace(/^(นางสาว|นาย|นาง)/, "").match(/[ก-ฮA-Za-z]/) || ["?"])[0];
    $("profile").hidden = false;
    $("profile").innerHTML = `
      <div class="st-profile">
        <div class="st-avatar" aria-hidden="true">${esc(initial)}</div>
        <div style="flex:1;min-width:220px">
          <h2>${esc(s.name)}</h2>
          <small>รหัส ${esc(s.student_code)} · ${esc(s.plan_name_th || s.study_plan_id)} · ปีหลักสูตร ${esc(s.curriculum_year)}</small>
        </div>
        <div>${Staff.badge(Staff.OVERALL, d.overall)}<div class="st-note" style="text-align:right">${esc(d.overall_label_th || "")}</div></div>
      </div>
      ${d.incomplete_data?.length ? `<div class="st-alert st-alert--warn" style="margin:14px 0 0">มี ${d.incomplete_data.length} รายวิชาที่ยังไม่มีผลจากทะเบียน: ${d.incomplete_data.map((i) => esc(`${i.course_code} (${i.term}) ${i.reason_th}`)).join(", ")}</div>` : ""}`;

    const pct = Math.min(100, Math.round((sm.credits_earned / (sm.credits_required || 1)) * 100));
    // การ์ดสรุป — ใช้สไตล์เดียวกับการ์ดของหน้านักศึกษา
    $("stats").innerHTML = `
      <div class="st-stat"><small>หน่วยกิตที่ผ่าน</small><b>${esc(sm.credits_earned)} / ${esc(sm.credits_required)}</b><span>${pct}% ของที่กำหนด</span></div>
      <div class="st-stat"><small>เกรดเฉลี่ยสะสม</small><b>${sm.gpa == null ? "-" : Number(sm.gpa).toFixed(2)}</b><span>ขั้นต่ำ ${Number(sm.gpa_required ?? 2).toFixed(2)}</span></div>
      <div class="st-stat"><small>กำลังเรียน</small><b>${esc(sm.credits_in_progress ?? 0)}</b><span>หน่วยกิต</span></div>
      <div class="st-stat"><small>ที่ปรึกษา</small><b style="font-size:20px">${esc(s.advisor?.username || "-")}</b><span>&nbsp;</span></div>`;

    $("checks-panel").hidden = false;
    $("checks").innerHTML = (d.checks || []).map((c) => `
      <div class="st-check"><div><strong>${esc(c.label_th)}</strong><span>${esc(c.detail_th || "")}</span></div>${Staff.badge(Staff.CHECK, c.status)}</div>`).join("");

    $("records-panel").hidden = false;
    $("records").innerHTML = (rec.terms || []).length ? rec.terms.map((t) => `
      <div class="st-term"><h3>ภาคการศึกษา ${esc(t.term)}<small>${esc(t.credits)} หน่วยกิต · GPA ภาค ${t.gpa_term == null ? "-" : Number(t.gpa_term).toFixed(2)}</small></h3>
        <div class="st-tablewrap"><table class="st-table"><thead><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>หมวด</th><th class="num">หน่วยกิต</th><th>เกรด</th></tr></thead><tbody>
        ${t.courses.map((c) => `<tr><td>${esc(c.course_code)}</td><td>${esc(c.title_en)}</td><td>${esc(c.category_label_th)}</td><td class="num">${esc(c.credits)}</td><td>${c.grade ? esc(c.grade) : '<span class="st-badge st-badge--info">ยังไม่มีเกรด</span>'}</td></tr>`).join("")}
        </tbody></table></div></div>`).join("") : `<div class="st-empty">ยังไม่มีผลการเรียน</div>`;
    Staff.renderFreshness($("fresh"), d.data);
  } catch (e) {
    const msg = e.status === 403 ? "คุณไม่มีสิทธิ์ดูข้อมูลนักศึกษาคนนี้ (ไม่ใช่นักศึกษาในที่ปรึกษาของคุณ)" : e.status === 404 ? "ไม่พบนักศึกษาคนนี้ในระบบ" : e.message;
    $("msg").innerHTML = `<div class="st-alert st-alert--bad">${esc(msg)} — <a href="advisor-students.html">กลับไปรายชื่อ</a></div>`;
  }
})();
