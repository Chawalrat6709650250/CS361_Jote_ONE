import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        const method = event.requestContext?.http?.method || event.httpMethod || "GET";
        const path = event.rawPath || event.path || "";
        if (method === "OPTIONS") return successResponse({}, "preflight");
        if (method === "PUT" && path.endsWith("/admin/test-note")) return await updateTestNote(event);

        const queryParams = event.queryStringParameters || {};
        const resource = queryParams.resource || "health";
        const courseCode = queryParams.course_code;
        const studyPlanId = queryParams.study_plan_id;
        const curriculumId = queryParams.curriculum_id;

        console.log(`API Request - Resource: ${resource}, Course: ${courseCode}, Plan: ${studyPlanId}`);

        // 1. Health Check
        if (resource === "health") {
            return successResponse({
                status: "healthy",
                message: "Curriculum Query API is running smoothly",
                timestamp: new Date().toISOString()
            });
        }

        // 2. List Courses
        if (resource === "courses") {
            const scanResult = await docClient.send(new ScanCommand({
                TableName: "CurriculumData",
                Limit: 300
            }));

            let courses = scanResult.Items || [];

            if (curriculumId) {
                courses = courses.filter(c => c.curriculum_id === curriculumId);
            }

            return successResponse({
                courses: courses,
                total: courses.length
            }, "courses");
        }

        // 3. Get Course Detail & Mappings
        if (resource === "course") {
            if (!courseCode) return errorResponse("Missing required parameter: course_code", 400);

            const courseScan = await docClient.send(new ScanCommand({
                TableName: "CurriculumData",
                FilterExpression: "course_code = :code",
                ExpressionAttributeValues: { ":code": courseCode }
            }));

            const matchedCourse = courseScan.Items?.[0] || {};
            const courseId = matchedCourse.id || courseCode;

            const [detailRes, mapRes, preRes] = await Promise.all([
                docClient.send(new GetCommand({ TableName: "CourseDetailData", Key: { course_code: courseCode } })).catch(() => null),
                docClient.send(new GetCommand({ TableName: "CourseMappingData", Key: { course_id: courseId } })).catch(() => null),
                docClient.send(new GetCommand({ TableName: "CoursePrerequisitesData", Key: { course_code: courseCode } })).catch(() => null)
            ]);

            return successResponse({
                course_code: courseCode,
                course_id: courseId,
                detail: detailRes?.Item?.detail || null,
                plo_mappings: mapRes?.Item?.mappings || [],
                prerequisites: preRes?.Item?.prerequisites || null
            }, "course");
        }

        // 4. Get Course PLO Mappings
        if (resource === "course_plo_mappings") {
            if (!courseCode) return errorResponse("Missing required parameter: course_code", 400);

            const courseScan = await docClient.send(new ScanCommand({
                TableName: "CurriculumData",
                FilterExpression: "course_code = :code",
                ExpressionAttributeValues: { ":code": courseCode }
            }));

            const matchedCourse = courseScan.Items?.[0] || {};
            const courseId = matchedCourse.id || courseCode;

            const mapRes = await docClient.send(new GetCommand({
                TableName: "CourseMappingData",
                Key: { course_id: courseId }
            })).catch(() => null);

            return successResponse({
                course_code: courseCode,
                course_id: courseId,
                mappings: mapRes?.Item?.mappings || []
            }, "course_plo_mappings");
        }

        // 5. Get Prerequisites
        if (resource === "prerequisites") {
            if (!courseCode) return errorResponse("Missing required parameter: course_code", 400);

            const preRes = await docClient.send(new GetCommand({
                TableName: "CoursePrerequisitesData",
                Key: { course_code: courseCode }
            }));

            return successResponse({
                course_code: courseCode,
                prerequisites: preRes?.Item?.prerequisites || null
            }, "prerequisites");
        }

        // 6. List Study Plans
        if (resource === "study_plans") {
            const scanResult = await docClient.send(new ScanCommand({
                TableName: "StudyPlansData"
            }));

            const plans = (scanResult.Items || []).map(item => item.summary);

            return successResponse({
                study_plans: plans,
                total: plans.length
            }, "study_plans");
        }

        // 7. Get Study Plan Detail
        if (resource === "study_plan") {
            if (!studyPlanId) return errorResponse("Missing required parameter: study_plan_id", 400);

            const planRes = await docClient.send(new GetCommand({
                TableName: "StudyPlansData",
                Key: { study_plan_id: studyPlanId }
            }));

            if (!planRes.Item) return errorResponse("Study plan not found. Please check your study_plan_id from ?resource=study_plans", 404);

            return successResponse({
                study_plan_id: studyPlanId,
                summary: planRes.Item.summary,
                detail: planRes.Item.detail
            }, "study_plan");
        }

        // 8. Compare Two Study Plans  (ใหม่)
        //    ?resource=compare_plans&plan_a=BSC-CS-2562-ACS-PROJECT&plan_b=BSC-CS-2566-ACS-PROJECT
        if (resource === "compare_plans") {
            const planA = queryParams.plan_a;
            const planB = queryParams.plan_b;
            if (!planA || !planB) return errorResponse("Missing required parameters: plan_a and plan_b", 400);
            if (planA === planB) return errorResponse("plan_a and plan_b must be different", 400);

            const [resA, resB] = await Promise.all([
                docClient.send(new GetCommand({ TableName: "StudyPlansData", Key: { study_plan_id: planA } })),
                docClient.send(new GetCommand({ TableName: "StudyPlansData", Key: { study_plan_id: planB } }))
            ]);

            const missing = [[planA, resA], [planB, resB]].filter(([, r]) => !r.Item).map(([id]) => id);
            if (missing.length) return errorResponse(`Study plan not found: ${missing.join(", ")}`, 404);

            return successResponse(comparePlans(resA.Item, resB.Item), "compare_plans");
        }

        // 9. V3 Test dataset: list courses of one curriculum year
        //    ?resource=test_courses&year=2561
        if (resource === "test_courses") {
            const year = normYear(queryParams.year);
            if (!year) return errorResponse("Missing or invalid parameter: year (e.g. 2561, 2566)", 400);

            const res = await docClient.send(new QueryCommand({
                TableName: TEST_TABLE,
                KeyConditionExpression: "curriculum_year = :y",
                ExpressionAttributeValues: { ":y": year }
            }));
            const items = res.Items || [];
            return successResponse({
                curriculum_year: year,
                courses: items,
                total: items.length
            }, "test_courses");
        }

        // 10. V3 Test dataset: course detail + prerequisite (same curriculum year only)
        //     ?resource=test_course&year=2561&course_code=CS254
        if (resource === "test_course") {
            const year = normYear(queryParams.year);
            const code = normCode(queryParams.course_code);
            if (!year || !code) return errorResponse("Missing required parameters: year and course_code", 400);

            const res = await docClient.send(new GetCommand({
                TableName: TEST_TABLE,
                Key: { curriculum_year: year, course_code: code }
            }));
            if (!res.Item) return errorResponse(`Course ${code} not found in curriculum ${year}`, 404);

            const course = res.Item;
            const prereq = course.prerequisite || null;

            return successResponse({
                curriculum_year: year,
                course: { ...course, prerequisite: prereq },
                prerequisite_summary: summarizePrereq(prereq)
            }, "test_course");
        }

        // 11. V4 (FR1): เงื่อนไขการจบของแผนการเรียน — สาธารณะ ไม่ต้อง login
        //     ?resource=graduation_rules                         → รายการทุกแผน (สรุป)
        //     ?resource=graduation_rules&study_plan_id=...       → รายละเอียดแผนเดียว
        if (resource === "graduation_rules") {
            if (!studyPlanId) {
                const all = await scanAll(RULES_TABLE);
                const plans = all.map(publicRuleSummary)
                    .filter((r) => !queryParams.curriculum_year || r.curriculum_year === String(queryParams.curriculum_year))
                    .sort((a, b) => a.study_plan_id.localeCompare(b.study_plan_id));
                return successResponse({ plans, total: plans.length }, "graduation_rules_list");
            }
            const r = await docClient.send(new GetCommand({ TableName: RULES_TABLE, Key: { study_plan_id: studyPlanId } }));
            if (!r.Item) return errorResponse(`ไม่พบเงื่อนไขการจบของแผน ${studyPlanId} (ดูรายการแผนได้จาก ?resource=graduation_rules)`, 404);
            return successResponse(publicRule(r.Item), "graduation_rules");
        }

        // 12. V4 (FR2): คำถามที่พบบ่อย — สาธารณะ
        //     ?resource=faq&q=คำค้น&tag=graduation
        if (resource === "faq") {
            const q = String(queryParams.q || "").trim().toLowerCase();
            const tag = String(queryParams.tag || "").trim().toLowerCase();
            const items = (await getFaq())
                .filter((f) => f.active !== false)
                .filter((f) => !tag || (f.tags || []).map((t) => String(t).toLowerCase()).includes(tag))
                .filter((f) => !q || `${f.question_th} ${f.answer_th} ${(f.tags || []).join(" ")}`.toLowerCase().includes(q))
                .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
                .map(({ id, question_th, answer_th, tags, updated_at }) => ({ id, question_th, answer_th, tags: tags || [], updated_at: updated_at || null }));
            const tags = [...new Set((await getFaq()).flatMap((f) => f.tags || []))].sort();
            return successResponse({ items, total: items.length, tags }, "faq");
        }

        return errorResponse(`Unknown resource: ${resource}`, 400);

    } catch (error) {
        console.error("API Error:", error);
        return errorResponse(error.message, 500);
    }
};

// ===== V4 PUBLIC: graduation_rules + faq =====
const RULES_TABLE = process.env.RULES_TABLE || "GraduationRules";
const FAQ_TABLE = process.env.FAQ_TABLE || "FAQ";

const scanAll = async (TableName) => {
    const out = []; let ExclusiveStartKey;
    do {
        const r = await docClient.send(new ScanCommand({ TableName, ExclusiveStartKey }));
        out.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
};

const publicRuleSummary = (r) => ({
    study_plan_id: r.study_plan_id, curriculum_year: String(r.curriculum_year), plan_code: r.plan_code,
    plan_name_th: r.plan_name_th, version: r.version || 1, min_total_credits: r.min_total_credits, min_gpa: r.min_gpa,
});

// เฉพาะข้อมูลที่เปิดเผยได้ (ไม่มีชื่อผู้แก้)
const publicRule = (r) => {
    const titles = r.course_titles || {};
    const withTitle = (codes) => (codes || []).map((c) => ({ course_code: c, title_en: titles[c] || "" }));
    return {
        ...publicRuleSummary(r),
        categories: r.categories || [],
        required_courses: r.required_courses || [],
        required_courses_detail: withTitle(r.required_courses),
        project_or_coop_courses: withTitle(r.project_or_coop_courses),
        gen_ed_choice_courses: withTitle(r.gen_ed_choice_courses),
        major_elective_courses: withTitle(r.major_elective_courses),
        source_note_th: r.source_note_th || "",
        updated_at: r.updated_at || null,
        note_th: "ผลตรวจในระบบนี้ใช้เพื่อวางแผนการเรียน การอนุมัติสำเร็จการศึกษาเป็นไปตามสำนักงานทะเบียนนักศึกษา",
    };
};

let faqCache = null; // แคช 60 วินาที (หน้า FAQ เป็นหน้าที่คนเข้าเยอะ)
const getFaq = async () => {
    if (faqCache && Date.now() - faqCache.at < 60000) return faqCache.items;
    const items = await scanAll(FAQ_TABLE);
    faqCache = { items, at: Date.now() };
    return items;
};

// ===== V3 TEST DATASET HELPERS =====
const TEST_TABLE = "TestCourses";
const normYear = (y) => (/^\d{4}$/.test(String(y || "").trim()) ? String(y).trim() : null);
const normCode = (c) => {
    const v = String(c || "").replace(/\s+/g, "").toUpperCase();
    return /^[A-Z]{2,4}\d{3}$/.test(v) ? v : null;
};
// แปลง rule เป็นข้อความอ่านง่าย เช่น "CS222 (เกรด ≥ C) หรือ CS334 (เกรด ≥ C)"
const summarizePrereq = (p) => {
    if (!p?.items?.length) return "ไม่มีวิชาบังคับก่อน";
    const one = (it) => it.condition === "min_grade" ? `${it.course} (เกรด ≥ ${it.grade})` : `${it.course} (เคยศึกษา)`;
    return p.items.map(one).join(p.op === "OR" ? " หรือ " : " และ ");
};

// ===== V3: Curriculum Admin แก้ test_note (route PUT /admin/test-note + JWT authorizer) =====
// ชั้นที่ 1: API Gateway JWT authorizer ตรวจว่า token ถูกต้อง (authentication)
// ชั้นที่ 2: ฟังก์ชันนี้ตรวจว่าอยู่ในกลุ่ม Admin (authorization)
const getGroups = (event) => {
    const raw = event.requestContext?.authorizer?.jwt?.claims?.["cognito:groups"];
    if (Array.isArray(raw)) return raw;
    return String(raw || "").replace(/[\[\]]/g, "").split(/[\s,]+/).filter(Boolean);
};

const updateTestNote = async (event) => {
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return errorResponse("Unauthorized: missing or invalid token", 401);
    if (!getGroups(event).includes("Admin")) return errorResponse("Forbidden: Curriculum Admin only", 403);

    let body;
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : (event.body || "{}")); }
    catch { return errorResponse("Invalid JSON body", 400); }

    const year = normYear(body.year);
    const code = normCode(body.course_code);
    const note = typeof body.test_note === "string" ? body.test_note.trim() : null;
    if (!year || !code || note === null) return errorResponse("Required: year, course_code, test_note", 400);
    if (note.length > 500) return errorResponse("test_note too long (max 500)", 400);

    try {
        // แก้เฉพาะฟิลด์ทดสอบ — ชื่อวิชา หน่วยกิต prerequisite แก้ผ่าน API นี้ไม่ได้
        const res = await docClient.send(new UpdateCommand({
            TableName: TEST_TABLE,
            Key: { curriculum_year: year, course_code: code },
            UpdateExpression: "SET test_note = :n, test_note_updated_by = :u, test_note_updated_at = :t",
            ConditionExpression: "attribute_exists(course_code)",
            ExpressionAttributeValues: { ":n": note, ":u": claims["cognito:username"] || "unknown", ":t": new Date().toISOString() },
            ReturnValues: "ALL_NEW"
        }));
        return successResponse({ curriculum_year: year, course: res.Attributes }, "update_test_note");
    } catch (e) {
        if (e.name === "ConditionalCheckFailedException") return errorResponse(`Course ${code} not found in curriculum ${year}`, 404);
        throw e;
    }
};

// ===== COMPARE LOGIC START =====

// แปลงแผนการศึกษาให้เป็น Map: course_code -> ข้อมูลวิชาแบบแบน
const flattenCourses = (item) => {
    const map = new Map();
    for (const term of item.detail?.terms || []) {
        for (const c of term.courses || []) {
            const code = c.course?.course_code;
            if (!code) continue;
            map.set(code, {
                course_code: code,
                course_code_th: c.course.course_code_th,
                title_en: c.course.title_en,
                title_th: c.course.title_th,
                credits: Number(c.course.credits_total ?? 0),
                course_role: c.course_role,
                category: c.notes,
                study_year: Number(c.study_year ?? term.study_year),
                semester: Number(c.semester ?? term.semester)
            });
        }
    }
    return map;
};

const termKey = (y, s) => `Y${y}S${s}`;

// หน่วยกิตรายภาค (วิชาบังคับ + หน่วยกิตเลือกตาม requirements)
const termCredits = (item) => {
    const out = {};
    for (const t of item.detail?.terms || []) {
        const course = (t.courses || []).reduce((s, c) => s + Number(c.course?.credits_total ?? 0), 0);
        const elective = (t.requirements || []).reduce((s, r) => s + Number(r.credits_required ?? 0), 0);
        out[termKey(t.study_year, t.semester)] = {
            study_year: Number(t.study_year), semester: Number(t.semester),
            course_credits: course, elective_credits: elective, total: course + elective
        };
    }
    return out;
};

// รวมหน่วยกิตเลือกตามประเภท (general_choice / major_elective_or_minor / free_elective)
const requirementTotals = (item) => {
    const out = {};
    for (const t of item.detail?.terms || []) {
        for (const r of t.requirements || []) {
            const k = r.requirement_type || "other";
            out[k] = (out[k] || 0) + Number(r.credits_required ?? 0);
        }
    }
    return out;
};

const planInfo = (item) => ({
    study_plan_id: item.study_plan_id,
    curriculum_id: item.summary?.curriculum_id,
    plan_code: item.summary?.plan_code,
    plan_name_th: item.summary?.plan_name_th,
    plan_name_en: item.summary?.plan_name_en
});

export const comparePlans = (itemA, itemB) => {
    const a = flattenCourses(itemA);
    const b = flattenCourses(itemB);

    const onlyInA = [];
    const onlyInB = [];
    const changed = [];
    const unchanged = [];

    for (const [code, ca] of a) {
        const cb = b.get(code);
        if (!cb) { onlyInA.push(ca); continue; }

        const diffs = [];
        const check = (field, label) => {
            if (ca[field] !== cb[field]) diffs.push({ field, label, a: ca[field], b: cb[field] });
        };
        check("credits", "หน่วยกิต");
        check("title_en", "ชื่อวิชา (EN)");
        check("title_th", "ชื่อวิชา (TH)");
        check("course_role", "ประเภทวิชา");
        check("category", "หมวดวิชา");
        if (ca.study_year !== cb.study_year || ca.semester !== cb.semester) {
            diffs.push({
                field: "term", label: "ภาคที่เรียน",
                a: `ปี ${ca.study_year} ภาค ${ca.semester}`,
                b: `ปี ${cb.study_year} ภาค ${cb.semester}`
            });
        }

        const row = { course_code: code, title_th: cb.title_th, title_en: cb.title_en, a: ca, b: cb };
        if (diffs.length) changed.push({ ...row, differences: diffs });
        else unchanged.push({ course_code: code, title_th: cb.title_th, credits: cb.credits });
    }
    for (const [code, cb] of b) if (!a.has(code)) onlyInB.push(cb);

    const bySchedule = (x, y) => x.study_year - y.study_year || x.semester - y.semester || x.course_code.localeCompare(y.course_code);
    onlyInA.sort(bySchedule);
    onlyInB.sort(bySchedule);
    changed.sort((x, y) => x.course_code.localeCompare(y.course_code));
    unchanged.sort((x, y) => x.course_code.localeCompare(y.course_code));

    // หน่วยกิตรายภาคเทียบกัน
    const tA = termCredits(itemA);
    const tB = termCredits(itemB);
    const termKeys = [...new Set([...Object.keys(tA), ...Object.keys(tB)])].sort();
    const terms = termKeys.map(k => {
        const x = tA[k], y = tB[k];
        return {
            term: k,
            study_year: (x || y).study_year,
            semester: (x || y).semester,
            a_total: x?.total ?? 0,
            b_total: y?.total ?? 0,
            diff: (y?.total ?? 0) - (x?.total ?? 0)
        };
    });

    const rA = requirementTotals(itemA);
    const rB = requirementTotals(itemB);
    const requirements = [...new Set([...Object.keys(rA), ...Object.keys(rB)])].map(type => ({
        requirement_type: type, a: rA[type] ?? 0, b: rB[type] ?? 0, diff: (rB[type] ?? 0) - (rA[type] ?? 0)
    }));

    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
    const totalA = sum(terms, t => t.a_total);
    const totalB = sum(terms, t => t.b_total);

    return {
        plan_a: planInfo(itemA),
        plan_b: planInfo(itemB),
        summary: {
            total_credits_a: totalA,
            total_credits_b: totalB,
            total_credits_diff: totalB - totalA,
            course_count_a: a.size,
            course_count_b: b.size,
            only_in_a_count: onlyInA.length,
            only_in_b_count: onlyInB.length,
            changed_count: changed.length,
            unchanged_count: unchanged.length
        },
        only_in_a: onlyInA,      // วิชาที่มีเฉพาะแผน A (ถูกตัดออกใน B)
        only_in_b: onlyInB,      // วิชาที่มีเฉพาะแผน B (เพิ่มใหม่)
        changed,                 // วิชาที่มีทั้งคู่แต่ข้อมูลต่างกัน
        unchanged,               // วิชาที่เหมือนกันทุกอย่าง
        terms,                   // หน่วยกิตรายภาค
        requirements             // หน่วยกิตวิชาเลือกตามประเภท
    };
};

// ===== COMPARE LOGIC END =====

const CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const successResponse = (data, resourceName = "") => {
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
            success: true,
            resource: resourceName,
            data: data,
            meta: { generated_at: new Date().toISOString() }
        })
    };
};

const errorResponse = (message, statusCode = 400) => {
    return {
        statusCode: statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify({
            success: false,
            error: { code: ({ 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 500: "SERVER_ERROR" })[statusCode] || "BAD_REQUEST", message: message }
        })
    };
};
