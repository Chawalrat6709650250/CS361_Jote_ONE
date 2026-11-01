(async function () {
  if (!Staff.guard()) return;
  const { esc } = Staff;
  Staff.demoBanner(document.getElementById("demo"));
  const $ = (id) => document.getElementById(id);
  const canAct = Staff.isStaff();

  const SYNC_MAP = { success: ["ok", "สำเร็จ"], failed: ["bad", "ล้มเหลว"], stale: ["warn", "ข้อมูลเก่า"], never: ["mute", "ยังไม่เคยดึง"] };
  const CHANNEL = { sheet: "ดึงจากทะเบียน", upload: "อัปโหลด CSV" };

  async function load() {
    try {
      const d = await Staff.api("/registrar/status");
      const c = d.current || {};
      Staff.renderFreshness($("fresh"), {
        data_as_of: c.data_as_of, sync_status: c.status === "success" ? "ok" : c.status, source_label_th: c.source_label_th,
        warnings: c.status === "failed" ? [{ message_th: c.message_th }] : [],
      });
      if (c.status === "never") $("fresh").querySelector(".st-fresh__body").insertAdjacentHTML("beforeend", `<span>${esc(c.message_th)}</span>`);
      $("counts").innerHTML = d.counts ? `
        <div class="st-stat"><small>นักศึกษาทั้งหมด</small><b>${esc(d.counts.students_total)}</b><span>คน</span></div>
        <div class="st-stat"><small>ข้อมูลยังไม่ครบ</small><b style="color:${d.counts.students_incomplete ? "var(--st-warn)" : "var(--st-ok)"}">${esc(d.counts.students_incomplete)}</b><span>คน (มีเกรด I / ยังไม่มีเกรด)</span></div>` : "";
      $("history").innerHTML = (d.history || []).length ? d.history.map((h) => `
        <tr><td>${esc(Staff.fmtDate(h.at))}</td><td>${esc(CHANNEL[h.channel] || h.channel)}${h.filename ? `<br><small>${esc(h.filename)}</small>` : ""}</td>
        <td>${esc((h.trigger || "").replace(/^(manual|upload):/, ""))}</td><td>${Staff.badge(SYNC_MAP, h.status)}</td>
        <td class="num">${esc(h.rows)}</td><td>${esc(h.message_th || "")}</td></tr>`).join("") : `<tr><td colspan="6" class="st-empty">ยังไม่มีประวัติ</td></tr>`;
    } catch (e) {
      $("fresh").innerHTML = `<div class="st-alert st-alert--bad" style="margin:0;flex:1">${esc(e.status === 403 ? "คุณไม่มีสิทธิ์ดูหน้านี้" : e.message)}</div>`;
      $("history").innerHTML = `<tr><td colspan="6" class="st-empty">ไม่สามารถโหลดประวัติได้</td></tr>`;
    }
  }

  // ---- Sync (Staff/Admin เท่านั้น) ----
  const syncBtn = $("sync"), upBtn = $("upload");
  if (!canAct) {
    syncBtn.disabled = true;
    $("sync-msg").innerHTML = `<div class="st-alert st-alert--info" style="margin:0">เฉพาะเจ้าหน้าที่และผู้ดูแลหลักสูตรเท่านั้นที่ดึงข้อมูล/อัปโหลดได้ อาจารย์ดูสถานะได้อย่างเดียว</div>`;
  }
  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true; syncBtn.textContent = "กำลังดึงข้อมูล…"; $("sync-msg").innerHTML = "";
    try {
      const r = await Staff.api("/registrar/sync", { method: "POST" });
      const okk = r.status === "success";
      $("sync-msg").innerHTML = `<div class="st-alert st-alert--${okk ? "ok" : "bad"}" style="margin:0">${esc(r.message_th || (okk ? "สำเร็จ" : "ไม่สำเร็จ"))}</div>` +
        (r.errors?.length ? `<ul class="st-errlist">${r.errors.map((x) => `<li>${x.sheet ? esc(x.sheet) + " " : ""}บรรทัด ${esc(x.line)}: ${esc(x.message_th)}</li>`).join("")}</ul>` : "");
      await load();
    } catch (e) {
      $("sync-msg").innerHTML = `<div class="st-alert st-alert--bad" style="margin:0">${esc(e.message)}</div>`;
    } finally { syncBtn.disabled = !canAct; syncBtn.textContent = "🔄 ดึงข้อมูลตอนนี้"; }
  });

  // ---- อัปโหลด CSV ----
  let csv = "", filename = "";
  const MAX = 2 * 1024 * 1024;
  function pick(file) {
    $("up-msg").innerHTML = ""; upBtn.disabled = true; $("preview").hidden = true;
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { $("up-msg").innerHTML = `<div class="st-alert st-alert--bad" style="margin:0">รองรับเฉพาะไฟล์ .csv</div>`; return; }
    if (file.size > MAX) { $("up-msg").innerHTML = `<div class="st-alert st-alert--bad" style="margin:0">ไฟล์ใหญ่เกิน 2 MB</div>`; return; }
    const fr = new FileReader();
    fr.onload = () => {
      csv = String(fr.result).replace(/^﻿/, ""); filename = file.name;
      const lines = csv.split(/\r?\n/).filter(Boolean);
      $("fname").textContent = `${file.name} · ${lines.length - 1} แถวข้อมูล`;
      $("preview").hidden = false; $("preview").textContent = lines.slice(0, 4).join("\n") + (lines.length > 4 ? "\n…" : "");
      upBtn.disabled = !canAct || lines.length < 2;
    };
    fr.readAsText(file, "utf-8");
  }
  $("file").addEventListener("change", (e) => pick(e.target.files[0]));
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));

  upBtn.addEventListener("click", async () => {
    upBtn.disabled = true; upBtn.textContent = "กำลังอัปโหลด…"; $("up-msg").innerHTML = "";
    try {
      const r = await Staff.api("/registrar/upload", { method: "POST", body: { filename, csv } });
      $("up-msg").innerHTML = `<div class="st-alert st-alert--ok" style="margin:0">${esc(r.message_th)} (นำเข้า ${esc(r.imported_rows)} แถว, อัปเดต ${esc(r.students_updated)} คน)</div>`;
      await load();
    } catch (e) {
      $("up-msg").innerHTML = `<div class="st-alert st-alert--bad" style="margin:0">${esc(e.message)}${e.errors?.length ? `<ul class="st-errlist">${e.errors.map((x) => `<li>บรรทัด ${esc(x.line)}: ${esc(x.message_th)}</li>`).join("")}</ul>` : ""}<div class="st-note">ข้อมูลเดิมในระบบไม่ถูกเปลี่ยนแปลง แก้ไฟล์แล้วอัปโหลดใหม่ได้</div></div>`;
    } finally { upBtn.textContent = "อัปโหลดและนำเข้า"; upBtn.disabled = false; }
  });

  load();
})();
