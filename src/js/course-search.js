// ===== ตั้งค่า =====
// โครงสร้างข้อมูลอ้างอิงจาก study-plan.js ของทีม (branch develop) และ API เดียวกัน
const API = "https://uuo1em3vlb.execute-api.us-east-1.amazonaws.com/prod/api";
const DEBUG = /[?&]debug/.test(location.search); // เปิดด้วย course-search.html?debug=1 เพื่อดูข้อมูลดิบ

// กลุ่มประเภทวิชา = ปุ่มตัวกรองและสีตาม Figma
const TYPE_LABEL = { "บังคับ": "วิชาบังคับ", "เลือก": "วิชาเลือก", "โครงงาน": "โครงงาน", "สหกิจ": "สหกิจ", "ศึกษาทั่วไป": "ข้อกำหนด/วิชาทั่วไป" };
const TYPE_ORDER = Object.keys(TYPE_LABEL);
const RANK = { "บังคับ": 0, "โครงงาน": 1, "สหกิจ": 2, "เลือก": 3, "ศึกษาทั่วไป": 4 };

const byCode = new Map(); // course_code -> course
let all = [], plans = [], planData = {}, planLoading = {}, picked = new Set(), timer;
const detailCache = {};
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const strip = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// ค่า role / requirement_type จาก API -> {g: กลุ่ม(สี), l: ข้อความบนแท็ก}
function mapType(v, c, group = "") {
  v = String(v ?? "").toLowerCase();
  group = String(group ?? "").toLowerCase();
  
  const title = c ? String(c.th + " " + c.en).toLowerCase() : "";
  const code = c ? String(c.code).toLowerCase() : "";

  // 1. ดักจับ TU, SC เป็นวิชาทั่วไปเสมอ (ป้องกันการถูกดึงไปหมวดอื่น)
  if (/^(tu|sc)/i.test(code)) return { g: "ศึกษาทั่วไป", l: "ข้อกำหนด/วิชาทั่วไป" };

  // 2. กลุ่มโครงงานและสหกิจ เช็คจากชื่อวิชา
  if (/project|โครงงาน/.test(v) || /project|โครงงาน/.test(title)) return { g: "โครงงาน", l: "โครงงาน" };
  if (/co-?op|cooperative|internship|สหกิจ/.test(v) || /co-?op|cooperative|internship|สหกิจ/.test(title)) return { g: "สหกิจ", l: "สหกิจ" };
  
  // 3. กลุ่มวิชาทั่วไป / เสรี
  if (/free|เสรี/.test(v) || /free|เสรี/.test(group)) return { g: "ศึกษาทั่วไป", l: "วิชาเลือกเสรี" };
  if (/general|ทั่วไป|ข้อกำหนด|สุขภาวะ|พลเมืองโลก/.test(v) || /general|ทั่วไป|ข้อกำหนด|สุขภาวะ|พลเมืองโลก/.test(group)) return { g: "ศึกษาทั่วไป", l: "ข้อกำหนด/วิชาทั่วไป" };

  // 4. กลุ่มวิชาเลือกและบังคับ
  if (/elective|choice|เลือก/.test(v)) return { g: "เลือก", l: "วิชาเลือก" };
  if (/require|บังคับ|core/.test(v)) return { g: "บังคับ", l: "วิชาบังคับ" };

  // ถ้าไม่มีข้อมูลตรงกับเงื่อนไขเลย
  if (!v) return { g: "ศึกษาทั่วไป", l: "-" };
  return { g: "ศึกษาทั่วไป", l: v };
}
const reqText = (v, group = "") => (mapType(v, null, group) || { l: "-" }).l;
const semText = (s) => { s = String(s).toLowerCase(); return s === "3" || s === "summer" ? "ภาคฤดูร้อน" : "ภาคการศึกษา " + s; };
const yearOfCurriculum = (id) => String(id || "").split("-").pop() || "";

async function callApi(params) {
  const r = await fetch(API + "?" + new URLSearchParams(params));
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.success === false) throw new Error(j.message || (j.error && j.error.message) || "API ตอบกลับว่าไม่สำเร็จ");
  return j;
}
function dbg(title, obj) {
  if (!DEBUG) return;
  let p = $("dbg");
  if (!p) { p = document.createElement("pre"); p.id = "dbg"; p.style.cssText = "background:#111;color:#9f9;font-size:12px;padding:12px;margin:16px;white-space:pre-wrap;word-break:break-all"; document.body.insertBefore(p, $("site-footer")); }
  p.textContent += "\n== " + title + " ==\n" + JSON.stringify(obj, null, 1).slice(0, 2500) + "\n";
}
function showErr(msg) {
  const e = $("err"); e.hidden = false;
  e.innerHTML = "<b>โหลดข้อมูลไม่สำเร็จ</b><br>" + msg + '<br><button class="cs-btn" id="retry" style="margin-top:8px">ลองใหม่</button>';
  $("retry").onclick = load;
}

// ===== โครงสร้างรายวิชา =====
function mergeCourse(r, fromPlan) {
  const code = String(r.course_code || r.code || "");
  if (!code) return null;
  let c = byCode.get(code);
  if (!c) {
    c = { code, th: "", en: "", cr: 0, recs: [], places: [] };
    byCode.set(code, c);
  }
  c.th = c.th || r.title_th || r.course_name_th || "";
  c.en = c.en || r.title_en || r.course_name_en || "";
  const cr = r.credits_total ?? (r.credits && typeof r.credits === "object" ? r.credits.total : r.credits) ?? r.credit;
  c.cr = c.cr || num(cr);
  c.codeTh = c.codeTh || r.course_code_th || "";
  
  if (!fromPlan) {
    // 1. เก็บข้อมูลจาก curriculum
    [].concat(r.curriculum || r.curriculums || r.curricula || []).forEach((cu) => {
      if (cu && !c.recs.some((x) => x.cid === cu.curriculum_id && x.pid === cu.pathway_id && x.req === cu.requirement_type)) {
        c.recs.push({ cid: cu.curriculum_id, pid: cu.pathway_id, req: cu.requirement_type, group: cu.course_group });
      }
    });

    // 2. เก็บข้อมูลจาก classification 
    if (r.classification) {
      let req = "";
      if (r.classification.subcategories && r.classification.subcategories.length > 0) {
        req = r.classification.subcategories[0].code || r.classification.subcategories[0].label_th;
      } else if (r.classification.subcategory_codes && r.classification.subcategory_codes.length > 0) {
        req = r.classification.subcategory_codes[0];
      }
      let group = r.classification.course_type ? r.classification.course_type.label_th : "";

      if (req && !c.recs.some((x) => x.req === req)) {
        c.recs.push({ cid: "class", pid: "class", req: req, group: group });
      }
    }
  }
  return c;
}

// ===== แก้ไข: ฟังก์ชัน TypeOf เพื่อจัดลำดับความสำคัญของป้ายกำกับ =====
function typeOf(c, p, planSelected) {
  // ถ้าบังคับเลือกแผนการเรียน ให้ใช้ role ของแผนนั้นๆ ตรงๆ เลย
  if (planSelected && p && p.role) return mapType(p.role, c);
  
  // เรียงลำดับ priority (บังคับ > เลือก > เสรี) สำหรับข้อมูลที่ได้จาก /courses
  const recs = c.recs.map((r) => mapType(r.req, c, r.group)).filter(Boolean).sort((a, b) => RANK[a.g] - RANK[b.g]);
  if (recs.length) return recs[0];
  
  if (p && p.role) return mapType(p.role, c);
  
  // แกัไขจุดนี้: ถ้าระบบไปดึงข้อมูลมาจาก study_plans ให้เรียงลำดับความสำคัญด้วย! 
  // จะได้ไม่หยิบป้าย "วิชาเลือกเสรี" ของสาขาอื่นมาแปะทับ "วิชาบังคับ" ของสาขาตัวเอง
  if (c.places && c.places.length > 0) {
    const places = c.places.map((x) => mapType(x.role, c)).filter(Boolean).sort((a, b) => RANK[a.g] - RANK[b.g]);
    if (places.length) return places[0];
  }
  
  return { g: "ศึกษาทั่วไป", l: "ไม่ระบุประเภท" };
}

function placeFor(c, plan, yr) {
  return c.places.find((p) => (!plan || p.plan === plan) && (!yr || String(p.yr) === yr)) || null;
}
function isElectiveOfPlan(c, planId) {
  const meta = (planData[planId] || {}).meta;
  return !!meta && c.recs.some((r) => r.cid === meta.curriculum_id && r.pid === meta.pathway_id && /elective|choice|เลือก/.test(String(r.req).toLowerCase()));
}

// ===== โหลดข้อมูล =====
async function load() {
  $("err").hidden = true;
  $("results").innerHTML = '<div class="cs-sk"></div><div class="cs-sk"></div><div class="cs-sk"></div>';
  try {
    const j = await callApi({ resource: "courses" }); 
    const list = Array.isArray(j.data) ? j.data : ((j.data && j.data.courses) || []);
    
    dbg("courses[0]", list[0]);
    list.filter((r) => r.active !== false && (r.status == null || r.status === "active")).forEach((r) => mergeCourse(r, false));
    all = [...byCode.values()];
    if (!all.length) { showErr("API ตอบสำเร็จ แต่ไม่มีรายวิชา"); $("results").innerHTML = ""; return; }
    fillCredits();
    render();
    loadPlans();
  } catch (e) {
    showErr(esc(e.message) + " (ถ้าเป็น Failed to fetch มักเกิดจาก CORS ของ API Gateway)");
    $("results").innerHTML = "";
  }
}
function fillCredits() {
  const vals = [...new Set(all.map((c) => c.cr))].sort((a, b) => a - b);
  $("cr").innerHTML = '<option value="">ทุกหน่วยกิต</option>' + vals.map((v) => `<option value="${v}">${v}</option>`).join("");
}

async function loadPlans() {
  try {
    const j = await callApi({ resource: "study_plans" });
    const list = ((j.data && j.data.study_plans) || []).filter((p) => p.active !== false && (p.status == null || p.status === "active"));
    dbg("study_plans[0]", list[0]);
    plans = list;
    const groups = {};
    plans.forEach((p) => { (groups[yearOfCurriculum(p.curriculum_id)] ||= []).push(p); });
    $("plan").innerHTML = '<option value="">ทั้งหมด</option>' + Object.keys(groups).sort().map((y) =>
      `<optgroup label="หลักสูตร ${esc(y)}">` + groups[y].map((p) => `<option value="${esc(p.study_plan_id)}">${esc(p.plan_name_th || p.study_plan_id)}</option>`).join("") + "</optgroup>").join("");
    await Promise.allSettled(plans.map((p) => loadPlan(p.study_plan_id)));
    render();
  } catch { /* ถ้าโหลดแผนไม่ได้ จะยังค้นหารายวิชาได้ตามปกติ */ }
}
function loadPlan(id) {
  if (!planLoading[id]) planLoading[id] = (async () => {
    const j = await callApi({ resource: "study_plan", study_plan_id: id });
    const d = j.data || {};
    if (Object.keys(planLoading)[0] === id) dbg("study_plan detail (ตัวอย่าง)", d);
    const meta = (d.detail && d.detail.study_plan) || d.summary || {};
    const items = {};
    ((d.detail && d.detail.terms) || []).forEach((t) => (t.courses || []).forEach((it) => {
      const co = it.course || {};
      const c = mergeCourse(co, true);
      if (!c) return;
      items[c.code] = true;
      c.places.push({ plan: id, yr: t.study_year, tm: t.semester, role: it.course_role || "" });
    }));
    planData[id] = { meta, items };
    all = [...byCode.values()];
  })().catch(() => { planData[id] = { meta: {}, items: {} }; });
  return planLoading[id];
}

// ===== กรอง / เรียง / แสดงผล =====
function filtered() {
  const q = strip($("q").value), yr = $("yr").value, cr = $("cr").value, s = $("sort").value, plan = $("plan").value;
  const out = [];
  all.forEach((c) => {
    if (q && !strip(c.code + (c.codeTh || "") + c.th + c.en).includes(q)) return;
    if (cr && String(c.cr) !== cr) return;
    const p = placeFor(c, plan, yr);
    if (plan) { if (!p && !(isElectiveOfPlan(c, plan) && !yr)) return; }
    else if (yr && !p) return;
    const t = typeOf(c, p, !!plan);
    if (picked.size && !picked.has(t.g)) return;
    out.push({ c, p: p || placeFor(c, plan, ""), t });
  });
  const cmp = (a, b) => a.c.code.localeCompare(b.c.code, "en", { numeric: true });
  return out.sort((a, b) => s === "name" ? a.c.th.localeCompare(b.c.th, "th") : s === "cr" ? b.c.cr - a.c.cr || cmp(a, b) : cmp(a, b));
}
function drawChips() {
  $("chips").innerHTML = `<button class="cs-chip" data-t="" aria-pressed="${!picked.size}">ทั้งหมด</button>` +
    TYPE_ORDER.map((t) => `<button class="cs-chip" data-t="${esc(t)}" aria-pressed="${picked.has(t)}">${esc(TYPE_LABEL[t])}</button>`).join("");
}
function render() {
  if (!all.length) return;
  const r = filtered();
  $("count").textContent = "พบ " + r.length + " รายวิชา";

  const tags = []; // [key, text, typeClass]
  if ($("q").value.trim()) tags.push(["q", '"' + $("q").value.trim() + '"', ""]);
  if ($("yr").value) tags.push(["yr", "ปี " + $("yr").value, ""]);
  if ($("plan").value) tags.push(["plan", $("plan").selectedOptions[0].textContent, ""]);
  if ($("cr").value) tags.push(["cr", $("cr").value + " หน่วยกิต", ""]);
  picked.forEach((t) => tags.push(["t:" + t, TYPE_LABEL[t], "t-" + t]));
  $("active").innerHTML = tags.map(([k, v, cls]) => `<span class="${esc(cls)}">${esc(v)}<button data-k="${esc(k)}" aria-label="ลบตัวกรอง ${esc(v)}">✕</button></span>`).join("");
  drawChips();

  $("results").innerHTML = r.length ? r.map(({ c, p, t }) => `
    <button class="cs-row t-${esc(t.g)}" data-c="${esc(c.code)}" data-t="${esc(t.l)}" data-g="${esc(t.g)}">
      <span class="code">${esc(c.code)}</span>
      <span><span class="th">${esc(c.th)}</span><span class="en">${esc(c.en)}</span></span>
      <span class="cs-tags"><span class="cs-tag main">${esc(t.l)}</span><span class="cs-tag">${c.cr} หน่วยกิต</span>${p && p.yr ? `<span class="cs-tag plan">ปี ${esc(p.yr)}${esc(semText(p.tm))}</span>` : ""}</span>
    </button>`).join("")
    : '<div class="cs-empty"><div style="font-size:40px">🔎</div><b>ไม่พบรายวิชาที่ตรงกับเงื่อนไข</b><p>ลองลบบางตัวกรอง หรือค้นหาด้วยรหัสวิชา</p><button class="cs-btn" id="clearAll">ล้างตัวกรองทั้งหมด</button></div>';
  const ca = $("clearAll"); if (ca) ca.onclick = resetAll;
}
function resetAll() { $("q").value = ""; ["yr", "plan", "cr"].forEach((i) => ($(i).value = "")); picked.clear(); render(); }

// ===== popup รายละเอียดวิชา =====
const RULE = { "บังคับ": "#9fc9f5", "เลือก": "#8fe0aa", "โครงงาน": "#f29db3", "สหกิจ": "#f2cd6a", "ศึกษาทั่วไป": "#9a9a9a" };
const dash = (v) => (v ? esc(v) : "-");

async function getDetail(code) {
  if (!detailCache[code]) {
    try {
      const [resCourse, resPlo, resPrereq] = await Promise.all([
        callApi({ resource: "course", course_code: code }),
        callApi({ resource: "course_plo_mappings", course_code: code }).catch(() => ({ data: [] })),
        callApi({ resource: "prerequisites", course_code: code }).catch(() => ({ data: {} }))
      ]);

      let courseData = resCourse.data || {};
      courseData.plo_mappings = resPlo.data || [];
      courseData.prerequisites = resPrereq.data || {};

      detailCache[code] = courseData;
    } catch (e) {
      console.error("Error fetching detail for", code, e);
      return null;
    }
  }
  return detailCache[code];
}

async function openDetail(code, tLabel, g) {
  const c = byCode.get(code), d = $("dlg");
  d.style.setProperty("--rule", RULE[g] || "#c9c9c9");
  const head = (title, en) => `<div class="dh"><h2 id="dlgTitle"><span class="c">${esc(code)}</span>${esc(title)}</h2><div class="en">${esc(en)}</div><hr><button class="x" id="closeDlg" aria-label="ปิด">✕</button></div>`;
  d.innerHTML = head(c.th, c.en) + '<div class="db" id="dbody"><p>กำลังโหลดรายละเอียด…</p></div>';
  $("closeDlg").onclick = () => d.close();
  d.showModal();

  const data = await getDetail(code);
  dbg("course detail " + code, data);
  
  const det = (data && data.detail) ? data.detail : (data || {});
  const co = det.course || {};
  const cls = det.classification || {};
  const cu = det.curriculum || {};
  
  const pre = det.prerequisite || (data && data.prerequisites) || {};
  const plo = [...(det.plo_mappings || (data && data.plo_mappings) || [])].sort((a, b) => num(a.display_order) - num(b.display_order));
  const dep = det.dependent_courses || [];

  if (co.title_th) d.querySelector(".dh").outerHTML = head(co.title_th, co.title_en || c.en);
  $("closeDlg").onclick = () => d.close();
  const credits = co.credits && co.credits.total != null ? co.credits.total : c.cr;
  const subs = (cls.subcategories || []).map((s) => s.label_th).filter(Boolean).join(", ");
  const preText = pre.prerequisite_text_th || (pre.rules || []).map((r) => r.course_code_th || r.course_code).filter(Boolean).join(", ") || "ไม่มี";
  const rec = c.recs[0] || {};
  const cell = (k, v) => `<div><small>${k}</small><span>${v}</span></div>`;

  const ploHtml = plo.length ? "<ul>" + plo.map((m) => `<li><b>${esc(m.plo_code || "")}${m.contribution_level ? " (" + esc(m.contribution_level) + ")" : ""}</b> ${esc(m.description_th || "")}</li>`).join("") + "</ul>" : "<p>ไม่มีข้อมูล PLO Mapping</p>";
  const depHtml = dep.length ? '<ul class="next">' + dep.map((x) => `<li><span class="c">${esc(x.course_code_th || x.course_code || "")}</span> <b>${esc(x.title_th || "")}</b>${x.relationship_type_th || x.notes ? `<small>${esc(x.relationship_type_th || x.notes)}</small>` : ""}</li>`).join("") + "</ul>" : "<p>ไม่มีรายวิชาที่ต่อยอดจากวิชานี้</p>";

  $("dbody").innerHTML = `<div class="kind">${esc(tLabel)}</div>
    <div class="info">
      ${cell("หน่วยกิต", esc(credits) + " หน่วยกิต")}
      ${cell("ประเภทวิชา", dash(cls.course_type && cls.course_type.label_th))}
      ${cell("กลุ่มรายวิชา", dash(cu.course_group || rec.group))}
      ${cell("ประเภทย่อย", dash(subs))}
      ${cell("ลักษณะในหลักสูตร", dash(cu.requirement_type ? reqText(cu.requirement_type, cu.course_group) : rec.req ? reqText(rec.req, rec.group) : ""))}
      ${cell("วิชาบังคับก่อน", esc(preText))}
    </div>
    <h3>คำอธิบายรายวิชา</h3><p>${dash(co.description_th)}</p>
    <h3>Course–PLO Mapping</h3>${ploHtml}
    <h3>รายวิชาที่ต่อยอดจากวิชานี้</h3>${depHtml}`;
}

// ===== events =====
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest(".cs-chip"); if (!b) return;
  const t = b.dataset.t;
  if (!t) picked.clear(); else picked.has(t) ? picked.delete(t) : picked.add(t);
  render();
});
$("active").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const k = b.dataset.k;
  if (k === "q") $("q").value = ""; else if (k.startsWith("t:")) picked.delete(k.slice(2)); else $(k).value = "";
  render();
});
$("results").addEventListener("click", (e) => { const b = e.target.closest(".cs-row"); if (b) openDetail(b.dataset.c, b.dataset.t, b.dataset.g); });
$("dlg").addEventListener("click", (e) => { if (e.target === $("dlg")) $("dlg").close(); });
$("q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 200); });
$("searchForm").addEventListener("submit", (e) => { e.preventDefault(); render(); });
["yr", "cr", "sort"].forEach((i) => $(i).addEventListener("change", render));
$("plan").addEventListener("change", async () => {
  const id = $("plan").value;
  if (id && !planData[id]) { $("results").innerHTML = '<div class="cs-sk"></div><div class="cs-sk"></div>'; await loadPlan(id); }
  render();
});
drawChips();
load();