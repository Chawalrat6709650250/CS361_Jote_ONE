(async function () {
  if (!Staff.guard()) return;
  const { esc } = Staff;
  Staff.demoBanner(document.getElementById("demo"));
  const $ = (id) => document.getElementById(id);
  let all = [];

  const pct = (r) => Math.min(100, Math.round(((r.credits_earned || 0) / (r.credits_required || 1)) * 100));

  function render() {
    const kw = $("q").value.trim().toLowerCase(), yr = $("year").value, st = $("status").value;
    const rows = all.filter((r) =>
      (!yr || r.curriculum_year === yr) && (!st || r.overall === st) &&
      (!kw || `${r.name} ${r.student_code} ${r.student_id}`.toLowerCase().includes(kw)));
    $("rows").innerHTML = rows.length ? rows.map((r) => `
      <tr class="is-link" tabindex="0" data-id="${esc(r.student_id)}">
        <td>${esc(r.student_code)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.curriculum_year)}</td>
        <td><span class="st-bar" aria-hidden="true"><i style="width:${pct(r)}%"></i></span>${esc(r.credits_earned)} / ${esc(r.credits_required)}</td>
        <td class="num">${r.gpa == null ? "-" : Number(r.gpa).toFixed(2)}</td>
        <td>${Staff.badge(Staff.OVERALL, r.overall)}${r.has_incomplete_data && r.overall !== "unknown" ? ` <span class="st-badge st-badge--warn" title="${esc(r.incomplete_summary_th)}">ข้อมูลไม่ครบ</span>` : ""}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="st-empty">ไม่พบนักศึกษาตามเงื่อนไขที่เลือก</td></tr>`;
    $("count").textContent = `แสดง ${rows.length} จาก ${all.length} คน`;
  }
  const open = (tr) => { if (tr) location.href = `student-detail.html?id=${encodeURIComponent(tr.dataset.id)}${Staff.isPreview ? "&preview=1" : ""}`; };
  $("rows").addEventListener("click", (e) => open(e.target.closest("tr[data-id]")));
  $("rows").addEventListener("keydown", (e) => { if (e.key === "Enter") open(e.target.closest("tr[data-id]")); });
  ["q", "year", "status"].forEach((id) => $(id).addEventListener("input", render));
  $("reset").addEventListener("click", () => { $("q").value = ""; $("year").value = ""; $("status").value = ""; render(); });

  try {
    const d = await Staff.api("/grad/students");
    all = d.students || [];
    if (d.scope === "all") document.querySelector(".st-hero h1").textContent = "นักศึกษาทั้งหมด";
    [...new Set(all.map((s) => s.curriculum_year))].sort().forEach((y) => $("year").insertAdjacentHTML("beforeend", `<option>${esc(y)}</option>`));
    Staff.renderFreshness($("fresh"), d.data);
    render();
  } catch (e) {
    $("rows").innerHTML = `<tr><td colspan="6" class="st-empty">ไม่สามารถโหลดรายชื่อได้</td></tr>`;
    $("msg").innerHTML = `<div class="st-alert st-alert--bad">${esc(e.status === 403 ? "คุณไม่มีสิทธิ์ดูหน้านี้ (เฉพาะอาจารย์และเจ้าหน้าที่)" : e.message)}</div>`;
  }
})();
