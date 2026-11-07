// Lambda: RegistrarApi  (V4 — FR6 / TC2)
// รับข้อมูลผลการเรียนจากทะเบียน 2 ช่องทาง + บันทึกสถานะทุกรอบ
//   1) Sync อัตโนมัติ/สั่งเอง  : ดึงจากทะเบียนจำลอง (Google Apps Script) → แทนที่ snapshot ของนักศึกษาที่อยู่ในข้อมูล
//   2) อัปโหลด CSV (สำรอง)    : เจ้าหน้าที่อัปโหลดไฟล์จากทะเบียน → แทนที่ผลของ (นักศึกษา, ภาค) ที่อยู่ในไฟล์
// หลักการ: ถ้าดึง/ตรวจไม่ผ่าน → ไม่แตะข้อมูลเดิมเลย และบันทึกว่า failed (หน้าเว็บจะขึ้นแถบเตือน)
//
// Routes (HTTP API + CognitoJWT):
//   GET  /registrar/status   Professor, Staff, Admin
//   POST /registrar/sync     Staff, Admin
//   POST /registrar/upload   Staff, Admin     body: { "filename": "...", "csv": "..." }
// EventBridge (schedule) → sync อัตโนมัติ
//
// Env: GAS_URL, REGISTRAR_KEY, SIMULATE (none|fail|slow), FETCH_TIMEOUT_MS,
//      STUDENTS_TABLE, RECORDS_TABLE, SYNC_TABLE, SYNC_SOURCE, CURRENT_TERM, STALE_DAYS

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ENV = {
    GAS_URL: process.env.GAS_URL || "",
    KEY: process.env.REGISTRAR_KEY || "",
    SIMULATE: (process.env.SIMULATE || "none").toLowerCase(),
    TIMEOUT: Number(process.env.FETCH_TIMEOUT_MS || 10000),
    STUDENTS: process.env.STUDENTS_TABLE || "Students",
    RECORDS: process.env.RECORDS_TABLE || "StudentRecords",
    SYNC: process.env.SYNC_TABLE || "RegistrarSync",
    SOURCE: process.env.SYNC_SOURCE || "registrar",
    CURRENT_TERM: process.env.CURRENT_TERM || "2569/2",
    STALE_DAYS: Number(process.env.STALE_DAYS || 7),
};

// =====================================================================
// 1) VALIDATION (pure — ทดสอบบนเครื่องได้)
// =====================================================================
const GRADES = new Set(["A", "B+", "B", "C+", "C", "D+", "D", "F", "W", "I", "S", "U"]);
const RE_TERM = /^\d{4}\/[123]$/;
const RE_COURSE = /^[A-Z]{2,5}\d{3}$/;

export const normCourse = (c) => String(c ?? "").replace(/\s+/g, "").toUpperCase();
export const normGrade = (g) => {
    const v = String(g ?? "").trim().toUpperCase();
    return v === "" ? null : v;
};
export const termValue = (t) => {
    const [y, s] = String(t || "0/0").split("/").map(Number);
    return y * 10 + s;
};

// ตรวจผลการเรียน 1 แถว — คืน { row } หรือ { error }
export function validateGrade(raw, codeToId) {
    const code = String(raw.student_code ?? "").trim();
    const term = String(raw.term ?? "").trim();
    const course = normCourse(raw.course_code);
    const credits = Number(raw.credits);
    const grade = normGrade(raw.grade);
    if (!codeToId.has(code)) return { error: `ไม่พบรหัสนักศึกษา ${code || "(ว่าง)"}` };
    if (!RE_TERM.test(term)) return { error: `ภาค '${term}' ไม่ถูกต้อง (ต้องเป็นแบบ 2569/1)` };
    if (!RE_COURSE.test(course)) return { error: `รหัสวิชา '${raw.course_code ?? ""}' ไม่ถูกต้อง` };
    if (!Number.isInteger(credits) || credits < 0 || credits > 12) return { error: `หน่วยกิต '${raw.credits ?? ""}' ไม่ถูกต้อง` };
    if (grade !== null && !GRADES.has(grade)) return { error: `เกรด '${raw.grade}' ไม่ถูกต้อง` };
    return {
        row: {
            student_id: codeToId.get(code), record_key: `${term}#${course}`, term, course_code: course,
            title_en: raw.title_en ? String(raw.title_en).trim() : "", credits, grade,
        },
    };
}

export function validateStudent(raw) {
    const code = String(raw.student_code ?? "").trim();
    const username = String(raw.username ?? "").trim() || code;
    const year = String(raw.curriculum_year ?? "").trim();
    const plan = String(raw.study_plan_id ?? "").trim();
    if (!code) return { error: "student_code ว่าง" };
    if (!/^\d{4}$/.test(year)) return { error: `curriculum_year '${year}' ไม่ถูกต้อง (${code})` };
    if (!plan) return { error: `study_plan_id ว่าง (${code})` };
    return {
        row: {
            student_id: username, student_code: code, name: String(raw.name ?? "").trim() || code,
            curriculum_year: year, study_plan_id: plan,
            admit_year: /^\d{4}$/.test(String(raw.admit_year ?? "")) ? Number(raw.admit_year) : undefined,
            advisor_username: String(raw.advisor_username ?? "").trim() || undefined,
        },
    };
}

// CSV แบบง่าย (รองรับ "..." ที่มี , ข้างใน)
export function parseCsv(text) {
    const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
    const split = (line) => {
        const out = []; let cur = ""; let q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (q) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') q = false;
                else cur += ch;
            } else if (ch === '"') q = true;
            else if (ch === ",") { out.push(cur); cur = ""; }
            else cur += ch;
        }
        out.push(cur);
        return out.map((s) => s.trim());
    };
    const header = split(lines.shift() || "").map((h) => h.toLowerCase());
    const rows = [];
    lines.forEach((l, i) => {
        if (!l.trim()) return;
        const cells = split(l);
        const o = { __line: i + 2 };
        header.forEach((h, j) => { o[h] = cells[j] ?? ""; });
        rows.push(o);
    });
    return { header, rows };
}

// =====================================================================
// 2) DATA ACCESS
// =====================================================================
const scanAll = async (TableName, extra = {}) => {
    const out = []; let ExclusiveStartKey;
    do {
        const r = await db.send(new ScanCommand({ TableName, ExclusiveStartKey, ...extra }));
        out.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
};
const queryKeys = async (studentId) => {
    const out = []; let ExclusiveStartKey;
    do {
        const r = await db.send(new QueryCommand({
            TableName: ENV.RECORDS, KeyConditionExpression: "student_id = :s",
            ExpressionAttributeValues: { ":s": studentId }, ProjectionExpression: "student_id, record_key, term",
            ExclusiveStartKey,
        }));
        out.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
};
async function batchWrite(table, requests) {
    for (let i = 0; i < requests.length; i += 25) {
        let items = { [table]: requests.slice(i, i + 25) };
        for (let attempt = 0; attempt < 5 && items[table]?.length; attempt++) {
            const r = await db.send(new BatchWriteCommand({ RequestItems: items }));
            items = r.UnprocessedItems || {};
            if (items[table]?.length) await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
        }
        if (items[table]?.length) throw new Error(`BatchWrite ไม่สำเร็จ ${items[table].length} รายการ`);
    }
}
const logSync = (entry) => db.send(new PutCommand({
    TableName: ENV.SYNC,
    Item: { source: ENV.SOURCE, at: new Date().toISOString(), ...entry },
}));

// แทนที่ผลการเรียน: เฉพาะ (นักศึกษา, ภาค) ที่ระบุใน scope — ลบแถวเก่าที่ไม่มีในข้อมูลใหม่ แล้วเขียนแถวใหม่
async function replaceRecords(newRows, scope, source, now) {
    const byStudent = new Map();
    for (const r of newRows) {
        if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
        byStudent.get(r.student_id).push(r);
    }
    const studentsInScope = new Set([...scope.keys()]);
    const deletes = [];
    for (const sid of studentsInScope) {
        const terms = scope.get(sid);            // null = ทุกภาค
        const keep = new Set((byStudent.get(sid) || []).map((r) => r.record_key));
        for (const old of await queryKeys(sid)) {
            if ((terms === null || terms.has(old.term)) && !keep.has(old.record_key)) {
                deletes.push({ DeleteRequest: { Key: { student_id: sid, record_key: old.record_key } } });
            }
        }
    }
    const puts = newRows.map((r) => ({ PutRequest: { Item: { ...r, source, imported_at: now } } }));
    await batchWrite(ENV.RECORDS, [...deletes, ...puts]);
    return { deleted: deletes.length, written: puts.length };
}

// =====================================================================
// 3) SYNC จากทะเบียนจำลอง
// =====================================================================
async function fetchRegistrar() {
    if (!ENV.GAS_URL) throw new Error("ยังไม่ได้ตั้งค่า GAS_URL");
    const url = new URL(ENV.GAS_URL);
    if (ENV.KEY) url.searchParams.set("key", ENV.KEY);
    if (ENV.SIMULATE !== "none") url.searchParams.set("simulate", ENV.SIMULATE);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ENV.TIMEOUT);
    try {
        const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
        if (!res.ok) throw new Error(`ระบบทะเบียนตอบ HTTP ${res.status}`);
        const body = await res.json().catch(() => { throw new Error("ระบบทะเบียนตอบกลับไม่ใช่ JSON"); });
        if (!body.ok) throw new Error(`ระบบทะเบียนแจ้งข้อผิดพลาด: ${body.error || "unknown"}`);
        return body;
    } catch (e) {
        if (e.name === "AbortError") throw new Error(`เชื่อมต่อระบบทะเบียนไม่ได้ (timeout ${ENV.TIMEOUT / 1000} วินาที)`);
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

export async function runSync(trigger) {
    const started = Date.now();
    try {
        const payload = await fetchRegistrar();

        // ตรวจทั้งชุดก่อน — มีข้อผิดพลาดแม้แถวเดียว ไม่นำเข้าเลย
        const errors = [];
        const students = [];
        (payload.students || []).forEach((raw, i) => {
            const v = validateStudent(raw);
            v.error ? errors.push({ line: i + 2, sheet: "students", message_th: v.error }) : students.push(v.row);
        });
        const codeToId = new Map(students.map((s) => [s.student_code, s.student_id]));
        const grades = [];
        (payload.grades || []).forEach((raw, i) => {
            const v = validateGrade(raw, codeToId);
            v.error ? errors.push({ line: i + 2, sheet: "grades", message_th: v.error }) : grades.push(v.row);
        });
        if (!students.length) errors.push({ line: 0, sheet: "students", message_th: "ไม่มีข้อมูลนักศึกษา" });
        if (errors.length) {
            const msg = `ข้อมูลจากทะเบียนไม่ถูกต้อง ${errors.length} รายการ — ไม่ได้นำเข้า ใช้ข้อมูลเดิม`;
            await logSync({ status: "failed", channel: "sheet", trigger, message_th: msg, errors: errors.slice(0, 20) });
            return { status: "failed", rows: 0, message_th: msg, errors: errors.slice(0, 20) };
        }

        const now = new Date().toISOString();
        await batchWrite(ENV.STUDENTS, students.map((s) => ({
            PutRequest: { Item: Object.fromEntries(Object.entries({ ...s, source: "registrar_mock", updated_at: now }).filter(([, v]) => v !== undefined)) },
        })));
        const scope = new Map(students.map((s) => [s.student_id, null])); // แทนที่ทุกภาคของนักศึกษาที่อยู่ในชุดข้อมูล
        const res = await replaceRecords(grades, scope, "registrar_mock", now);

        const msg = `นำเข้า ${grades.length} รายการ (${students.length} คน)`;
        await logSync({ status: "success", channel: "sheet", trigger, rows: grades.length, students: students.length,
            deleted: res.deleted, registrar_generated_at: payload.generated_at || null, duration_ms: Date.now() - started, message_th: msg });
        return { status: "success", rows: grades.length, students: students.length, message_th: msg };
    } catch (e) {
        console.error("sync failed:", e);
        const msg = `${e.message} — ใช้ข้อมูลเดิม`;
        await logSync({ status: "failed", channel: "sheet", trigger, message_th: msg, duration_ms: Date.now() - started });
        return { status: "failed", rows: 0, message_th: msg };
    }
}

// =====================================================================
// 4) UPLOAD CSV (ช่องทางสำรอง)
// =====================================================================
export async function runUpload({ filename, csv }, user) {
    const REQUIRED = ["student_code", "term", "course_code", "credits", "grade"];
    const { header, rows } = parseCsv(csv);
    const missingCols = REQUIRED.filter((c) => !header.includes(c));
    if (missingCols.length) {
        return { status: 400, body: { message: `ไฟล์ไม่มีคอลัมน์: ${missingCols.join(", ")}`,
            errors: [{ line: 1, message_th: `ต้องมีคอลัมน์ ${REQUIRED.join(",")}` }] } };
    }
    if (!rows.length) return { status: 400, body: { message: "ไฟล์ไม่มีข้อมูล", errors: [] } };

    const students = await scanAll(ENV.STUDENTS, { ProjectionExpression: "student_id, student_code" });
    const codeToId = new Map(students.map((s) => [String(s.student_code), s.student_id]));

    const errors = [];
    const good = [];
    const seen = new Set();
    for (const raw of rows) {
        const v = validateGrade(raw, codeToId);
        if (v.error) { errors.push({ line: raw.__line, message_th: v.error }); continue; }
        const k = `${v.row.student_id}|${v.row.record_key}`;
        if (seen.has(k)) { errors.push({ line: raw.__line, message_th: `ข้อมูลซ้ำ ${raw.student_code} ${v.row.record_key}` }); continue; }
        seen.add(k);
        good.push(v.row);
    }
    const now = new Date().toISOString();
    if (errors.length) {
        const msg = `ไฟล์ ${filename || ""} มีข้อผิดพลาด ${errors.length} บรรทัด — ไม่ได้นำเข้า`;
        await logSync({ status: "failed", channel: "upload", trigger: `upload:${user}`, filename, message_th: msg, errors: errors.slice(0, 20) });
        return { status: 400, body: { message: msg, errors: errors.slice(0, 50) } };
    }

    // แทนที่เฉพาะ (นักศึกษา, ภาค) ที่อยู่ในไฟล์
    const scope = new Map();
    for (const r of good) {
        if (!scope.has(r.student_id)) scope.set(r.student_id, new Set());
        scope.get(r.student_id).add(r.term);
    }
    await replaceRecords(good, scope, "registrar_file", now);
    const msg = `นำเข้าไฟล์ ${filename || ""} ${good.length} รายการ (${scope.size} คน)`;
    await logSync({ status: "success", channel: "upload", trigger: `upload:${user}`, filename, rows: good.length, students: scope.size, message_th: msg });
    return { status: 200, body: { imported_rows: good.length, students_updated: scope.size, errors: [], message_th: msg } };
}

// =====================================================================
// 5) STATUS
// =====================================================================
async function getStatus() {
    const r = await db.send(new QueryCommand({
        TableName: ENV.SYNC, KeyConditionExpression: "#s = :s", ExpressionAttributeNames: { "#s": "source" },
        ExpressionAttributeValues: { ":s": ENV.SOURCE }, ScanIndexForward: false, Limit: 20,
    }));
    const history = r.Items || [];
    const latest = history[0] || null;
    const lastOk = history.find((h) => h.status === "success") || null;
    let status = latest ? latest.status : "never";
    if (status === "success" && (Date.now() - new Date(lastOk.at)) / 86400000 > ENV.STALE_DAYS) status = "stale";

    // นับนักศึกษาที่ข้อมูลยังไม่ครบ (มีวิชาในภาคที่จบแล้วแต่ไม่มีเกรด หรือได้ I)
    const [students, records] = await Promise.all([
        scanAll(ENV.STUDENTS, { ProjectionExpression: "student_id" }),
        scanAll(ENV.RECORDS, { ProjectionExpression: "student_id, term, grade" }),
    ]);
    const incomplete = new Set(records
        .filter((x) => (termValue(x.term) < termValue(ENV.CURRENT_TERM) && (x.grade == null || x.grade === "")) || x.grade === "I")
        .map((x) => x.student_id));

    return {
        current: latest ? {
            source: ENV.SOURCE, channel: latest.channel, status,
            source_label_th: latest.channel === "upload" ? "ไฟล์จากสำนักทะเบียน (อัปโหลด)" : "ทะเบียนจำลอง (Google Sheet)",
            data_as_of: lastOk?.at || null, last_attempt_at: latest.at, message_th: latest.message_th,
        } : { status: "never", message_th: "ยังไม่เคยดึงข้อมูลจากทะเบียน (ใช้ข้อมูลตั้งต้น)" },
        history: history.map((h) => ({ at: h.at, channel: h.channel, trigger: h.trigger, status: h.status,
            rows: h.rows ?? 0, filename: h.filename, message_th: h.message_th })),
        counts: { students_total: students.length, students_incomplete: incomplete.size },
    };
}

// =====================================================================
// 6) HANDLER
// =====================================================================
const groupsOf = (claims) => {
    const raw = claims?.["cognito:groups"];
    if (Array.isArray(raw)) return raw;
    return String(raw || "").replace(/[[\]]/g, "").split(/[\s,]+/).filter(Boolean);
};

export const handler = async (event) => {
    // ---- EventBridge schedule ----
    if (event?.source === "aws.events" || event?.["detail-type"] === "Scheduled Event") {
        const r = await runSync("schedule");
        console.log("scheduled sync:", JSON.stringify(r));
        return r;
    }
    try {
        const method = event.requestContext?.http?.method || "GET";
        if (method === "OPTIONS") return respond(200, {});
        const claims = event.requestContext?.authorizer?.jwt?.claims;
        if (!claims) return fail(401, "UNAUTHORIZED", "ต้องเข้าสู่ระบบก่อน");
        const user = claims["cognito:username"] || "unknown";
        const groups = groupsOf(claims);
        const isStaff = groups.includes("Staff") || groups.includes("Admin");
        const canView = isStaff || groups.includes("Professor");
        const route = event.routeKey || `${method} ${event.rawPath}`;

        if (route.endsWith(" /registrar/status")) {
            if (!canView) return fail(403, "FORBIDDEN", "เฉพาะอาจารย์และเจ้าหน้าที่");
            return ok("registrar_status", await getStatus());
        }
        if (route.endsWith(" /registrar/sync")) {
            if (!isStaff) return fail(403, "FORBIDDEN", "เฉพาะเจ้าหน้าที่และผู้ดูแลหลักสูตร");
            return ok("registrar_sync", await runSync(`manual:${user}`));
        }
        if (route.endsWith(" /registrar/upload")) {
            if (!isStaff) return fail(403, "FORBIDDEN", "เฉพาะเจ้าหน้าที่และผู้ดูแลหลักสูตร");
            let body;
            try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body || "{}"); }
            catch { return fail(400, "BAD_REQUEST", "body ต้องเป็น JSON { filename, csv }"); }
            if (!body.csv) return fail(400, "BAD_REQUEST", "ไม่มีเนื้อหาไฟล์ (csv)");
            const r = await runUpload(body, user);
            return r.status === 200 ? ok("registrar_upload", r.body)
                : respond(400, { success: false, error: { code: "BAD_REQUEST", message: r.body.message }, data: { errors: r.body.errors } });
        }
        return fail(404, "NOT_FOUND", `Unknown route: ${route}`);
    } catch (e) {
        console.error("RegistrarApi error:", e);
        return fail(500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง");
    }
};

const HEADERS = {
    "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
const respond = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });
const ok = (resource, data) => respond(200, { success: true, resource, data, meta: { generated_at: new Date().toISOString() } });
const fail = (status, code, message) => respond(status, { success: false, error: { code, message } });
