(async function () {
  if (!Staff.guard()) return;
  Staff.demoBanner(document.getElementById("demo"));
  const fresh = document.getElementById("fresh");
  // อาจารย์เห็น "นักศึกษาในที่ปรึกษา" / เจ้าหน้าที่เห็นนักศึกษาทั้งหมด
  if (Staff.isStaff()) {
    document.getElementById("card-students-title").textContent = "นักศึกษาทั้งหมด";
    document.getElementById("card-students-desc").textContent = "ดูรายชื่อและผลตรวจการจบของทุกคน";
  }
  try {
    const d = await Staff.api("/grad/students");
    Staff.renderFreshness(fresh, d.data);
  } catch (e) {
    fresh.innerHTML = `<span class="st-fresh__icon">⚠️</span><div class="st-fresh__body"><strong>โหลดสถานะข้อมูลไม่สำเร็จ</strong><span>${Staff.esc(e.message)}</span></div>`;
  }
})();
