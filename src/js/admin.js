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
    if(!res.ok) {const description = typeof data === 'object' ? (data?.message || data?.error || '') : String(data || ''); throw new Error(`API ${res.status}: ${description || (res.status === 403 ? 'ไม่มีสิทธิ์เข้าถึง' : 'ไม่สามารถดำเนินการได้')}`);}
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
  function updatePrereqDraft() {
    const vals = $('pre-list').value.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean);
    const op = $('pre-op').value, condition = $('pre-condition').value, grade = $('pre-grade').value;
    const items = vals.map(course => condition === 'min_grade' ? {course,condition,grade} : {course,condition});
    $('pre-json').value = JSON.stringify({prerequisite:{op,items}},null,2);
    $('pre-grade').disabled = condition !== 'min_grade';
  }
  ['pre-list','pre-op','pre-condition','pre-grade'].forEach(id => $(id).addEventListener('change',updatePrereqDraft));
  $('pre-list').addEventListener('input',updatePrereqDraft);
  updatePrereqDraft();
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
  $('prereq-form').addEventListener('submit',async ev=>{ev.preventDefault();try {updatePrereqDraft();notice('เตรียมเงื่อนไขเรียบร้อยแล้ว แต่ยังไม่ส่งบันทึก: รอยืนยัน Request Body จาก Backend','error');}catch(e){error(e);}});
  $('load-rules').addEventListener('click',async()=>{
    const id=$('rule-plan').value.trim();if(!id){notice('กรุณาระบุ Study Plan ID','error');return;}
    try{const data=await api(`/admin/graduation-rules/${encoded(id)}`);$('rules-json').value=JSON.stringify(data,null,2);const view=$('rules-display');view.replaceChildren();view.hidden=false;const render=(value,depth=0)=>{if (depth>4)return document.createTextNode('รายละเอียดเพิ่มเติม');if(value===null||typeof value!=='object')return document.createTextNode(String(value));const box=document.createElement('div');box.className='adm-rule-group';Object.entries(value).forEach(([key,val])=>{const row=document.createElement('div');row.className='adm-rule-row';const label=document.createElement('strong');label.textContent=key;row.append(label,render(val,depth+1));box.append(row);});return box;};view.append(render(data));notice('โหลดเงื่อนไขการจบสำเร็จ','success');}catch(e){error(e);}
  });
  $('rules-form').addEventListener('submit',async ev=>{ev.preventDefault();try{const id=$('rule-plan').value.trim();if(!id)throw new Error('กรุณากรอก Study Plan ID');await save('PUT',`/admin/graduation-rules/${encoded(id)}`,parseBody('rules-json'));}catch(e){error(e);}});
  async function loadChanges(){
    $('change-rows').innerHTML='<tr><td colspan="4">กำลังโหลดประวัติ…</td></tr>';
    try {const data=await api('/admin/changes',{params:{entity_id:$('change-entity').value.trim()}});const rows=arrayOf(data,['changes','logs','items','records','results']);
      $('change-rows').innerHTML=rows.length?rows.map(c=>`<tr><td>${safe(pick(c,['changed_at','created_at','timestamp','date','time'],'—'))}</td><td>${safe(pick(c,['changed_by','actor','user_id','username','admin_id'],'—'))}</td><td>${safe(pick(c,['action','change_type','operation','entity_type'],'—'))}</td><td><div class="adm-detail">${safe(JSON.stringify(c,null,2))}</div></td></tr>`).join(''):'<tr><td colspan="4" class="adm-empty">ไม่มีประวัติการเปลี่ยนแปลงที่แสดงได้</td></tr>';
      notice(`โหลดประวัติแล้ว ${rows.length} รายการ`,'success');
    } catch(e){$('change-rows').innerHTML='<tr><td colspan="4">โหลดประวัติไม่สำเร็จ</td></tr>';error(e);}
  }
  $('load-changes').addEventListener('click',loadChanges);
  // Initial read-only fetch after a real Admin session has passed the guard.
  loadCourses();
})();
