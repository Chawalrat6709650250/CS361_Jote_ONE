// Lambda: ProfileApi — ข้อมูลพื้นฐานของนักศึกษา / อาจารย์ จาก TU REST API (v2)
// เรียก TU API จากฝั่ง AWS เท่านั้น (Application-Key ไม่หลุดไปที่ browser)
//
// Routes (HTTP API + CognitoJWT):
//   GET /profile/me                         ทุกคนที่ล็อกอิน — ข้อมูลของตัวเอง
//   GET /profile/students/{student_id}      ตัวเอง / อาจารย์ที่ปรึกษา / Staff / Admin
//   GET /profile/instructors?first_name_th=&last_name_th=&first_name_en=&last_name_en=&email=&faculty_th=&faculty_en=
//                                           ทุกคนที่ล็อกอิน — ค้นหาอาจารย์ (ต้องระบุอย่างน้อย 1 ช่อง)
//
// Env: TU_APP_KEY, STUDENTS_TABLE (Students), PROFILES_TABLE (UserProfiles), TU_TIMEOUT_MS (8000)

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ENV = {
    KEY: process.env.TU_APP_KEY || "",
    STUDENTS: process.env.STUDENTS_TABLE || "Students",
    PROFILES: process.env.PROFILES_TABLE || "UserProfiles",
    TIMEOUT: Number(process.env.TU_TIMEOUT_MS || 8000),
};
const TU = "https://restapi.tu.ac.th/api/v2/profile";
const RE_STUDENT_ID = /^\d{10}$/;

// =====================================================================
// TU API (แคชในหน่วยความจำ 10 นาที ลดการเรียกซ้ำ)
// =====================================================================
const cache = new Map();
async function tuGet(path, params) {
    if (!ENV.KEY) throw Object.assign(new Error("ยังไม่ได้ตั้งค่า TU_APP_KEY"), { code: "TU_NOT_CONFIGURED" });
    const url = new URL(`${TU}/${path}/`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const key = url.toString();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 600000) return hit.data;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ENV.TIMEOUT);
    try {
        const res = await fetch(url, { headers: { "Application-Key": ENV.KEY }, signal: ctrl.signal });
        const body = await res.json().catch(() => null);
        const data = res.ok && body?.status === true ? body.data ?? null : null;
        cache.set(key, { data, at: Date.now() });
        return data;
    } catch (e) {
        if (e.name === "AbortError") throw Object.assign(new Error("TU API ตอบช้าเกินไป"), { code: "TU_TIMEOUT" });
        throw Object.assign(new Error("เชื่อมต่อ TU API ไม่ได้"), { code: "TU_UNAVAILABLE" });
    } finally {
        clearTimeout(timer);
    }
}

const mapStudent = (d) => d && {
    type: "student",
    username: d.userName || null,
    prefix: d.prefixname || null,
    name_th: (d.displayname_th || "").replace(/\s+/g, " ").trim() || null,
    name_en: (d.displayname_en || "").replace(/\s+/g, " ").trim() || null,
    email: d.email || null,
    faculty: d.faculty || null,
    department: d.department || null,
    status: d.statusname || null,
};
const mapInstructor = (d) => d && {
    type: "instructor",
    name_th: [d.First_Name_Th, d.Last_Name_Th].filter(Boolean).join(" ") || null,
    name_en: [d.First_Name_En, d.Last_Name_En].filter(Boolean).join(" ") || null,
    email: d.Email || null,
    faculty: d.Faculty_Name_Th || null,
    faculty_en: d.Faculty_Name_En || null,
};

const studentFromTU = async (code) => RE_STUDENT_ID.test(String(code || "")) ? mapStudent(await tuGet("std/info", { id: code })) : null;
const instructorByEmail = async (email) => {
    if (!email) return null;
    const list = await tuGet("Instructors/info", { Email: email });
    return mapInstructor(Array.isArray(list) ? list[0] : list);
};

// =====================================================================
// DATA
// =====================================================================
const getStudent = async (id) => (await db.send(new GetCommand({ TableName: ENV.STUDENTS, Key: { student_id: id } }))).Item || null;
const getProfile = async (u) => (await db.send(new GetCommand({ TableName: ENV.PROFILES, Key: { username: u } })).catch(() => null))?.Item || null;

// ข้อมูลจาก TU — ถ้า TU ล่ม ยังตอบข้อมูลในระบบได้ พร้อมบอกเหตุผล
async function safeTU(fn) {
    try { return { tu: await fn(), tu_error: null }; }
    catch (e) { console.warn("TU API:", e.code || e.message); return { tu: null, tu_error: e.message }; }
}

async function advisorOf(student) {
    const u = student?.advisor_username;
    if (!u) return null;
    const p = await getProfile(u);
    const { tu } = await safeTU(() => instructorByEmail(p?.email));
    return { username: u, ...(p ? { name_th: p.name_th || null, email: p.email || null } : {}), ...(tu || {}) };
}

async function studentProfile(s, fallbackUsername) {
    const code = s?.student_code || fallbackUsername;
    const [{ tu, tu_error }, advisor] = await Promise.all([safeTU(() => studentFromTU(code)), advisorOf(s)]);
    return {
        username: s?.student_id || fallbackUsername,
        source: tu ? "tu" : "local",
        profile: tu || { type: "student", name_th: s?.name || null, name_en: null, email: null, faculty: null, department: null, status: null },
        student: s ? { student_code: s.student_code, curriculum_year: s.curriculum_year, study_plan_id: s.study_plan_id } : null,
        advisor,
        ...(tu_error ? { tu_error } : {}),
    };
}

// =====================================================================
// HANDLER
// =====================================================================
const groupsOf = (claims) => {
    const raw = claims?.["cognito:groups"];
    if (Array.isArray(raw)) return raw;
    return String(raw || "").replace(/[[\]]/g, "").split(/[\s,]+/).filter(Boolean);
};
const INSTRUCTOR_PARAMS = {
    first_name_th: "First_Name_Th", last_name_th: "Last_Name_Th", first_name_en: "First_Name_En",
    last_name_en: "Last_Name_En", email: "Email", faculty_th: "Faculty_Name_Th", faculty_en: "Faculty_Name_En",
};

export const handler = async (event) => {
    try {
        const method = event.requestContext?.http?.method || "GET";
        if (method === "OPTIONS") return respond(200, {});
        const claims = event.requestContext?.authorizer?.jwt?.claims;
        if (!claims) return fail(401, "UNAUTHORIZED", "ต้องเข้าสู่ระบบก่อน");
        const username = claims["cognito:username"] || claims.username;
        const groups = groupsOf(claims);
        const route = event.routeKey || `${method} ${event.rawPath}`;
        const q = event.queryStringParameters || {};

        // ---------- /profile/me ----------
        if (route.endsWith(" /profile/me")) {
            if (groups.includes("Student")) {
                return ok("profile_me", { roles: groups, ...(await studentProfile(await getStudent(username), username)) });
            }
            const p = await getProfile(username);
            const { tu, tu_error } = await safeTU(() => instructorByEmail(p?.email));
            return ok("profile_me", {
                username, roles: groups, source: tu ? "tu" : p ? "login" : "local",
                profile: tu || {
                    type: p?.type === "employee" ? "instructor" : "staff",
                    name_th: p?.name_th || claims.name || username, name_en: p?.name_en || null,
                    email: p?.email || null, faculty: p?.faculty || null, department: p?.department || null,
                },
                ...(tu_error ? { tu_error } : {}),
            });
        }

        // ---------- /profile/students/{id} ----------
        if (route.includes(" /profile/students/")) {
            const sid = decodeURIComponent(event.pathParameters?.student_id || "");
            const s = await getStudent(sid);
            if (!s) return fail(404, "NOT_FOUND", `ไม่พบนักศึกษา ${sid}`);
            const allowed = groups.includes("Admin") || groups.includes("Staff") || s.student_id === username
                || (groups.includes("Professor") && s.advisor_username === username);
            if (!allowed) return fail(403, "FORBIDDEN", "คุณไม่มีสิทธิ์ดูข้อมูลของนักศึกษาคนนี้");
            return ok("profile_student", await studentProfile(s, sid));
        }

        // ---------- /profile/instructors ----------
        if (route.endsWith(" /profile/instructors")) {
            const params = {};
            for (const [k, tuKey] of Object.entries(INSTRUCTOR_PARAMS)) {
                const v = String(q[k] || "").trim();
                if (v) params[tuKey] = v.slice(0, 100);
            }
            if (!Object.keys(params).length) {
                return fail(400, "BAD_REQUEST", `ต้องระบุอย่างน้อย 1 ช่อง: ${Object.keys(INSTRUCTOR_PARAMS).join(", ")}`);
            }
            try {
                const list = await tuGet("Instructors/info", params);
                const items = (Array.isArray(list) ? list : list ? [list] : []).slice(0, 50).map(mapInstructor);
                return ok("profile_instructors", { items, total: items.length });
            } catch (e) {
                return fail(502, "TU_API_ERROR", e.message);
            }
        }

        return fail(404, "NOT_FOUND", `Unknown route: ${route}`);
    } catch (e) {
        console.error("ProfileApi error:", e);
        return fail(500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง");
    }
};

const HEADERS = {
    "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
const respond = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });
const ok = (resource, data) => respond(200, { success: true, resource, data, meta: { generated_at: new Date().toISOString() } });
const fail = (status, code, message) => respond(status, { success: false, error: { code, message } });
