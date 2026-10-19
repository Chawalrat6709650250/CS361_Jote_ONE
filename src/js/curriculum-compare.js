// หน้าเปรียบเทียบหลักสูตร: ใช้ API เดียวกับหน้าแผนการเรียน / เงื่อนไขการสำเร็จการศึกษา
// resource=study_plans, study_plan, graduation_requirements
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const norm = (c) => String(c ?? "").replace(/\s+/g, "").toUpperCase();
  const yearOf = (id) => String(id || "").split("-").pop() || "";

  const ROLE = { required: "บังคับ", project: "โครงงาน", elective: "เลือก", free_elective: "เลือกเสรี", cooperative: "สหกิจ", coop: "สหกิจ" };
  const roleText = (r) => ROLE[String(r || "").toLowerCase()] || r || "-";
  const semText = (s) => (String(s) === "3" || /summer/i.test(s) ? "ฤดูร้อน" : "ภาค " + s);

  async function api(resource, params = {}) {
    const j = window.Auth && Auth.apiFetch
      ? await Auth.apiFetch(resource, params)
      : await (await fetch(window.APP_CONFIG.apiBase + "?" + new URLSearchParams({ resource, ...params }))).json();
    if (j.success === false) throw new Error((j.error && j.error.message) || j.message || "API ตอบกลับว่าไม่สำเร็จ");
    return j;
  }

  let plans = [], data = { A: null, B: null }, filter = "all";
  const cache = {};

  // ----- โหลดแผนการเรียนทั้งหมดใส่ dropdown -----
  async function init() {
    try {
      const j = await api("study_plans");
      plans = ((j.data && j.data.study_plans) || []).filter((p) => p.active !== false && (p.status == null || p.status === "active"));
      const groups = {};
      plans.forEach((p) => (groups[yearOf(p.curriculum_id)] ||= []).push(p));
      const opts = '<option value="">— เลือก —</option>' + Object.keys(groups).sort().map((y) =>
        `<optgroup label="หลักสูตร ${esc(y)}">` + groups[y].map((p) => `<option value="${esc(p.study_plan_id)}">${esc(p.plan_name_th || p.study_plan_id)}</option>`).join("") + "</optgroup>").join("");
      $("planA").innerHTML = opts; $("planB").innerHTML = opts;
      const sp = new URLSearchParams(location.search);
      if (sp.get("a")) $("planA").value = sp.get("a");
      if (sp.get("b")) $("planB").value = sp.get("b");
      if ($("planA").value && $("planB").value) run();
    } catch (e) { showErr("โหลดรายการแผนการเรียนไม่สำเร็จ: " + esc(e.message) + " (ถ้าเป็น Failed to fetch ให้ตรวจ CORS ของ API Gateway)"); }
  }
  function showErr(m) { const e = $("err"); e.hidden = !m; e.innerHTML = m || ""; }

  // ----- ดึงข้อมูลของแผนหนึ่งแผน -----
  function loadPlan(id) {
    if (!cache[id]) cache[id] = (async () => {
      const j = await api("study_plan", { study_plan_id: id });
      const d = j.data || {};
      const meta = (d.detail && d.detail.study_plan) || d.summary || {};
      const courses = new Map(); let reqCredits = 0;
      ((d.detail && d.detail.terms) || []).forEach((t) => {
        (t.courses || []).forEach((it) => {
          const c = it.course || {}; const code = norm(c.course_code); if (!code) return;
          courses.set(code, { code: c.course_code_th || c.course_code, th: c.title_th || "", en: c.title_en || "", cr: num(c.credits_total), yr: t.study_year, tm: t.semester, role: it.course_role || "" });
        });
        (t.requirements || []).forEach((r) => { reqCredits += num(r.credits_required); });
      });
      const plan = plans.find((p) => p.study_plan_id === id) || {};
      let grad = null;
      try {
        const cid = meta.curriculum_id || plan.curriculum_id, pid = meta.pathway_id || plan.pathway_id;
        if (cid && pid) grad = ((await api("graduation_requirements", { curriculum_id: cid, pathway_id: pid })).data) || null;
      } catch { grad = null; } // บางหลักสูตรอาจยังไม่มีข้อมูลเงื่อนไข
      const list = [...courses.values()];
      return { id, name: meta.plan_name_th || plan.plan_name_th || id, cid: meta.curriculum_id || plan.curriculum_id, courses, grad,
        totalCr: list.reduce((s, c) => s + c.cr, 0) + reqCredits, reqCredits };
    })().catch((e) => { delete cache[id]; throw e; });
    return cache[id];
  }

  async function run() {
    const a = $("planA").value, b = $("planB").value;
    showErr("");
    if (!a || !b) return showErr("กรุณาเลือกแผนการเรียนทั้ง A และ B");
    if (a === b) return showErr("กรุณาเลือกแผนการเรียนที่ต่างกัน");
    $("empty").hidden = true; $("result").hidden = false;
    $("cards").innerHTML = '<div class="cc-skel"></div><div class="cc-skel"></div><div class="cc-skel"></div>';
    $("rows").innerHTML = ""; $("gradRows").innerHTML = "";
    try {
      [data.A, data.B] = await Promise.all([loadPlan(a), loadPlan(b)]);
    } catch (e) { $("result").hidden = true; return showErr("โหลดข้อมูลแผนการเรียนไม่สำเร็จ: " + esc(e.message)); }
    const u = new URL(location.href); u.searchParams.set("a", a); u.searchParams.set("b", b); history.replaceState(null, "", u);
    $("lnkPlan").href = "study-plan.html";
    $("lnkGrad").href = "graduation-requirements.html";
    build();
  }

  // ----- เปรียบเทียบรายวิชา -----
  let rows = [];
  function build() {
    const A = data.A, B = data.B; rows = [];
    const used = new Set();
    A.courses.forEach((ca, k) => {
      const cb = B.courses.get(k);
      if (cb) { used.add(k); const same = ca.yr === cb.yr && ca.tm === cb.tm && ca.cr === cb.cr && String(ca.role) === String(cb.role); rows.push({ a: ca, b: cb, st: same ? "same" : "diff" }); }
      else rows.push({ a: ca, b: null, st: "a" });
    });
    // วิชาที่ชื่ออังกฤษเหมือนกันแต่รหัสต่างกัน = เปลี่ยนรหัส
    const restB = [...B.courses.entries()].filter(([k]) => !used.has(k));
    rows.filter((r) => r.st === "a").forEach((r) => {
      const hit = restB.find(([k, cb]) => !used.has(k) && cb.en && cb.en.trim().toLowerCase() === r.a.en.trim().toLowerCase());
      if (hit) { used.add(hit[0]); r.b = hit[1]; r.st = "ren"; }
    });
    restB.forEach(([k, cb]) => { if (!used.has(k)) rows.push({ a: null, b: cb, st: "b" }); });
    rows.sort((x, y) => ((x.a || x.b).code).localeCompare((y.a || y.b).code, "en", { numeric: true }));
    cards(); drawChips(); drawRows(); drawGrad();
    $("lnkSearch").href = "course-search.html";
  }

  function cmpCard(title, va, vb, unit = "") {
    const d = va - vb;
    const txt = d === 0 ? "เท่ากัน" : `A ${d > 0 ? "มากกว่า" : "น้อยกว่า"} B ${Math.abs(d)}${unit}`;
    return `<div class="cc-card"><h3>${esc(title)}</h3><div class="vs"><span class="a">${va}</span><span class="b">${vb}</span></div><div class="diff ${d > 0 ? "up" : d < 0 ? "down" : ""}">${txt}</div></div>`;
  }
  function cards() {
    const A = data.A, B = data.B, cnt = (P, r) => [...P.courses.values()].filter((c) => String(c.role).toLowerCase() === r).length;
    const n = (s) => rows.filter((r) => r.st === s).length;
    const gA = A.grad && num(A.grad.minimum_total_credits), gB = B.grad && num(B.grad.minimum_total_credits);
    $("cards").innerHTML =
      `<div class="cc-card"><h3>แผนที่เลือก</h3><div style="font-size:14px"><b style="color:var(--cc-a)">A</b> ${esc(A.name)}<br><b style="color:var(--cc-b)">B</b> ${esc(B.name)}</div></div>` +
      cmpCard("จำนวนรายวิชาในแผน", A.courses.size, B.courses.size, " วิชา") +
      cmpCard("หน่วยกิตรวมในแผน", A.totalCr, B.totalCr, " หน่วยกิต") +
      cmpCard("วิชาบังคับ", cnt(A, "required"), cnt(B, "required"), " วิชา") +
      (gA && gB ? cmpCard("หน่วยกิตขั้นต่ำเพื่อสำเร็จการศึกษา", gA, gB, " หน่วยกิต") : "") +
      `<div class="cc-card"><h3>ผลเปรียบเทียบรายวิชา</h3><div style="font-size:14px;line-height:1.7">เหมือนกัน ${n("same")} · แตกต่าง ${n("diff")}<br>เปลี่ยนรหัส ${n("ren")} · เฉพาะ A ${n("a")} · เฉพาะ B ${n("b")}</div></div>`;
  }

  const FILTERS = [["all", "ทั้งหมด"], ["diff", "แตกต่าง"], ["same", "เหมือนกัน"], ["a", "เฉพาะ A"], ["b", "เฉพาะ B"], ["ren", "เปลี่ยนรหัส"]];
  function drawChips() {
    $("chips").innerHTML = FILTERS.map(([k, l]) => `<button class="cc-chip" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join("");
  }
  const STAT = { same: ["เหมือนกัน", "st-same"], diff: ["ต่างกัน", "st-diff"], a: ["เฉพาะ A", "st-a"], b: ["เฉพาะ B", "st-b"], ren: ["เปลี่ยนรหัส", "st-ren"] };
  function place(c, cls, other) {
    if (!c) return `<td class="n none" colspan="2">ไม่มีในแผนนี้</td>`;
    const ch = (k) => other && c[k] !== other[k];
    const hl = (t, on) => (on ? `<b>${t}</b>` : t);
    return `<td class="n ${cls}">ปี ${esc(c.yr)} · ${esc(semText(c.tm))}<br><small>${esc(roleText(c.role))}</small></td><td class="n ${cls}">${hl(c.cr, ch("cr"))}</td>`;
  }
  function drawRows() {
    const q = $("q").value.trim().toLowerCase().replace(/\s+/g, "");
    const vis = rows.filter((r) => {
      if (filter === "diff" ? !["diff", "ren"].includes(r.st) : filter !== "all" && r.st !== filter) return false;
      const c = r.a || r.b, o = r.b || r.a;
      return !q || (c.code + c.th + c.en + o.code + o.th).toLowerCase().replace(/\s+/g, "").includes(q);
    });
    $("count").textContent = "พบ " + vis.length + " รายวิชา";
    $("rows").innerHTML = vis.length ? vis.map((r) => {
      const c = r.a || r.b, [stl, stc] = STAT[r.st];
      const code = r.st === "ren" ? `${esc(r.a.code)} → ${esc(r.b.code)}` : esc(c.code);
      return `<tr><td><span class="code"><a href="course-search.html?q=${encodeURIComponent(c.code)}" title="ดูรายละเอียดในหน้าค้นหารายวิชา">${code}</a></span>
        <b>${esc(c.th)}</b><span class="en">${esc(c.en)}</span></td>${place(r.a, "ca", r.b)}${place(r.b, "cb", r.a)}<td><span class="cc-tag ${stc}">${stl}</span></td></tr>`;
    }).join("") : `<tr><td colspan="6" style="text-align:center;padding:30px;color:#666">ไม่พบรายวิชาที่ตรงกับเงื่อนไข</td></tr>`;
  }

  // ----- เปรียบเทียบเงื่อนไขการสำเร็จการศึกษา -----
  function drawGrad() {
    const A = data.A.grad, B = data.B.grad;
    if (!A && !B) { $("gradRows").innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#666">ยังไม่มีข้อมูลเงื่อนไขการสำเร็จการศึกษาของแผนที่เลือก</td></tr>`; $("gradNote").textContent = ""; return; }
    const keys = []; const mapA = {}, mapB = {};
    const add = (g, m) => ((g && g.categories) || []).forEach((c) => { const k = c.key || c.name_th; m[k] = c; if (!keys.includes(k)) keys.push(k); });
    add(A, mapA); add(B, mapB);
    const line = (a, b, name, bold) => {
      const va = a ? num(a.minimum_credits) : null, vb = b ? num(b.minimum_credits) : null;
      const d = va != null && vb != null ? va - vb : null;
      const dt = d == null ? "-" : d === 0 ? "เท่ากัน" : (d > 0 ? "A +" : "B +") + Math.abs(d);
      return `<tr><td>${bold ? `<b>${esc(name)}</b>` : esc(name)}</td><td class="n ca">${va == null ? "-" : va}</td><td class="n cb">${vb == null ? "-" : vb}</td><td class="d ${d > 0 ? "d-up" : d < 0 ? "d-down" : ""}">${dt}</td></tr>`;
    };
    let h = line({ minimum_credits: A && A.minimum_total_credits }, { minimum_credits: B && B.minimum_total_credits }, "รวมหน่วยกิตขั้นต่ำทั้งหลักสูตร", true);
    keys.forEach((k) => {
      const a = mapA[k], b = mapB[k];
      h += line(a, b, (a || b).name_th, true);
      const sub = []; const sa = {}, sb = {};
      const adds = (c, m) => ((c && c.details) || []).forEach((d) => { m[d.name_th] = d; if (!sub.includes(d.name_th)) sub.push(d.name_th); });
      adds(a, sa); adds(b, sb);
      sub.forEach((n) => { h += line(sa[n], sb[n], "   ↳ " + n, false); });
    });
    $("gradRows").innerHTML = h;
    $("gradNote").textContent = "ข้อมูลจากหน้า “เงื่อนไขการสำเร็จการศึกษา” (resource=graduation_requirements) หมวดที่ไม่มีในอีกฝั่งจะแสดงเป็น “-”";
  }

  // ----- events -----
  $("go").addEventListener("click", run);
  $("swap").addEventListener("click", () => { const a = $("planA").value; $("planA").value = $("planB").value; $("planB").value = a; if ($("planA").value && $("planB").value) run(); });
  $("chips").addEventListener("click", (e) => { const b = e.target.closest(".cc-chip"); if (!b) return; filter = b.dataset.f; drawChips(); drawRows(); });
  let t; $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(drawRows, 150); });
  document.querySelectorAll(".cc-tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".cc-tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
    $("pane-courses").hidden = b.dataset.tab !== "courses"; $("pane-grad").hidden = b.dataset.tab !== "grad";
  }));
  $("copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); $("copy").textContent = "คัดลอกแล้ว ✓"; setTimeout(() => ($("copy").textContent = "คัดลอกลิงก์เปรียบเทียบนี้"), 1800); } catch { prompt("คัดลอกลิงก์นี้", location.href); } });
  init();
})();
