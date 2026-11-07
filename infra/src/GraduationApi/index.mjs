// Lambda: GraduationApi  (V4 — FR4 / FR5 / TC1 / TC2)
// Routes (HTTP API + CognitoJWT authorizer):
//   GET /grad/me                              Student: ผลตรวจการจบของตัวเอง
//   GET /grad/me/records                      Student: ผลการเรียนของตัวเอง
//   GET /grad/students                        Professor (advisees) / Staff, Admin (ทุกคน)
//   GET /grad/students/{student_id}           Professor (advisee เท่านั้น) / Staff, Admin
//   GET /grad/students/{student_id}/records   เหมือนด้านบน
//
// Env: STUDENTS_TABLE, RECORDS_TABLE, RULES_TABLE, SYNC_TABLE, SYNC_SOURCE, CURRENT_TERM, STALE_DAYS

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ENV = {
    STUDENTS: process.env.STUDENTS_TABLE || "Students",
    RECORDS: process.env.RECORDS_TABLE || "StudentRecords",
    RULES: process.env.RULES_TABLE || "GraduationRules",
    SYNC: process.env.SYNC_TABLE || "RegistrarSync",
    SYNC_SOURCE: process.env.SYNC_SOURCE || "registrar_mock",
    CURRENT_TERM: process.env.CURRENT_TERM || "2569/2",
    STALE_DAYS: Number(process.env.STALE_DAYS || 7),
};

// =====================================================================
// 1) GRADUATION ENGINE (pure functions — ไม่แตะ AWS, ทดสอบได้บนเครื่อง)
// =====================================================================
const GRADE_POINTS = { "A": 4, "B+": 3.5, "B": 3, "C+": 2.5, "C": 2, "D+": 1.5, "D": 1, "F": 0 };
const CAT_LABEL = {
    gen_ed: "วิชาศึกษาทั่วไป", core: "วิชาแกน", major_required: "วิชาเฉพาะด้าน (บังคับ)",
    major_elective: "วิชาเอกเลือก / วิชาโท", free_elective: "วิชาเลือกเสรี",
};
const SOURCE_LABEL = {
    test: "ข้อมูลทดสอบ (ไม่ใช่ข้อมูลทางการ)",
    registrar_mock: "ทะเบียนจำลอง (Google Sheet)",
    registrar_file: "ไฟล์จากสำนักทะเบียน",
};

export const termValue = (t) => {
    const [y, s] = String(t || "0/0").split("/").map(Number);
    return y * 10 + s;
};
const round2 = (n) => Math.round(n * 100) / 100;

export const categoryOf = (code, rule) =>
    rule.course_categories?.[code] ||
    (rule.gen_ed_choice_courses?.includes(code) ? "gen_ed" : null) ||
    (rule.major_elective_courses?.includes(code) ? "major_elective" : null) ||
    "free_elective";

// สถานะของแต่ละรายวิชา
export const courseStatus = (rec, currentTerm) => {
    const g = rec.grade;
    if (g === null || g === undefined || g === "") {
        return termValue(rec.term) >= termValue(currentTerm) ? "in_progress" : "missing_grade";
    }
    if (g === "I") return "incomplete_grade";
    if (g === "W") return "withdrawn";
    if (g === "F" || g === "U") return "failed";
    if (g === "S" || g in GRADE_POINTS) return "passed";
    return "missing_grade";
};
const PENDING = new Set(["missing_grade", "incomplete_grade"]); // ข้อมูลไม่ครบ -> ทำให้สรุปไม่ได้

// ใช้ผลครั้งล่าสุดของแต่ละวิชา (กรณีลงซ้ำ)
export const latestAttempts = (records) => {
    const map = new Map();
    for (const r of records) {
        const prev = map.get(r.course_code);
        if (!prev || termValue(r.term) >= termValue(prev.term)) map.set(r.course_code, r);
    }
    return [...map.values()];
};

const gpaOf = (rows) => {
    let pts = 0, cr = 0;
    for (const r of rows) {
        if (r.grade in GRADE_POINTS) { pts += GRADE_POINTS[r.grade] * r.credits; cr += r.credits; }
    }
    return cr ? pts / cr : null;
};

// ผ่าน / ไม่ผ่าน / สรุปไม่ได้ จาก "ได้แล้ว" + "รอผล"
const threeWay = (earned, pending, required) =>
    earned >= required ? "pass" : (earned + pending >= required ? "unknown" : "fail");

export function evaluate({ student, records, rule, currentTerm }) {
    const rows = latestAttempts(records).map((r) => ({
        ...r,
        credits: Number(r.credits) || 0,
        category: categoryOf(r.course_code, rule),
        status: courseStatus(r, currentTerm),
    }));

    const sum = (pred) => rows.filter(pred).reduce((s, r) => s + r.credits, 0);
    const passed = (r) => r.status === "passed";
    const pending = (r) => PENDING.has(r.status);

    const earnedTotal = sum(passed);
    const pendingTotal = sum(pending);
    const checks = [];
    const missingItems = [];
    const catGaps = [];

    // --- หน่วยกิตรวม ---
    const tStatus = threeWay(earnedTotal, pendingTotal, rule.min_total_credits);
    checks.push({
        id: "total_credits", label_th: "หน่วยกิตรวม", status: tStatus,
        required: rule.min_total_credits, earned: earnedTotal, pending: pendingTotal,
        detail_th: tStatus === "pass" ? `ได้ ${earnedTotal} จาก ${rule.min_total_credits} หน่วยกิต`
            : tStatus === "unknown" ? `ได้ ${earnedTotal} หน่วยกิต + รอผลอีก ${pendingTotal} หน่วยกิต — ถ้าผ่านทั้งหมดจะครบ ${rule.min_total_credits}`
            : `ได้ ${earnedTotal} จาก ${rule.min_total_credits} หน่วยกิต ขาดอีก ${rule.min_total_credits - earnedTotal - pendingTotal} หน่วยกิต`,
    });

    // --- รายหมวด ---
    for (const c of rule.categories || []) {
        const e = sum((r) => r.category === c.id && passed(r));
        const p = sum((r) => r.category === c.id && pending(r));
        const st = threeWay(e, p, c.min_credits);
        const gap = c.min_credits - e - p;
        const pendingCodes = rows.filter((r) => r.category === c.id && pending(r)).map((r) => r.course_code);
        checks.push({
            id: c.id, label_th: c.label_th || CAT_LABEL[c.id] || c.id, status: st,
            required: c.min_credits, earned: e, pending: p,
            detail_th: st === "pass" ? "ครบแล้ว" : st === "unknown" ? `รอผล ${pendingCodes.join(", ")} (${p} หน่วยกิต)` : `ขาดอีก ${gap} หน่วยกิต`,
        });
        if (st === "fail") catGaps.push({ id: c.id, label: c.label_th || CAT_LABEL[c.id], gap });
    }

    // --- วิชาบังคับ ---
    const byCode = new Map(rows.map((r) => [r.course_code, r]));
    const notPassed = (rule.required_courses || []).filter((code) => byCode.get(code)?.status !== "passed");
    const reqPending = notPassed.filter((code) => pending(byCode.get(code) || {}));
    const reqFail = notPassed.filter((code) => !reqPending.includes(code));
    const describe = (code) => {
        const r = byCode.get(code);
        const why = !r ? "ยังไม่ได้ลงทะเบียน" : r.status === "withdrawn" ? "ถอน (W)" : r.status === "failed" ? `ได้ ${r.grade}` : r.status === "in_progress" ? "กำลังเรียน" : "รอผล";
        return { course_code: code, title_en: rule.course_titles?.[code] || r?.title_en || "", reason_th: why };
    };
    const reqStatus = reqFail.length ? "fail" : reqPending.length ? "unknown" : "pass";
    checks.push({
        id: "required_courses", label_th: "วิชาบังคับตามแผน", status: reqStatus,
        detail_th: reqStatus === "pass" ? "ผ่านครบทุกวิชา"
            : reqStatus === "unknown" ? `รอผล ${reqPending.length} วิชา: ${reqPending.join(", ")}`
            : `ยังไม่ผ่าน ${reqFail.length} วิชา` + (reqPending.length ? ` และรอผลอีก ${reqPending.length} วิชา` : ""),
        missing: notPassed.map(describe),
    });
    // สรุป "สิ่งที่ยังขาด" ให้เหลือเฉพาะต้นเหตุ (ไม่นับซ้ำ)
    //  - วิชาบังคับที่ยังไม่ผ่าน = 1 ข้อ/วิชา
    //  - หน่วยกิตรายหมวดที่ยังขาด "หลังหักวิชาบังคับข้างบน" = 1 ข้อ/หมวด
    //  - หน่วยกิตรวมขาด แสดงเมื่อไม่มีข้ออื่นอธิบาย
    for (const code of reqFail) {
        const d = describe(code);
        missingItems.push(`ยังไม่ผ่านวิชาบังคับ ${code} ${d.title_en} (${d.reason_th})`);
    }
    const reqFailCredits = (catId) => reqFail
        .filter((code) => categoryOf(code, rule) === catId)
        .reduce((s, code) => s + (Number(byCode.get(code)?.credits) || 3), 0);
    for (const g of catGaps) {
        const rest = g.gap - reqFailCredits(g.id);
        if (rest > 0) missingItems.push(`ขาดหน่วยกิต${g.label}อีก ${rest} หน่วยกิต`);
    }
    if (tStatus === "fail" && missingItems.length === 0) {
        missingItems.push(`หน่วยกิตรวมยังขาดอีก ${rule.min_total_credits - earnedTotal - pendingTotal} หน่วยกิต`);
    }

    // --- GPA (คิดกรณีแย่สุด/ดีสุดของวิชาที่รอผล) ---
    const graded = rows.filter((r) => r.grade in GRADE_POINTS);
    const gpaNow = gpaOf(graded);
    const pendingGpaRows = rows.filter((r) => pending(r));
    const worst = gpaOf([...graded, ...pendingGpaRows.map((r) => ({ ...r, grade: "F" }))]);
    const best = gpaOf([...graded, ...pendingGpaRows.map((r) => ({ ...r, grade: "A" }))]);
    const minGpa = rule.min_gpa ?? 2.0;
    let gStatus = "fail";
    if (gpaNow === null && !pendingGpaRows.length) gStatus = "fail";
    else if ((worst ?? 0) >= minGpa) gStatus = "pass";
    else if ((best ?? 0) >= minGpa) gStatus = pendingGpaRows.length ? "unknown" : "fail";
    checks.push({
        id: "gpa", label_th: "เกรดเฉลี่ยสะสม (GPA)", status: gStatus,
        required: minGpa, earned: gpaNow === null ? null : round2(gpaNow),
        detail_th: `${gpaNow === null ? "-" : round2(gpaNow).toFixed(2)} (ขั้นต่ำ ${minGpa.toFixed(2)})` +
            (gStatus === "unknown" ? " — อาจเปลี่ยนเมื่อได้เกรดที่รอผล" : ""),
    });
    if (gStatus === "fail") missingItems.push(`เกรดเฉลี่ยสะสมต่ำกว่า ${minGpa.toFixed(2)}`);

    // --- โครงงาน / สหกิจ ---
    const proj = rule.project_or_coop_courses || [];
    if (proj.length) {
        const pNot = proj.filter((c) => byCode.get(c)?.status !== "passed");
        const pPend = pNot.filter((c) => pending(byCode.get(c) || {}));
        const pst = pNot.length === 0 ? "pass" : pNot.length === pPend.length ? "unknown" : "fail";
        checks.push({
            id: "project_or_coop", label_th: "โครงงานพิเศษ / สหกิจศึกษา", status: pst,
            detail_th: pst === "pass" ? `ผ่าน ${proj.join(" และ ")}` : pst === "unknown" ? `รอผล ${pPend.join(", ")}` : `ยังไม่ผ่าน ${pNot.join(", ")}`,
            missing: pNot.map(describe),
        });
    }

    // --- สรุป ---
    const overall = checks.some((c) => c.status === "fail") ? "not_eligible"
        : checks.some((c) => c.status === "unknown") ? "unknown" : "eligible";
    const incomplete = rows.filter(pending).map((r) => ({
        term: r.term, course_code: r.course_code,
        reason_th: r.status === "incomplete_grade" ? "ได้เกรด I (ยังไม่สมบูรณ์)" : "ยังไม่มีเกรดจากทะเบียน",
    }));

    return {
        overall,
        overall_label_th: {
            eligible: "ครบเงื่อนไขสำเร็จการศึกษา",
            not_eligible: "ยังไม่ครบเงื่อนไขสำเร็จการศึกษา",
            unknown: "ยังสรุปไม่ได้ — ข้อมูลจากทะเบียนยังไม่ครบ",
        }[overall],
        summary: {
            credits_earned: earnedTotal, credits_pending: pendingTotal, credits_required: rule.min_total_credits,
            credits_in_progress: sum((r) => r.status === "in_progress"),
            gpa: gpaNow === null ? null : round2(gpaNow), gpa_required: minGpa,
        },
        checks,
        missing_items_th: missingItems,
        incomplete_data: incomplete,
        rules_version: rule.version ?? 1,
        _rows: rows, // ใช้ภายใน (records endpoint) — ถูกลบก่อนส่งออก
    };
}

export function groupRecords(rows) {
    const terms = new Map();
    for (const r of [...rows].sort((a, b) => termValue(a.term) - termValue(b.term) || a.course_code.localeCompare(b.course_code))) {
        if (!terms.has(r.term)) terms.set(r.term, []);
        terms.get(r.term).push({
            course_code: r.course_code, title_en: r.title_en || "", credits: r.credits, grade: r.grade ?? null,
            category: r.category, category_label_th: CAT_LABEL[r.category] || r.category, status: r.status,
        });
    }
    return [...terms.entries()].map(([term, courses]) => {
        const g = gpaOf(courses);
        return { term, credits: courses.reduce((s, c) => s + c.credits, 0), gpa_term: g === null ? null : round2(g), courses };
    });
}

// ข้อมูลแหล่งที่มา + ความสด (แถบความสดของข้อมูลในหน้าเว็บ)
export function dataInfo({ student, syncItems, incompleteCount, now = new Date() }) {
    const latest = syncItems[0] || null;
    const lastOk = syncItems.find((s) => s.status === "success") || null;
    const asOf = lastOk?.at || student.updated_at || null;
    let status = "ok";
    const warnings = [];
    if (latest && latest.status !== "success") {
        status = "failed";
        warnings.push({ code: "SYNC_FAILED", message_th: `ดึงข้อมูลจากทะเบียนรอบล่าสุด (${fmtTh(latest.at)}) ไม่สำเร็จ แสดงข้อมูล ณ ${fmtTh(asOf)}` });
    } else if (asOf && (now - new Date(asOf)) / 86400000 > ENV.STALE_DAYS) {
        status = "stale";
        warnings.push({ code: "STALE", message_th: `ข้อมูลจากทะเบียนเก่ากว่า ${ENV.STALE_DAYS} วัน (ล่าสุด ${fmtTh(asOf)})` });
    }
    if (incompleteCount) {
        warnings.push({ code: "INCOMPLETE_RECORDS", message_th: `ยังไม่มีผลการเรียนจากทะเบียน ${incompleteCount} รายวิชา ผลบางข้อจึงยังสรุปไม่ได้` });
    }
    const source = student.source || "test";
    return {
        source, source_label_th: SOURCE_LABEL[source] || source,
        data_as_of: asOf, sync_status: status, last_sync_attempt_at: latest?.at || null, warnings,
    };
}
const fmtTh = (iso) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// =====================================================================
// 2) DATA ACCESS
// =====================================================================
const queryAll = async (params) => {
    const out = [];
    let ExclusiveStartKey;
    do {
        const r = await db.send(new QueryCommand({ ...params, ExclusiveStartKey }));
        out.push(...(r.Items || []));
        ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
};
const scanAll = async (TableName) => {
    const out = [];
    let ExclusiveStartKey;
    do {
        const r = await db.send(new ScanCommand({ TableName, ExclusiveStartKey }));
        out.push(...(r.Items || []));
        ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
};

const getStudent = async (id) => (await db.send(new GetCommand({ TableName: ENV.STUDENTS, Key: { student_id: id } }))).Item || null;
const getRecords = (id) => queryAll({ TableName: ENV.RECORDS, KeyConditionExpression: "student_id = :s", ExpressionAttributeValues: { ":s": id } });

// แคชเงื่อนไขการจบสั้น ๆ (ค่าเริ่มต้น 10 วินาที) — แอดมินแก้เงื่อนไขแล้วมีผลภายใน RULE_CACHE_MS
const RULE_CACHE_MS = Number(process.env.RULE_CACHE_MS ?? 10000);
const ruleCache = new Map(); // study_plan_id -> { rule, at }
const getRule = async (planId) => {
    const hit = ruleCache.get(planId);
    if (hit && Date.now() - hit.at < RULE_CACHE_MS) return hit.rule;
    const rule = (await db.send(new GetCommand({ TableName: ENV.RULES, Key: { study_plan_id: planId } }))).Item || null;
    if (rule) ruleCache.set(planId, { rule, at: Date.now() });
    return rule;
};

let syncCache = null;
const getSyncItems = async () => {
    if (syncCache && Date.now() - syncCache.at < 30000) return syncCache.items;
    let items = [];
    try {
        const r = await db.send(new QueryCommand({
            TableName: ENV.SYNC, KeyConditionExpression: "#s = :s", ExpressionAttributeNames: { "#s": "source" },
            ExpressionAttributeValues: { ":s": ENV.SYNC_SOURCE }, ScanIndexForward: false, Limit: 20,
        }));
        items = r.Items || [];
    } catch (e) {
        console.warn("sync status unavailable:", e.name);
    }
    syncCache = { items, at: Date.now() };
    return items;
};

async function buildCheck(student) {
    const [records, rule, syncItems] = await Promise.all([getRecords(student.student_id), getRule(student.study_plan_id), getSyncItems()]);
    if (!rule) throw httpError(500, `ไม่พบเงื่อนไขการจบของแผน ${student.study_plan_id}`);
    const result = evaluate({ student, records, rule, currentTerm: ENV.CURRENT_TERM });
    const data = dataInfo({ student, syncItems, incompleteCount: result.incomplete_data.length });
    return { result, rule, data };
}

const studentInfo = (s, rule) => ({
    student_id: s.student_id, student_code: s.student_code, name: s.name,
    curriculum_year: s.curriculum_year, study_plan_id: s.study_plan_id,
    plan_name_th: rule?.plan_name_th || "", advisor: s.advisor_username ? { username: s.advisor_username } : null,
});

// =====================================================================
// 3) AUTHORIZATION
// =====================================================================
const getClaims = (event) => event.requestContext?.authorizer?.jwt?.claims || null;
const getGroups = (claims) => {
    const raw = claims?.["cognito:groups"];
    if (Array.isArray(raw)) return raw;
    return String(raw || "").replace(/[[\]]/g, "").split(/[\s,]+/).filter(Boolean);
};
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ใครดูนักศึกษาคนไหนได้
export function canView({ username, groups }, student) {
    if (groups.includes("Admin") || groups.includes("Staff")) return true;
    if (groups.includes("Professor") && student.advisor_username === username) return true;
    if (student.student_id === username) return true;
    return false;
}

// =====================================================================
// 4) HANDLER
// =====================================================================
export const handler = async (event) => {
    try {
        const method = event.requestContext?.http?.method || "GET";
        if (method === "OPTIONS") return respond(200, {});

        const claims = getClaims(event);
        if (!claims) return fail(401, "UNAUTHORIZED", "ต้องเข้าสู่ระบบก่อน");
        const user = { username: claims["cognito:username"] || claims.username, groups: getGroups(claims) };

        const route = event.routeKey || `${method} ${event.rawPath || ""}`;
        const sid = event.pathParameters?.student_id ? decodeURIComponent(event.pathParameters.student_id) : null;
        const q = event.queryStringParameters || {};

        // ---------- /grad/me ----------
        if (route.endsWith(" /grad/me") || route.endsWith(" /grad/me/records")) {
            const s = await getStudent(user.username);
            if (!s) return fail(404, "NOT_FOUND", "ไม่พบข้อมูลผลการเรียนของคุณในระบบ (อาจยังไม่ได้รับข้อมูลจากทะเบียน)");
            return route.endsWith("/records") ? recordsResponse(s, "grad_me_records") : checkResponse(s, "grad_me");
        }

        // ---------- /grad/students ----------
        if (route.endsWith(" /grad/students")) {
            const isStaff = user.groups.includes("Admin") || user.groups.includes("Staff");
            const isProf = user.groups.includes("Professor");
            if (!isStaff && !isProf) return fail(403, "FORBIDDEN", "เฉพาะอาจารย์และเจ้าหน้าที่เท่านั้น");

            let students = isStaff
                ? await scanAll(ENV.STUDENTS)
                : await queryAll({ TableName: ENV.STUDENTS, IndexName: "advisor-index",
                    KeyConditionExpression: "advisor_username = :u", ExpressionAttributeValues: { ":u": user.username } });

            if (q.curriculum_year) students = students.filter((s) => s.curriculum_year === q.curriculum_year);
            if (q.q) {
                const kw = q.q.toLowerCase();
                students = students.filter((s) => `${s.name} ${s.student_code} ${s.student_id}`.toLowerCase().includes(kw));
            }

            const rows = await Promise.all(students.map(async (s) => {
                const { result } = await buildCheck(s);
                const inc = result.incomplete_data;
                return {
                    student_id: s.student_id, student_code: s.student_code, name: s.name,
                    curriculum_year: s.curriculum_year, study_plan_id: s.study_plan_id,
                    overall: result.overall, credits_earned: result.summary.credits_earned,
                    credits_required: result.summary.credits_required, gpa: result.summary.gpa,
                    has_incomplete_data: inc.length > 0,
                    incomplete_summary_th: inc.length ? summarizeIncomplete(inc) : null,
                };
            }));
            const filtered = (q.status ? rows.filter((r) => r.overall === q.status) : rows)
                .sort((a, b) => String(a.student_code).localeCompare(String(b.student_code)));
            const data = dataInfo({ student: {}, syncItems: await getSyncItems(), incompleteCount: 0 });
            return ok("grad_students", { scope: isStaff ? "all" : "advisees", students: filtered, total: filtered.length, data });
        }

        // ---------- /grad/students/{id}[/records] ----------
        if (sid && route.includes("/grad/students/")) {
            const s = await getStudent(sid);
            if (!s) return fail(404, "NOT_FOUND", `ไม่พบนักศึกษา ${sid}`);
            if (!canView(user, s)) return fail(403, "FORBIDDEN", "คุณไม่มีสิทธิ์ดูข้อมูลของนักศึกษาคนนี้ (ไม่ใช่นักศึกษาในความดูแล)");
            return route.endsWith("/records") ? recordsResponse(s, "grad_student_records") : checkResponse(s, "grad_student");
        }

        return fail(404, "NOT_FOUND", `Unknown route: ${route}`);
    } catch (e) {
        console.error("GraduationApi error:", e);
        return fail(e.status || 500, e.status === 404 ? "NOT_FOUND" : "SERVER_ERROR", e.status ? e.message : "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง");
    }
};

async function checkResponse(s, resource) {
    const { result, rule, data } = await buildCheck(s);
    const { _rows, ...rest } = result;
    return ok(resource, { student: studentInfo(s, rule), ...rest, data, computed_at: new Date().toISOString() });
}

async function recordsResponse(s, resource) {
    const { result, rule, data } = await buildCheck(s);
    return ok(resource, {
        student: { student_id: s.student_id, student_code: s.student_code, name: s.name, plan_name_th: rule.plan_name_th },
        terms: groupRecords(result._rows), data,
    });
}

const summarizeIncomplete = (inc) => {
    const byTerm = {};
    for (const i of inc) byTerm[i.term] = (byTerm[i.term] || 0) + 1;
    const hasI = inc.some((i) => i.reason_th.includes("เกรด I"));
    return Object.entries(byTerm).map(([t, n]) => `ภาค ${t} ยังไม่มีผล ${n} วิชา`).join(", ") + (hasI ? " (มีเกรด I)" : "");
};

// =====================================================================
// 5) RESPONSE
// =====================================================================
const HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
const respond = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });
const ok = (resource, data) => respond(200, { success: true, resource, data, meta: { generated_at: new Date().toISOString() } });
const fail = (status, code, message) => respond(status, { success: false, error: { code, message } });
