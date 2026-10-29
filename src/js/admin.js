/* CSTU V4 Admin UI — uses existing Cognito login. No credentials stored here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.body.dataset.root || '../';
  const guard = $('adm-guard');
  const user = window.Auth?.getUser?.();
  if (!window.Auth?.isLoggedIn?.()) {
    guard.hidden = false;
    guard.textContent = 'กรุณาเข้าสู่ระบบด้วยบัญชี Admin ก่อนใช้งาน (ใช้แท็บนี้ในการเข้าสู่ระบบ เพื่อให้สถานะ Login ต่อเนื่อง)';
    const link = document.createElement('a'); link.href = root + 'pages/login.html?next=' + encodeURIComponent(location.pathname); link.textContent = ' ไปหน้าเข้าสู่ระบบ'; guard.append(link);
    return;
  }
  if (!window.Auth.hasRole('Admin')) {
    guard.hidden = false;
    guard.textContent = 'บัญชีนี้ไม่มีสิทธิ์จัดการหลักสูตร (ต้องอยู่ในกลุ่ม Admin)';
    return;
  }
  $('adm-app').hidden = false;
  if ($('adm-user')) $('adm-user').textContent = `เข้าสู่ระบบในชื่อ ${user?.name || user?.username || 'Admin'}`;
  const base = new URL(window.APP_CONFIG.apiBase).origin + '/prod';
  let courses = [];
  let editMode = 'POST';
  let busy = false;
  let currentRule = null;
  let preparedRulePatch = null;
  let savingRule = false;
  let editableRequiredCourses = [];
  const compareCourseCodes = (a, b) => String(a).localeCompare(String(b), 'en', {numeric: true, sensitivity: 'base'});
  const safe = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pick = (obj, names, fallback = '') => names.find(k => obj?.[k] !== undefined && obj[k] !== null) ? obj[names.find(k => obj?.[k] !== undefined && obj[k] !== null)] : fallback;
  function notice(message, kind = '') { const n = $('adm-notice'); n.hidden = false; n.className = 'adm-notice ' + kind; n.textContent = message; }
  function error(e) { notice(e.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error'); }
  async function api(path, {method='GET', body, params}={}) {
    if (busy && method !== 'GET') throw new Error('กำลังบันทึกข้อมูลก่อนหน้า');
    const token = await window.Auth.getToken();
    if (!token) throw new Error('Token หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    const url = new URL(base + path);
    Object.entries(params || {}).forEach(([k,v]) => {if(v !== '' && v != null) url.searchParams.set(k, v);});
    const res = await fetch(url, {method, headers: {'Accept':'application/json', ...(body !== undefined ? {'Content-Type':'application/json'} : {}), Authorization: (window.APP_CONFIG.authScheme ? window.APP_CONFIG.authScheme + ' ' : '') + token}, ...(body !== undefined ? {body:JSON.stringify(body)} : {})});
    const raw = await res.text(); let data; try {data = raw ? JSON.parse(raw) : null;} catch {data = raw;}
    if(!res.ok || data?.success === false) {const description = typeof data === 'object' ? (data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '')) : String(data || ''); throw new Error(`API ${res.status}: ${description || (res.status === 403 ? 'ไม่มีสิทธิ์เข้าถึง' : 'ไม่สามารถดำเนินการได้')}`);}
    return data;
  }
  function arrayOf(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) if(Array.isArray(data?.[key])) return data[key];
    if(Array.isArray(data?.data)) return data.data;
    if(data?.data && typeof data.data === 'object') return arrayOf(data.data, keys);
    if(Array.isArray(data?.body)) return data.body;
    return [];
  }
  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach(b => {const active = b.dataset.tab === name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== name);
  }
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab)));
  function renderCourses() {
    const q = $('course-search').value.trim().toLowerCase();
    const rows = courses.filter(c => (!$('courses-year').value || String(c.curriculum_year ?? c.year) === $('courses-year').value) && JSON.stringify(c).toLowerCase().includes(q));
    $('course-rows').innerHTML = rows.length ? rows.map((c,i) => `<tr><td><strong>${safe(pick(c,['course_code','courseCode','code','id'],'—'))}</strong></td><td>${safe(pick(c,['title_en','title_th','course_name_th','course_name','name_th','name','title'],'—'))}</td><td>${safe(pick(c,['credits','credit','credit_total'],'—'))}</td><td>${safe(pick(c,['year','curriculum_year','curriculumYear'],'—'))}</td><td><button type="button" data-edit="${courses.indexOf(c)}">แก้ไข</button></td></tr>`).join('') : '<tr><td class="adm-empty" colspan="5">ไม่พบรายการ หรือ API ส่งข้อมูลในรูปแบบที่ยังไม่รองรับ</td></tr>';
  }
  async function loadCourses() {
    $('load-courses').disabled = true;
    $('load-courses').textContent = 'กำลังโหลด…';
    $('course-rows').innerHTML = '<tr><td colspan="5">กำลังโหลดข้อมูล…</td></tr>';
    try {const data = await api('/admin/courses', {params:{year:$('courses-year').value.trim()}}); courses = arrayOf(data,['courses','items','results','records']); renderCourses(); if(!courses.length) notice('API ตอบกลับแล้ว แต่ไม่พบรายการรายวิชา กรุณาตรวจสอบรูปแบบ response ของ Backend'); else notice(`โหลดรายวิชาแล้ว ${courses.length} รายการ`,'success');}
    catch(e){$('course-rows').innerHTML='<tr><td colspan="5" class="adm-empty">โหลดรายวิชาไม่สำเร็จ กรุณากด “ลองอีกครั้ง” หรือตรวจสอบบัญชี Admin</td></tr>';error(e);$('load-courses').textContent = '↻ ลองอีกครั้ง';}
    finally { $('load-courses').disabled = false; if($('load-courses').textContent === 'กำลังโหลด…') $('load-courses').textContent = '↻ รีเฟรชข้อมูล'; }
  }
  $('load-courses').addEventListener('click',loadCourses);
  $('course-search').addEventListener('input',renderCourses);
  $('courses-year').addEventListener('change',renderCourses);
  function openModal(mode, course) {
    editMode = mode;
    $('json-title').textContent = mode === 'POST' ? 'เพิ่มรายวิชาใหม่' : 'แก้ไขข้อมูลรายวิชา';
    $('json-year').value = String(pick(course,['year','curriculum_year','curriculumYear'],$('courses-year').value));
    $('json-code').value = String(pick(course,['course_code','courseCode','code','id'],''));
    $('json-body').value = JSON.stringify(course || {},null,2);
    $('course-name').value = String(pick(course,['title_en','course_name','name','title'],''));
    $('course-credits').value = String(pick(course,['credits','credit','credit_total'],''));
    $('course-name-th').value = String(pick(course,['title_th','course_name_th','name_th'],''));
    $('course-category').value = String(pick(course,['category'],''));
    $('course-active').checked = pick(course,['active'],true) !== false;
    $('json-modal').showModal();
  }
  function updateCourseDraft() {
    let obj; try { obj=JSON.parse($('json-body').value); } catch { return; }
    if(!obj || typeof obj!=='object' || Array.isArray(obj))return;
    const assign=(keys,value,defaultKey)=> { const k=keys.find(x=>Object.prototype.hasOwnProperty.call(obj,x)) || defaultKey; if(value!=='' || Object.prototype.hasOwnProperty.call(obj,k))obj[k]=value; };
    assign(['curriculum_year','year','curriculumYear'], $('json-year').value, 'curriculum_year');
    assign(['course_code','courseCode','code'], $('json-code').value.trim(), 'course_code');
    assign(['title_en','course_name','name','title'], $('course-name').value.trim(), 'title_en');
    assign(['title_th','course_name_th','name_th'], $('course-name-th').value.trim(), 'title_th');
    assign(['category'], $('course-category').value, 'category');
    obj.active = $('course-active').checked;
    const credit=$('course-credits').value;
    if(credit!=='')assign(['credits','credit','credit_total'], Number(credit), 'credits');
    $('json-body').value=JSON.stringify(obj,null,2);
  }
  ['json-year','json-code','course-name','course-credits','course-name-th','course-category','course-active'].forEach(id=>$(id).addEventListener('input',updateCourseDraft));
  // Prerequisites: always show the saved rule before allowing a full replacement.
  let loadedPrereq = null;
  let pendingPrereq = null;
  let preSequence = 0;
  let savingPrereq = false;
  function preCode() { return String($('pre-code').value || '').replace(/\s+/g, '').toUpperCase(); }
  function resetPrereq(message) {
    loadedPrereq = null; pendingPrereq = null;
    $('pre-edit-fields').disabled = true;
    $('pre-preview').hidden = true; $('pre-save').hidden = true;
    $('pre-current').textContent = message || 'เลือกปีหลักสูตรและรหัสวิชา แล้วกด “ดูเงื่อนไขเดิม” ก่อนแก้ไข';
  }
  function describePrereq(p) {
    if (!p || !Array.isArray(p.items) || !p.items.length) return 'ไม่มีวิชาบังคับก่อน';
    return `${p.op === 'OR' ? 'เลือกผ่านอย่างใดอย่างหนึ่ง (OR)' : 'ต้องครบทุกวิชา (AND)'}: ` +
      p.items.map(it => it.condition === 'min_grade' ? `${it.course} (เกรดอย่างน้อย ${it.grade})` : `${it.course} (เคยศึกษา)`).join(' / ');
  }
  function invalidatePrereqPreview() { pendingPrereq = null; $('pre-preview').hidden = true; $('pre-save').hidden = true; }
  function updatePrereqDraft() {
    const isRemove = $('pre-remove').checked;
    $('pre-list').disabled = isRemove;
    ['pre-op', 'pre-condition', 'pre-grade'].forEach(id => $(id).disabled = isRemove);
    if (!isRemove) $('pre-grade').disabled = $('pre-condition').value !== 'min_grade';
    invalidatePrereqPreview();
  }
  async function loadPrereq() {
    const year = $('pre-year').value;
    const code = preCode();
    if (!year || !/^[A-Z]{2,5}\d{3}$/.test(code)) { resetPrereq('กรุณาเลือกปีและกรอกรหัสวิชาให้ถูกต้อง เช่น CS254'); return; }
    const sequence = ++preSequence;
    resetPrereq('กำลังโหลดวิชาบังคับก่อนจาก AWS…');
    $('pre-load').disabled = true;
    try {
      const result = await api('/admin/courses', {params:{year}});
      if (sequence !== preSequence) return;
      const list = arrayOf(result, ['courses','items','results','records']);
      const matched = list.find(c => String(c.course_code || '').toUpperCase() === code && String(c.curriculum_year) === year);
      if (!matched) { $('pre-current').textContent = `ไม่พบ ${code} ในตารางรายวิชาปี ${year} — API นี้แก้ได้เฉพาะวิชาที่มีในตารางรายวิชา`; return; }
      loadedPrereq = {year, code, prerequisite: matched.prerequisite || null};
      $('pre-current').textContent = `เงื่อนไขปัจจุบันของ ${code} (${year}): ${describePrereq(loadedPrereq.prerequisite)}`;
      const p = loadedPrereq.prerequisite;
      $('pre-op').value = p?.op === 'OR' ? 'OR' : 'AND';
      const items = Array.isArray(p?.items) ? p.items : [];
      const first = items[0];
      const homogeneous = items.every(it => it.condition === (first?.condition || 'taken') && (it.grade || '') === (first?.grade || ''));
      $('pre-condition').value = homogeneous && first?.condition === 'min_grade' ? 'min_grade' : 'taken';
      $('pre-grade').value = homogeneous && first?.grade ? first.grade : 'C';
      $('pre-list').value = homogeneous ? items.map(it=>it.course).join(', ') : '';
      $('pre-reason').value = ''; $('pre-remove').checked = false;
      $('pre-edit-fields').disabled = false;
      if (!homogeneous) {
        $('pre-current').textContent += ' — หมายเหตุ: เงื่อนไขเดิมมีเกณฑ์ต่างกันในแต่ละวิชา ฟอร์มนี้รองรับเกณฑ์เดียวกันทั้งหมด โปรดตรวจสอบให้ดีก่อนบันทึก';
      }
      updatePrereqDraft();
    } catch(e) { if (sequence === preSequence) {resetPrereq('โหลดข้อมูลไม่สำเร็จ: ' + e.message);} }
    finally {if(sequence === preSequence) $('pre-load').disabled = false;}
  }
  $('pre-year').addEventListener('change', async () => {
    ++preSequence;
    resetPrereq();
    $('pre-course-options').replaceChildren();
    const year = $('pre-year').value;
    if (!year) return;
    try {
      const result = await api('/admin/courses', {params:{year}});
      if ($('pre-year').value !== year) return;
      arrayOf(result,['courses','items','results','records']).forEach(c => {
        if (c.course_code) $('pre-course-options').append(new Option(`${c.course_code} — ${c.title_en || c.title_th || ''}`,c.course_code));
      });
    } catch(e) { $('pre-current').textContent = 'โหลดรายชื่อวิชาไม่สำเร็จ: ' + e.message; }
  });
  $('pre-code').addEventListener('input', () => { ++preSequence;resetPrereq(); });
  $('pre-load').addEventListener('click',loadPrereq);
  ['pre-list','pre-op','pre-condition','pre-grade','pre-reason','pre-remove'].forEach(id => {
    $(id).addEventListener('input', updatePrereqDraft);
    $(id).addEventListener('change', updatePrereqDraft);
  });
  $('prereq-form').addEventListener('submit',ev => {
    ev.preventDefault();
    if (!loadedPrereq || loadedPrereq.year !== $('pre-year').value || loadedPrereq.code !== preCode()) {
      notice('กรุณาโหลดเงื่อนไขของวิชานี้ก่อนแก้ไข','error'); return;
    }
    const reason = $('pre-reason').value.trim();
    if (reason.length < 3 || reason.length > 500) { notice('เหตุผลต้องมี 3–500 ตัวอักษร','error');return; }
    let prerequisite = null;
    if (!$('pre-remove').checked) {
      const codes = $('pre-list').value.split(',').map(c=>c.replace(/\s+/g,'').toUpperCase()).filter(Boolean);
      if (!codes.length || codes.length > 10 || codes.some(c => !/^[A-Z]{2,5}\d{3}$/.test(c)) || new Set(codes).size !== codes.length || codes.includes(preCode())) {
        notice('ตรวจรหัสวิชาบังคับก่อน: ต้องมี 1–10 วิชา ไม่ซ้ำ ไม่ใช่วิชาตัวเอง และใช้รูปแบบเช่น CS111','error');return;
      }
      const condition = $('pre-condition').value;
      prerequisite = {op:$('pre-op').value,items:codes.map(course=>condition==='min_grade' ? {course,condition,grade:$('pre-grade').value} : {course,condition})};
    }
    const normalized = p => p ? JSON.stringify({op:p.op,items:p.items.map(it=>({course:it.course,condition:it.condition, ...(it.condition==='min_grade'?{grade:it.grade}:{})}))}) : 'null';
    if(normalized(prerequisite) === normalized(loadedPrereq.prerequisite)) {notice('เงื่อนไขใหม่เหมือนเดิม ไม่มีข้อมูลที่เปลี่ยน','error');return;}
    pendingPrereq = {year:loadedPrereq.year,code:loadedPrereq.code,body:{reason,prerequisite}};
    $('pre-json').value = JSON.stringify(pendingPrereq.body);
    $('pre-preview').replaceChildren();
    const title=document.createElement('strong');title.textContent='ตรวจสอบก่อนบันทึกลง AWS';
    const before=document.createElement('p');before.textContent='ก่อนแก้: '+describePrereq(loadedPrereq.prerequisite);
    const after=document.createElement('p');after.textContent='หลังแก้: '+describePrereq(prerequisite);
    const why=document.createElement('p');why.textContent='เหตุผล: '+reason;
    $('pre-preview').append(title,before,after,why);
    $('pre-preview').hidden=false;$('pre-save').hidden=false;
    $('pre-preview').scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  $('pre-save').addEventListener('click', async () => {
    if(!pendingPrereq || savingPrereq) return;
    const {year,code,body}=pendingPrereq;
    if (!confirm(`ยืนยันแก้ไขวิชาบังคับก่อนของ ${code} (ปี ${year}) บน AWS จริงหรือไม่?`)) return;
    savingPrereq=true;$('pre-save').disabled=true;$('pre-save').textContent='กำลังบันทึก…';
    try {
      await api(`/admin/courses/${encodeURIComponent(year)}/${encodeURIComponent(code)}/prerequisite`,{method:'PUT',body});
      pendingPrereq=null;$('pre-preview').hidden=true;$('pre-save').hidden=true;
      await loadPrereq();
      notice(`บันทึกวิชาบังคับก่อนของ ${code} สำเร็จ — ตรวจสอบในแท็บประวัติการเปลี่ยนแปลงได้`,'success');
    } catch(e) {error(e);}
    finally {savingPrereq=false;$('pre-save').disabled=false;$('pre-save').textContent='ยืนยันและบันทึกลง AWS';}
  });
  $('add-course').addEventListener('click',()=>openModal('POST'));
  $('course-rows').addEventListener('click',ev=>{const b=ev.target.closest('[data-edit]');if(b)openModal('PUT',courses[Number(b.dataset.edit)]);});
  const closeModal = ()=>$('json-modal').close();
  $('close-json').addEventListener('click',closeModal);$('cancel-json').addEventListener('click',closeModal);
  function parseBody(id) {const val = $(id).value.trim();if(!val)throw new Error('กรุณากรอก JSON');let out;try{out=JSON.parse(val);}catch{throw new Error('JSON ไม่ถูกต้อง กรุณาตรวจสอบเครื่องหมาย , และวงเล็บ');}if(!out || typeof out !== 'object' || Array.isArray(out))throw new Error('ข้อมูลต้องเป็น JSON object');return out;}
  function encoded(value){return encodeURIComponent(String(value).trim());}
  async function save(method,path,body,after) {
    if(!confirm('ยืนยันการบันทึกข้อมูลจริงผ่าน API?'))return;
    busy = true; const buttons = [...document.querySelectorAll('.adm-btn')];buttons.forEach(x=>x.disabled=true);
    try {await api(path,{method,body});notice('บันทึกข้อมูลผ่าน API สำเร็จ กรุณาตรวจสอบประวัติการเปลี่ยนแปลง','success');if(after)await after();}
    catch(e){error(e);}finally{busy=false;buttons.forEach(x=>x.disabled=false);}
  }
  $('json-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    try {updateCourseDraft();const body=parseBody('json-body'); const year=$('json-year').value.trim(),code=$('json-code').value.trim();if(!year||!code)throw new Error('ระบุปีหลักสูตรและรหัสวิชาก่อน');
      const path=editMode==='POST' ? '/admin/courses' : `/admin/courses/${encoded(year)}/${encoded(code)}`;
      notice('เตรียมข้อมูลฟอร์มเรียบร้อยแล้ว แต่ยังไม่ส่งบันทึก: รอยืนยัน Request Body จาก Backend', 'error');
    }catch(e){error(e);}
  });

  // Public list for dropdown; Admin detail endpoint uses the Cognito ID token.
  async function loadPlanOptions() {
    const select = $('rule-plan');
    const previous = select.value;
    select.disabled = true;
    select.replaceChildren(new Option('กำลังโหลดแผนการเรียน…', ''));
    try {
      const url = new URL(base + '/api');
      url.searchParams.set('resource', 'graduation_rules');
      const response = await fetch(url, {headers:{Accept:'application/json'}});
      if (!response.ok) throw new Error('โหลดแผนการเรียนไม่สำเร็จ (HTTP ' + response.status + ')');
      const payload = await response.json();
      if (payload?.success === false) throw new Error(payload.message || 'โหลดแผนการเรียนไม่สำเร็จ');
      const plans = arrayOf(payload,['plans']);
      if (!plans.length) throw new Error('ไม่พบรายการแผนการเรียนจาก API');
      select.replaceChildren(new Option('เลือกแผนการเรียน', ''));
      const years = [...new Set(plans.map(p => String(p.curriculum_year || '')).filter(Boolean))].sort();
      years.forEach(year => {
        const group = document.createElement('optgroup');
        group.label = 'หลักสูตรปี ' + year;
        plans.filter(p => String(p.curriculum_year) === year).forEach(plan => {
          const opt = new Option(plan.plan_name_th + ' (' + plan.plan_code + ')',plan.study_plan_id);
          group.append(opt);
        });
        select.append(group);
      });
      if (plans.some(p => p.study_plan_id === previous)) select.value = previous;
      $('rules-status').textContent = 'เลือกแผนการเรียนจากรายการเพื่อดูรายละเอียด';
    } catch (err) {
      select.replaceChildren(new Option('โหลดแผนการเรียนไม่สำเร็จ', ''));
      $('rules-status').textContent = err.message + ' — กรุณาลองกดรีเฟรชอีกครั้ง';
    } finally {select.disabled = false;}
  }
  function displayRuleDetails(payload) {
    const data = payload?.data || payload;
    if (!data || !data.study_plan_id) throw new Error('API ส่งข้อมูลเงื่อนไขในรูปแบบที่ไม่รองรับ');
    $('rules-json').value = JSON.stringify(data);
    currentRule = structuredClone(data);
    $('edit-rules').disabled = false;
    $('rule-edit-form').hidden = true;
    $('rule-edit-preview').hidden = true;
    $('save-rule-changes').hidden = true; preparedRulePatch = null;
    $('rule-name').textContent = data.plan_name_th || data.study_plan_id;
    $('rule-version').textContent = 'เวอร์ชัน ' + (data.version ?? '—');
    $('rule-id').textContent = data.study_plan_id;
    $('rule-credits').textContent = (data.min_total_credits ?? '—') + ' หน่วยกิต';
    $('rule-gpa').textContent = data.min_gpa === undefined ? '—' : Number(data.min_gpa).toFixed(2);
    $('rule-year').textContent = data.curriculum_year || '—';
    const cats = Array.isArray(data.categories) ? data.categories : [];
    const tbody = $('rule-categories'); tbody.replaceChildren();
    cats.forEach(cat => {
      const tr = document.createElement('tr');
      [cat.label_th || cat.id || '—', String(cat.min_credits ?? '—')].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});
      tbody.append(tr);
    });
    if (!cats.length) {const tr=document.createElement('tr'); const td=document.createElement('td');td.colSpan=2;td.textContent='ไม่มีข้อมูลหน่วยกิตรายหมวด';tr.append(td);tbody.append(tr);}
    function renderCodes(id, codes) {
      const element = $(id); element.replaceChildren();
      if (!Array.isArray(codes) || !codes.length) {element.textContent = 'ไม่มีรายการ';return;}
      codes.forEach(code => {const span = document.createElement('span');span.className = 'adm-course-chip';span.textContent = String(code);element.append(span);});
    }
    // Display a course in only one section. The API can include project/coop
    // courses in required_courses as well; do not mutate the source data.
    const projectCourses = Array.isArray(data.project_or_coop_courses)
      ? data.project_or_coop_courses : [];
    const projectSet = new Set(projectCourses.map(code => String(code).trim()));
    const requiredCourses = Array.isArray(data.required_courses)
      ? data.required_courses.filter(code => !projectSet.has(String(code).trim())) : [];
    renderCodes('rule-required', [...requiredCourses].sort(compareCourseCodes));
    $('rule-coop-block').hidden = projectCourses.length === 0;
    renderCodes('rule-coop', [...projectCourses].sort(compareCourseCodes));
    $('rule-source').hidden = !data.source_note_th;
    $('rule-source').textContent = data.source_note_th || '';
    $('rule-updated').textContent = 'อัปเดตล่าสุด: ' + (data.updated_at ? new Date(data.updated_at).toLocaleString('th-TH') : 'ไม่ระบุ') + ' · โดย ' + (data.updated_by || 'ไม่ระบุ');
    $('rules-display').hidden = false;
    $('rules-status').hidden = true;
  }
  async function loadRules() {
    const id = $('rule-plan').value;
    $('rules-display').hidden = true;
    $('edit-rules').disabled = true;
    $('rule-edit-form').hidden = true;
    $('save-rule-changes').hidden = true; preparedRulePatch = null;
    currentRule = null;
    $('rules-status').hidden = false;
    if (!id) { $('rules-status').textContent = 'กรุณาเลือกแผนการเรียน'; return; }
    const button = $('load-rules'); button.disabled = true;
    $('rules-status').textContent = 'กำลังโหลดเงื่อนไขการจบ…';
    try {
      const data = await api('/admin/graduation-rules/' + encoded(id));
      displayRuleDetails(data);
    } catch (err) { $('rules-status').textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + err.message; }
    finally {button.disabled = false;}
  }
  // Required graduation courses are separate from enrollment prerequisites.
  // Keep project/coop codes in the saved array if they are part of the rules;
  // removing duplicates from the read-only display must not remove stored data.
  function normalizeRequiredCode(value) {return String(value || '').replace(/\s+/g,'').toUpperCase();}
  function renderEditableRequired() {
    const holder = $('edit-required-list');
    holder.replaceChildren();
    const list = document.createElement('div');
    list.className = 'adm-required-vertical-list';
    list.setAttribute('role', 'list');
    [...editableRequiredCourses].sort(compareCourseCodes).forEach((code, index) => {
      const row = document.createElement('div');
      row.className = 'adm-required-course-row';
      row.setAttribute('role', 'listitem');
      const left = document.createElement('div');
      left.className = 'adm-required-course-info';
      const number = document.createElement('span');
      number.className = 'adm-required-course-number';
      number.textContent = String(index + 1) + '.';
      const label = document.createElement('strong');
      label.textContent = code;
      left.append(number, label);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'adm-required-remove-button';
      remove.textContent = 'ลบ';
      remove.setAttribute('aria-label', 'ลบรายวิชา ' + code + ' จากเงื่อนไขการจบ');
      remove.addEventListener('click', () => {
        if (!window.confirm('ต้องการลบรายวิชา ' + code + ' ออกจากรายวิชาบังคับสำหรับการจบใช่หรือไม่?\n\nรายการจะยังไม่ถูกแก้ไขบน AWS จนกว่าจะกดยืนยันบันทึกการเปลี่ยนแปลง')) return;
        editableRequiredCourses = editableRequiredCourses.filter(x => x !== code);
        preparedRulePatch = null;
        $('save-rule-changes').hidden = true;
        renderEditableRequired();
        updateRuleValidation();
      });
      row.append(left, remove);
      list.append(row);
    });
    if (editableRequiredCourses.length) holder.append(list);
    else {
      const empty = document.createElement('p');
      empty.className = 'adm-editor-help';
      empty.textContent = 'ยังไม่มีรายวิชาบังคับสำหรับแผนนี้';
      holder.append(empty);
    }
    $('edit-required-count').textContent = `(${editableRequiredCourses.length} วิชา)`;
  }
  function addRequiredCourse() {
    const input=$('edit-required-code');const code=normalizeRequiredCode(input.value);
    if(!/^[A-Z]{2,5}\d{3}$/.test(code)) {notice('กรุณาระบุรหัสวิชาที่ถูกต้อง เช่น CS350','error');input.focus();return;}
    if(editableRequiredCourses.includes(code)) {notice('รหัส '+code+' อยู่ในรายการแล้ว','error');input.focus();return;}
    editableRequiredCourses.push(code); input.value='';
    renderEditableRequired();updateRuleValidation();input.focus();
  }
  $('edit-required-add').addEventListener('click',addRequiredCourse);
  $('edit-required-code').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();addRequiredCourse();}
  });
  function updateRuleValidation() {
    const reason = $('edit-rule-reason').value.trim();
    const credits = Number($('edit-rule-credits').value);
    const gpa = Number($('edit-rule-gpa').value);
    const valid = reason.length >= 3 && $('edit-rule-credits').value !== '' && Number.isInteger(credits) && credits >= 1 && credits <= 300 && $('edit-rule-gpa').value !== '' && Number.isFinite(gpa) && gpa >= 0 && gpa <= 4 && [...document.querySelectorAll('[data-cat-id]')].every(x => x.value !== '' && Number.isInteger(Number(x.value)) && Number(x.value) >= 0 && Number(x.value) <= 200) && reason.length <= 500;
    $('preview-rule-edit').disabled = !valid;
    $('edit-rule-reason-help').textContent = reason.length < 3 ? 'กรุณากรอกเหตุผลอย่างน้อย 3 ตัวอักษร' : 'เหตุผลครบตามเงื่อนไขแล้ว';
    $('rule-edit-preview').hidden = true;
    $('save-rule-changes').hidden = true; preparedRulePatch = null;
  }
  $('edit-rules').addEventListener('click', () => {
    if (!currentRule) return;
    $('rule-edit-form').hidden = false;
    $('edit-rule-credits').value = currentRule.min_total_credits ?? '';
    $('edit-rule-gpa').value = currentRule.min_gpa ?? '';
    $('edit-rule-reason').value = '';
    editableRequiredCourses = [...new Set((currentRule.required_courses || []).map(normalizeRequiredCode))];
    $('edit-required-code').value='';
    renderEditableRequired();
    const holder = $('edit-rule-categories'); holder.replaceChildren();
    (currentRule.categories || []).forEach(cat => {
      const label = document.createElement('label');
      label.textContent = cat.label_th || cat.id;
      const input = document.createElement('input'); input.type='number';input.min='0';input.step='1';input.required=true;
      input.dataset.catId = cat.id; input.value=cat.min_credits ?? '';
      input.addEventListener('input',updateRuleValidation);label.append(input);holder.append(label);
    });
    updateRuleValidation();
    $('rule-edit-form').scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  ['edit-rule-credits','edit-rule-gpa','edit-rule-reason'].forEach(id => $(id).addEventListener('input',updateRuleValidation));
  $('cancel-rule-edit').addEventListener('click',()=>{$('rule-edit-form').hidden=true; $('save-rule-changes').hidden=true; preparedRulePatch=null;});
  $('rule-edit-form').addEventListener('submit', event => {
    event.preventDefault(); updateRuleValidation();
    if ($('preview-rule-edit').disabled || !currentRule) return;
    const categories = (currentRule.categories || []).map(cat => {
      const input = [...document.querySelectorAll('[data-cat-id]')].find(x => x.dataset.catId === cat.id);
      return { id: cat.id, label_th: cat.label_th || cat.id, min_credits: Number(input.value) };
    });
    const total = Number($('edit-rule-credits').value);
    const catSum = categories.reduce((sum, x) => sum + x.min_credits, 0);
    if (catSum > total) {notice(`หน่วยกิตรวมตามหมวด (${catSum}) มากกว่าหน่วยกิตรวมขั้นต่ำ (${total})`, 'error');return;}
    const patch = {reason: $('edit-rule-reason').value.trim(), version: currentRule.version ?? 1};
    const newGpa = Number($('edit-rule-gpa').value);
    if (total !== Number(currentRule.min_total_credits)) patch.min_total_credits = total;
    if (newGpa !== Number(currentRule.min_gpa)) patch.min_gpa = newGpa;
    if (categories.some((c,i) => c.min_credits !== Number(currentRule.categories[i].min_credits))) patch.categories = categories;
    const originalRequired = (currentRule.required_courses || []).map(normalizeRequiredCode);
    const sameRequiredSet = originalRequired.length === editableRequiredCourses.length && originalRequired.every(code => editableRequiredCourses.includes(code));
    if (!sameRequiredSet) {
      patch.required_courses = [...editableRequiredCourses].sort(compareCourseCodes);
    }
    if (!['min_total_credits','min_gpa','categories','required_courses'].some(k => Object.hasOwn(patch,k))) {
      notice('ยังไม่มีข้อมูลที่เปลี่ยนแปลง กรุณาแก้ไขอย่างน้อยหนึ่งค่า', 'error'); return;
    }
    preparedRulePatch = patch;
    const preview = $('rule-edit-preview'); preview.replaceChildren();
    const title = document.createElement('strong'); title.textContent = 'ตรวจสอบข้อมูลก่อนบันทึกจริง';
    const details = document.createElement('p');
    const added = editableRequiredCourses.filter(x=>!originalRequired.includes(x));
    const removed = originalRequired.filter(x=>!editableRequiredCourses.includes(x));
    details.textContent = `แผน: ${currentRule.study_plan_id} | หน่วยกิตขั้นต่ำ: ${currentRule.min_total_credits} → ${total} | GPA: ${currentRule.min_gpa} → ${newGpa} | ผลรวมหมวด: ${catSum} | รายวิชาบังคับเพิ่ม ${added.length} (${added.join(', ') || 'ไม่มี'}) | ลบ ${removed.length} (${removed.join(', ') || 'ไม่มี'}) | เหตุผล: ${patch.reason}`;
    preview.append(title,details); preview.hidden = false;
    $('save-rule-changes').hidden = false;
    $('save-rule-changes').focus();
  });
  $('save-rule-changes').addEventListener('click', async () => {
    if (!preparedRulePatch || !currentRule || savingRule) return;
    const planId = currentRule.study_plan_id;
    if (!confirm(`ยืนยันบันทึกการแก้ไขเงื่อนไขการจบของแผน ${planId} ลง AWS จริงหรือไม่?`)) return;
    savingRule = true;
    const button = $('save-rule-changes'); button.disabled = true; button.textContent = 'กำลังบันทึก…';
    try {
      const response = await api('/admin/graduation-rules/' + encoded(planId), {method:'PUT',body:preparedRulePatch});
      const changeId = response?.data?.change_id;
      preparedRulePatch = null; button.hidden = true;
      await loadRules();
      notice('บันทึกเงื่อนไขการจบสำเร็จ' + (changeId ? ` (รหัสประวัติ ${changeId})` : '') + ' — ตรวจสอบได้ในแท็บประวัติการเปลี่ยนแปลง', 'success');
      const warnings = response?.data?.warnings || [];
      if (warnings.length) $('rules-status').textContent = warnings.join(' / ');
    } catch (e) {error(e); if (/409/.test(e.message)) {button.hidden = true;preparedRulePatch=null; $('rule-edit-preview').hidden=true;} }
    finally {savingRule = false; button.disabled = false; button.textContent = 'ยืนยันและบันทึกลง AWS';}
  });
  $('rule-plan').addEventListener('change',loadRules);
  $('load-rules').addEventListener('click',()=>{
    if (!$('rule-plan').value) loadPlanOptions();
    else loadRules();
  });
  document.querySelector('[data-tab="rules"]').addEventListener('click',()=>{
    if ($('rule-plan').options.length <= 1 && !$('rule-plan').disabled) loadPlanOptions();
  });
  // The API entity_id identifies a course or study plan (e.g. RULES#BSC-CS-2566-ACS-COOP),
  // not a course embedded inside required_courses. Load audit entries and search their
  // content locally so users can search for CS100 mentioned in before/after or reason.
  let changeItems = [];
  let changesLoaded = false;
  let changesRequestSequence = 0;
  const changeSearchText = row => [row.entity_id, row.entity_type, row.action, row.reason,
    row.by, row.by_name, JSON.stringify(row.before ?? {}), JSON.stringify(row.after ?? {})]
    .join(' ').toLocaleLowerCase();
  function renderChanges(){
    if (!changesLoaded) return;
    const keyword = $('change-entity').value.trim().toLocaleLowerCase();
    const rows = keyword ? changeItems.filter(row => changeSearchText(row).includes(keyword)) : changeItems;
    const target = $('change-rows');
    target.replaceChildren();
    if (!rows.length){
      const tr=document.createElement('tr');const td=document.createElement('td');
      td.colSpan=4;td.className='adm-empty';
      td.textContent=keyword ? 'ไม่พบประวัติที่ตรงกับคำค้นหาในรายการที่โหลดมา' : 'ไม่มีประวัติการเปลี่ยนแปลง';
      tr.append(td);target.append(tr);return;
    }
    for(const item of rows){
      const tr=document.createElement('tr');
      for(const value of [pick(item,['at','changed_at','created_at','timestamp','date','time'],'—'),
        pick(item,['by_name','by','changed_by','actor','user_id','username','admin_id'],'—'),
        pick(item,['action','change_type','operation','entity_type'],'—')]){
        const td=document.createElement('td');td.textContent=String(value);tr.append(td);
      }
      const detail=document.createElement('td');const wrap=document.createElement('div');wrap.className='adm-detail';
      const entity=document.createElement('div');entity.textContent='รายการ: '+String(item.entity_id || '—');
      const reason=document.createElement('div');reason.textContent='เหตุผล: '+String(item.reason || '—');
      const summary=document.createElement('details');const caption=document.createElement('summary');
      caption.textContent='ดูข้อมูลก่อน/หลัง';const pre=document.createElement('pre');
      pre.textContent=JSON.stringify({before:item.before,after:item.after},null,2);
      summary.append(caption,pre);wrap.append(entity,reason,summary);detail.append(wrap);tr.append(detail);target.append(tr);
    }
  }
  async function loadChanges(){
    const sequence=++changesRequestSequence;
    changesLoaded=false;
    $('change-rows').innerHTML='<tr><td colspan="4">กำลังโหลดประวัติ…</td></tr>';
    try {
      // Do NOT pass free-text input to entity_id: that API parameter means an exact audit partition key.
      const data=await api('/admin/changes',{params:{limit:'500'}});
      if (sequence!==changesRequestSequence) return;
      changeItems=arrayOf(data,['changes','logs','items','records','results']);
      changesLoaded=true;renderChanges();
      const total=Number(data?.data?.total);
      const extra=Number.isFinite(total)&&total>changeItems.length ? ` (แสดงจาก ${total} รายการแรกที่ API ส่งกลับมา)` : '';
      notice(`โหลดประวัติแล้ว ${changeItems.length} รายการ${extra} — พิมพ์รหัสวิชาเพื่อค้นหาในรายละเอียดได้`,'success');
    } catch(e){if(sequence!==changesRequestSequence)return;
      $('change-rows').innerHTML='<tr><td colspan="4">โหลดประวัติไม่สำเร็จ</td></tr>';error(e);
    }
  }
  $('change-entity').addEventListener('input',renderChanges);
  $('load-changes').addEventListener('click',loadChanges);
  document.querySelector('[data-tab="changes"]').addEventListener('click',()=>{if(!changesLoaded)loadChanges();});
  // Initial read-only fetch after a real Admin session has passed the guard.
  loadCourses();
})();
