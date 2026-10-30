// Lambda: CurriculumAdminApi  (V4 — FR7 / FR8 / TC5 / TC6)
// แอดมินแก้รายวิชา / วิชาบังคับก่อน / เงื่อนไขการจบ — ทุกการแก้ต้องมีเหตุผล และบันทึกประวัติ (before/after)
// การแก้ข้อมูล + การบันทึกประวัติ เขียนพร้อมกันใน DynamoDB transaction เดียว (สำเร็จทั้งคู่ หรือไม่เกิดทั้งคู่)
//
// Routes (HTTP API + CognitoJWT):
//   GET  /admin/courses?year=2566                            Admin
//   POST /admin/courses                                      Admin
//   PUT  /admin/courses/{year}/{course_code}                 Admin
//   PUT  /admin/courses/{year}/{course_code}/prerequisite    Admin
//   GET  /admin/graduation-rules/{study_plan_id}             Admin
//   PUT  /admin/graduation-rules/{study_plan_id}             Admin
//   GET  /admin/changes?entity_id=&by=&from=&to=             Admin (Professor/Staff ได้เมื่อระบุ entity_id)
//
// Env: COURSES_TABLE (TestCourses), RULES_TABLE (GraduationRules), CHANGELOG_TABLE (CurriculumChangeLog)

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ENV = {
  COURSES: process.env.COURSES_TABLE || "TestCourses",
  RULES: process.env.RULES_TABLE || "GraduationRules",
  LOG: process.env.CHANGELOG_TABLE || "CurriculumChangeLog",
};

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const bad = (msg, details) => new HttpError(400, "BAD_REQUEST", msg, details);

// =====================================================================
// 1) VALIDATION (pure)
// =====================================================================
const RE_YEAR = /^25\d{2}$/;
const RE_COURSE = /^[A-Z]{2,5}\d{3}$/;
const GRADES = ["A", "B+", "B", "C+", "C", "D+", "D"];
const CATEGORIES = [
  "gen_ed",
  "core",
  "major_required",
  "major_elective",
  "free_elective",
];
export const normCode = (c) =>
  String(c ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();

export function requireReason(body) {
  const r = String(body?.reason ?? "").trim();
  if (r.length < 3)
    throw bad("ต้องระบุเหตุผลการแก้ไข (reason) อย่างน้อย 3 ตัวอักษร");
  if (r.length > 500) throw bad("เหตุผลยาวเกิน 500 ตัวอักษร");
  return r;
}

// credits ในตารางเดิมเก็บเป็น "3 (3-0-6)" → ตัวเลข
export const creditsNum = (v) => {
  if (typeof v === "number") return v;
  const m = String(v ?? "").match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

// ตรวจฟิลด์รายวิชา (ใช้ทั้ง POST และ PUT) — คืนเฉพาะฟิลด์ที่ส่งมา
export function validateCourseFields(body, { partial }) {
  const out = {};
  if (body.title_en !== undefined) {
    const t = String(body.title_en).trim();
    if (!t || t.length > 200)
      throw bad("title_en ต้องไม่ว่างและยาวไม่เกิน 200 ตัวอักษร");
    out.title_en = t;
  }
  if (body.title_th !== undefined) {
    const t = String(body.title_th ?? "").trim();
    if (t.length > 200) throw bad("title_th ยาวเกิน 200 ตัวอักษร");
    out.title_th = t;
  }
  if (body.description_th !== undefined) {
    if (typeof body.description_th !== "string")
      throw bad("description_th ต้องเป็นข้อความ");
    const t = body.description_th.trim();
    if (t.length > 2000) throw bad("description_th ยาวเกิน 2000 ตัวอักษร");
    out.description_th = t;
  }
  if (body.credits !== undefined) {
    const c = Number(body.credits);
    if (!Number.isInteger(c) || c < 0 || c > 12)
      throw bad("credits ต้องเป็นจำนวนเต็ม 0–12");
    out.credits = c;
  }
  if (body.category !== undefined) {
    if (body.category !== null && !CATEGORIES.includes(body.category))
      throw bad(`category ต้องเป็น ${CATEGORIES.join(", ")}`);
    out.category = body.category;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean")
      throw bad("active ต้องเป็น true/false");
    out.active = body.active;
  }
  if (!partial && (out.title_en === undefined || out.credits === undefined))
    throw bad("ต้องมี title_en และ credits");
  if (partial && !Object.keys(out).length)
    throw bad(
      "ไม่มีฟิลด์ที่จะแก้ (title_en, title_th, description_th, credits, category, active)",
    );
  return out;
}

export function validatePrereq(p, selfCode) {
  if (p === null) return null;
  if (typeof p !== "object")
    throw bad("prerequisite ต้องเป็น object หรือ null");
  const op = String(p.op || "AND").toUpperCase();
  if (!["AND", "OR"].includes(op))
    throw bad("prerequisite.op ต้องเป็น AND หรือ OR");
  if (!Array.isArray(p.items) || !p.items.length)
    throw bad(
      "prerequisite.items ต้องมีอย่างน้อย 1 รายการ (ถ้าจะลบให้ส่ง prerequisite: null)",
    );
  if (p.items.length > 10) throw bad("prerequisite.items ได้ไม่เกิน 10 รายการ");
  const seen = new Set();
  const items = p.items.map((it, i) => {
    const course = normCode(it?.course);
    if (!RE_COURSE.test(course))
      throw bad(`items[${i}].course '${it?.course ?? ""}' ไม่ถูกต้อง`);
    if (course === selfCode)
      throw bad(`วิชา ${selfCode} เป็นวิชาบังคับก่อนของตัวเองไม่ได้`);
    if (seen.has(course)) throw bad(`วิชา ${course} ซ้ำ`);
    seen.add(course);
    const condition = it.condition || "taken";
    if (condition === "taken") return { course, condition };
    if (condition === "min_grade") {
      if (!GRADES.includes(it.grade))
        throw bad(`items[${i}].grade ต้องเป็น ${GRADES.join(", ")}`);
      return { course, condition, grade: it.grade };
    }
    throw bad(`items[${i}].condition ต้องเป็น taken หรือ min_grade`);
  });
  const out = { op, items };
  if (p.text !== undefined) out.text = String(p.text).slice(0, 300);
  return out;
}

// ข้อความภาษาไทยสำหรับแสดงผล เช่น "เคยศึกษา CS232 และ CS242"
export function prereqText(p) {
  if (!p) return "";
  const parts = p.items.map((i) =>
    i.condition === "min_grade"
      ? `ได้เกรดไม่ต่ำกว่า ${i.grade} ใน ${i.course}`
      : `เคยศึกษา ${i.course}`,
  );
  return parts.join(p.op === "OR" ? " หรือ " : " และ ");
}

// หา cycle: graph = { code: [codes ที่เป็นวิชาบังคับก่อน] } → คืน path ที่วน หรือ null
export function findCycle(graph, start) {
  const path = [];
  const onPath = new Set();
  const done = new Set();
  const dfs = (n) => {
    if (onPath.has(n)) return [...path.slice(path.indexOf(n)), n];
    if (done.has(n)) return null;
    onPath.add(n);
    path.push(n);
    for (const m of graph[n] || []) {
      const c = dfs(m);
      if (c) return c;
    }
    onPath.delete(n);
    path.pop();
    done.add(n);
    return null;
  };
  return dfs(start);
}

export function validateRulesPatch(body) {
  const out = {};
  if (body.min_total_credits !== undefined) {
    const v = Number(body.min_total_credits);
    if (!Number.isInteger(v) || v < 1 || v > 300)
      throw bad("min_total_credits ต้องเป็นจำนวนเต็ม 1–300");
    out.min_total_credits = v;
  }
  if (body.min_gpa !== undefined) {
    const v = Number(body.min_gpa);
    if (!(v >= 0 && v <= 4)) throw bad("min_gpa ต้องอยู่ระหว่าง 0–4");
    out.min_gpa = Math.round(v * 100) / 100;
  }
  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories) || !body.categories.length)
      throw bad("categories ต้องเป็น array ที่ไม่ว่าง");
    const ids = new Set();
    out.categories = body.categories.map((c, i) => {
      if (!CATEGORIES.includes(c?.id))
        throw bad(`categories[${i}].id ต้องเป็น ${CATEGORIES.join(", ")}`);
      if (ids.has(c.id)) throw bad(`categories มี ${c.id} ซ้ำ`);
      ids.add(c.id);
      const m = Number(c.min_credits);
      if (!Number.isInteger(m) || m < 0 || m > 200)
        throw bad(`categories[${i}].min_credits ต้องเป็นจำนวนเต็ม 0–200`);
      return {
        id: c.id,
        label_th: String(c.label_th || c.id).trim(),
        min_credits: m,
      };
    });
  }
  if (body.required_courses !== undefined) {
    if (!Array.isArray(body.required_courses))
      throw bad("required_courses ต้องเป็น array");
    const codes = body.required_courses.map(normCode);
    const badCode = codes.find((c) => !RE_COURSE.test(c));
    if (badCode !== undefined)
      throw bad(`รหัสวิชา '${badCode}' ใน required_courses ไม่ถูกต้อง`);
    if (new Set(codes).size !== codes.length)
      throw bad("required_courses มีรหัสวิชาซ้ำ");
    out.required_courses = codes;
  }
  if (!Object.keys(out).length)
    throw bad(
      "ไม่มีฟิลด์ที่จะแก้ (min_total_credits, min_gpa, categories, required_courses)",
    );
  return out;
}

// diff เฉพาะฟิลด์ที่เปลี่ยน
export function diff(before, patch) {
  const b = {};
  const a = {};
  for (const [k, v] of Object.entries(patch)) {
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(v ?? null)) {
      b[k] = before?.[k] ?? null;
      a[k] = v;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

// =====================================================================
// 2) DATA
// =====================================================================
const courseKey = (year, code) => ({
  curriculum_year: year,
  course_code: code,
});
const getCourse = async (year, code) =>
  (
    await db.send(
      new GetCommand({ TableName: ENV.COURSES, Key: courseKey(year, code) }),
    )
  ).Item || null;
const coursesOfYear = async (year) => {
  const out = [];
  let ExclusiveStartKey;
  do {
    const r = await db.send(
      new QueryCommand({
        TableName: ENV.COURSES,
        KeyConditionExpression: "curriculum_year = :y",
        ExpressionAttributeValues: { ":y": year },
        ExclusiveStartKey,
      }),
    );
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
// รหัสวิชาที่ "รู้จัก" ในปีหลักสูตรนั้น (จากตารางรายวิชา + เล่มหลักสูตรใน GraduationRules) และหมวดของแต่ละวิชา
async function catalogOfYear(year, major) {
  const rules = (await scanAll(ENV.RULES)).filter(
    (r) => String(r.curriculum_year) === String(year),
  );
  // แผนของสาขาเดียวกัน (เช่น CIS) มาก่อน เพื่อให้หมวดวิชาตรงสาขา
  if (major)
    rules.sort(
      (a, b) =>
        Number(!a.study_plan_id.includes(`-${major}-`)) -
        Number(!b.study_plan_id.includes(`-${major}-`)),
    );
  const known = new Set();
  const category = {};
  for (const r of rules) {
    Object.keys(r.course_titles || {}).forEach((c) => known.add(c));
    for (const [c, cat] of Object.entries(r.course_categories || {}))
      category[c] ??= cat;
  }
  return { known, category, hasRules: rules.length > 0 };
}

const toApiCourse = (c, catalog) => ({
  course_code: c.course_code,
  curriculum_year: c.curriculum_year,
  title_en: c.title_en || "",
  title_th: c.title_th || "",
  description_th: c.description_th || "",
  credits: creditsNum(c.credits),
  category: c.category ?? catalog?.category?.[c.course_code] ?? null,
  active: c.active !== false,
  prerequisite: c.prerequisite
    ? {
        op: c.prerequisite.op,
        items: c.prerequisite.items || [],
        ...(c.prerequisite.text ? { text: c.prerequisite.text } : {}),
      }
    : null,
  updated_at: c.updated_at || null,
  updated_by: c.updated_by || null,
});

// เขียนข้อมูล + ประวัติ ใน transaction เดียว
async function commit({
  table,
  item,
  condition,
  user,
  action,
  entityType,
  entityId,
  before,
  after,
  reason,
}) {
  const at = new Date().toISOString();
  const change = {
    entity_id: entityId,
    at,
    change_id: `chg-${randomUUID().slice(0, 8)}`,
    by: user.username,
    by_name: user.name,
    action,
    entity_type: entityType,
    before,
    after,
    reason,
  };
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: { ...item, updated_at: at, updated_by: user.username },
              ...condition,
            },
          },
          {
            Put: {
              TableName: ENV.LOG,
              Item: change,
              ConditionExpression: "attribute_not_exists(entity_id)",
            },
          },
        ],
      }),
    );
  } catch (e) {
    if (e.name === "TransactionCanceledException") {
      throw new HttpError(
        409,
        "CONFLICT",
        "ข้อมูลถูกแก้ไขโดยผู้อื่นระหว่างนี้ กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง",
      );
    }
    throw e;
  }
  return change;
}
// optimistic lock: ต้องยังเป็นเวอร์ชันเดิมที่เราอ่านมา
const sameVersion = (prev) =>
  prev.updated_at
    ? {
        ConditionExpression: "updated_at = :u",
        ExpressionAttributeValues: { ":u": prev.updated_at },
      }
    : { ConditionExpression: "attribute_not_exists(updated_at)" };

// =====================================================================
// 3) ACTIONS
// =====================================================================
async function listCourses(q) {
  const year = q.year;
  if (year && !RE_YEAR.test(year)) throw bad("year ไม่ถูกต้อง");
  const items = year ? await coursesOfYear(year) : await scanAll(ENV.COURSES);
  const keys = [
    ...new Set(items.map((c) => `${c.curriculum_year}|${c.major || ""}`)),
  ];
  const catalogs = Object.fromEntries(
    await Promise.all(
      keys.map(async (k) => {
        const [y, m] = k.split("|");
        return [k, await catalogOfYear(y, m)];
      }),
    ),
  );
  const courses = items
    .map((c) =>
      toApiCourse(c, catalogs[`${c.curriculum_year}|${c.major || ""}`]),
    )
    .sort((a, b) =>
      `${a.curriculum_year}${a.course_code}`.localeCompare(
        `${b.curriculum_year}${b.course_code}`,
      ),
    );
  return { year: year || null, courses };
}

async function createCourse(body, user) {
  const reason = requireReason(body);
  const year = String(body.year ?? body.curriculum_year ?? "");
  const code = normCode(body.course_code);
  if (!RE_YEAR.test(year)) throw bad("year ไม่ถูกต้อง (เช่น 2566)");
  if (!RE_COURSE.test(code)) throw bad("course_code ไม่ถูกต้อง (เช่น CS361)");
  const fields = validateCourseFields(body, { partial: false });
  if (await getCourse(year, code))
    throw new HttpError(
      409,
      "CONFLICT",
      `มีวิชา ${code} ในหลักสูตร ${year} อยู่แล้ว — ใช้ PUT เพื่อแก้ไข`,
    );
  const major = body.major
    ? String(body.major).toUpperCase().slice(0, 10)
    : "CIS";
  const item = {
    ...courseKey(year, code),
    major,
    dataset: "TEST",
    active: true,
    prerequisite: null,
    ...fields,
  };
  const change = await commit({
    table: ENV.COURSES,
    item,
    condition: { ConditionExpression: "attribute_not_exists(course_code)" },
    user,
    action: "create_course",
    entityType: "course",
    entityId: `COURSE#${year}#${code}`,
    before: null,
    after: fields,
    reason,
  });
  return {
    course: toApiCourse(
      { ...item, updated_at: change.at, updated_by: user.username },
      await catalogOfYear(year, item.major),
    ),
    change_id: change.change_id,
  };
}

async function updateCourse(year, code, body, user) {
  const reason = requireReason(body);
  const prev = await getCourse(year, code);
  if (!prev)
    throw new HttpError(
      404,
      "NOT_FOUND",
      `ไม่พบวิชา ${code} ในหลักสูตร ${year}`,
    );
  const patch = validateCourseFields(body, { partial: true });
  const current = {
    ...prev,
    credits: creditsNum(prev.credits),
    active: prev.active !== false,
  };
  const d = diff(current, patch);
  if (!d.changed) throw bad("ค่าที่ส่งมาเหมือนเดิม ไม่มีอะไรเปลี่ยน");
  const item = { ...prev, ...patch };
  const action =
    patch.active === false && d.after.active === false
      ? "deactivate_course"
      : "update_course";
  const change = await commit({
    table: ENV.COURSES,
    item,
    condition: sameVersion(prev),
    user,
    action,
    entityType: "course",
    entityId: `COURSE#${year}#${code}`,
    before: d.before,
    after: d.after,
    reason,
  });
  return {
    course: toApiCourse(
      { ...item, updated_at: change.at, updated_by: user.username },
      await catalogOfYear(year, item.major),
    ),
    change_id: change.change_id,
  };
}

async function updatePrereq(year, code, body, user) {
  const reason = requireReason(body);
  if (!("prerequisite" in (body || {})))
    throw bad("ต้องส่ง prerequisite (หรือ null เพื่อลบ)");
  const prev = await getCourse(year, code);
  if (!prev)
    throw new HttpError(
      404,
      "NOT_FOUND",
      `ไม่พบวิชา ${code} ในหลักสูตร ${year}`,
    );
  const next = validatePrereq(body.prerequisite, code);

  if (next) {
    // วิชาที่อ้างถึงต้องมีอยู่จริงในหลักสูตรเดียวกัน
    const [all, catalog] = await Promise.all([
      coursesOfYear(year),
      catalogOfYear(year, prev.major),
    ]);
    const inTable = new Set(all.map((c) => c.course_code));
    if (catalog.hasRules) {
      const missing = next.items
        .map((i) => i.course)
        .filter((c) => !inTable.has(c) && !catalog.known.has(c));
      if (missing.length)
        throw bad(`ไม่พบวิชา ${missing.join(", ")} ในหลักสูตร ${year}`);
    }
    // ห้ามวน
    const graph = Object.fromEntries(
      all.map((c) => [
        c.course_code,
        (c.prerequisite?.items || []).map((i) => i.course),
      ]),
    );
    graph[code] = next.items.map((i) => i.course);
    const cycle = findCycle(graph, code);
    if (cycle) throw bad(`ตั้งแล้วจะวนกัน: ${cycle.join(" → ")}`, { cycle });
    if (!next.text) next.text = prereqText(next);
  }
  const before = prev.prerequisite
    ? { op: prev.prerequisite.op, items: prev.prerequisite.items }
    : null;
  const after = next ? { op: next.op, items: next.items } : null;
  if (JSON.stringify(before) === JSON.stringify(after))
    throw bad("วิชาบังคับก่อนเหมือนเดิม ไม่มีอะไรเปลี่ยน");
  const item = { ...prev, prerequisite: next };
  const change = await commit({
    table: ENV.COURSES,
    item,
    condition: sameVersion(prev),
    user,
    action: "update_prerequisite",
    entityType: "course",
    entityId: `COURSE#${year}#${code}`,
    before: { prerequisite: before },
    after: { prerequisite: after },
    reason,
  });
  return {
    course: toApiCourse(
      { ...item, updated_at: change.at, updated_by: user.username },
      await catalogOfYear(year, prev.major),
    ),
    change_id: change.change_id,
  };
}

const RULE_FIELDS = [
  "study_plan_id",
  "plan_name_th",
  "plan_code",
  "curriculum_year",
  "version",
  "min_total_credits",
  "min_gpa",
  "categories",
  "required_courses",
  "project_or_coop_courses",
  "source_note_th",
  "updated_at",
  "updated_by",
];
const toApiRule = (r) =>
  Object.fromEntries(
    RULE_FIELDS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]),
  );

async function getRules(planId) {
  const r = (
    await db.send(
      new GetCommand({ TableName: ENV.RULES, Key: { study_plan_id: planId } }),
    )
  ).Item;
  if (!r)
    throw new HttpError(404, "NOT_FOUND", `ไม่พบเงื่อนไขการจบของแผน ${planId}`);
  return r;
}

async function updateRules(planId, body, user) {
  const reason = requireReason(body);
  const prev = await getRules(planId);
  if (
    body.version !== undefined &&
    Number(body.version) !== Number(prev.version || 1)
  ) {
    throw new HttpError(
      409,
      "CONFLICT",
      `ข้อมูลเป็นเวอร์ชัน ${prev.version || 1} แล้ว (ส่งมา ${body.version}) กรุณาโหลดใหม่`,
    );
  }
  const patch = validateRulesPatch(body);
  const merged = { ...prev, ...patch };
  const catSum = (merged.categories || []).reduce(
    (s, c) => s + c.min_credits,
    0,
  );
  if (catSum > merged.min_total_credits)
    throw bad(
      `ผลรวมหน่วยกิตขั้นต่ำของทุกหมวด (${catSum}) มากกว่าหน่วยกิตรวม (${merged.min_total_credits})`,
    );
  const d = diff(prev, patch);
  if (!d.changed) throw bad("ค่าที่ส่งมาเหมือนเดิม ไม่มีอะไรเปลี่ยน");
  const version = Number(prev.version || 1) + 1;
  const item = { ...merged, version };
  const condition =
    prev.version !== undefined
      ? {
          ConditionExpression: "version = :v",
          ExpressionAttributeValues: { ":v": prev.version },
        }
      : { ConditionExpression: "attribute_not_exists(version)" };
  const change = await commit({
    table: ENV.RULES,
    item,
    condition,
    user,
    action: "update_graduation_rules",
    entityType: "graduation_rules",
    entityId: `RULES#${planId}`,
    before: { ...d.before, version: prev.version || 1 },
    after: { ...d.after, version },
    reason,
  });
  const warnings =
    catSum !== merged.min_total_credits
      ? [
          `ผลรวมหมวด (${catSum}) ไม่เท่ากับหน่วยกิตรวม (${merged.min_total_credits}) — ส่วนต่างถือเป็นหน่วยกิตที่เลือกหมวดใดก็ได้`,
        ]
      : [];
  return {
    rules: toApiRule({
      ...item,
      updated_at: change.at,
      updated_by: user.username,
    }),
    change_id: change.change_id,
    warnings,
  };
}

async function listChanges(q, isAdmin) {
  if (!isAdmin && !q.entity_id)
    throw new HttpError(
      403,
      "FORBIDDEN",
      "อาจารย์/เจ้าหน้าที่ดูประวัติได้เฉพาะเมื่อระบุ entity_id",
    );
  let items;
  if (q.entity_id) {
    items =
      (
        await db.send(
          new QueryCommand({
            TableName: ENV.LOG,
            KeyConditionExpression: "entity_id = :e",
            ExpressionAttributeValues: { ":e": q.entity_id },
            ScanIndexForward: false,
            Limit: 200,
          }),
        )
      ).Items || [];
  } else {
    items = await scanAll(ENV.LOG);
  }
  items = items
    .filter((x) => !q.by || x.by === q.by)
    .filter((x) => !q.from || x.at >= q.from)
    .filter(
      (x) =>
        !q.to || x.at <= (q.to.length === 10 ? `${q.to}T23:59:59.999Z` : q.to),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const limit = Math.min(Number(q.limit) || 100, 500);
  return { items: items.slice(0, limit), total: items.length };
}

// =====================================================================
// 4) HANDLER
// =====================================================================
const groupsOf = (claims) => {
  const raw = claims?.["cognito:groups"];
  if (Array.isArray(raw)) return raw;
  return String(raw || "")
    .replace(/[[\]]/g, "")
    .split(/[\s,]+/)
    .filter(Boolean);
};
const parseBody = (event) => {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString()
      : event.body || "{}";
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b;
  } catch {
    throw bad("body ต้องเป็น JSON object");
  }
};

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || "GET";
    if (method === "OPTIONS") return respond(200, {});
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return fail(401, "UNAUTHORIZED", "ต้องเข้าสู่ระบบก่อน");
    const groups = groupsOf(claims);
    const user = {
      username: claims["cognito:username"] || "unknown",
      name: claims.name || claims["cognito:username"] || "unknown",
    };
    const isAdmin = groups.includes("Admin");
    const route = event.routeKey || `${method} ${event.rawPath}`;
    const p = event.pathParameters || {};
    const q = event.queryStringParameters || {};
    const year = p.year;
    const code = p.course_code ? normCode(p.course_code) : undefined;

    if (route === "GET /admin/changes") {
      if (
        !isAdmin &&
        !groups.includes("Professor") &&
        !groups.includes("Staff")
      )
        return fail(403, "FORBIDDEN", "ไม่มีสิทธิ์ดูประวัติการแก้ไข");
      return ok("admin_changes", await listChanges(q, isAdmin));
    }
    if (!isAdmin) return fail(403, "FORBIDDEN", "เฉพาะผู้ดูแลหลักสูตร (Admin)");

    switch (route) {
      case "GET /admin/courses":
        return ok("admin_courses", await listCourses(q));
      case "POST /admin/courses":
        return ok(
          "admin_course_create",
          await createCourse(parseBody(event), user),
        );
      case "PUT /admin/courses/{year}/{course_code}":
        return ok(
          "admin_course_update",
          await updateCourse(year, code, parseBody(event), user),
        );
      case "PUT /admin/courses/{year}/{course_code}/prerequisite":
        return ok(
          "admin_course_update",
          await updatePrereq(year, code, parseBody(event), user),
        );
      case "GET /admin/graduation-rules/{study_plan_id}":
        return ok(
          "graduation_rules",
          toApiRule(await getRules(p.study_plan_id)),
        );
      case "PUT /admin/graduation-rules/{study_plan_id}":
        return ok(
          "graduation_rules_update",
          await updateRules(p.study_plan_id, parseBody(event), user),
        );
      default:
        return fail(404, "NOT_FOUND", `Unknown route: ${route}`);
    }
  } catch (e) {
    if (e instanceof HttpError) {
      return respond(e.status, {
        success: false,
        error: {
          code: e.code,
          message: e.message,
          ...(e.details ? { details: e.details } : {}),
        },
      });
    }
    console.error("CurriculumAdminApi error:", e);
    return fail(500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง");
  }
};

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
const respond = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});
const ok = (resource, data) =>
  respond(200, {
    success: true,
    resource,
    data,
    meta: { generated_at: new Date().toISOString() },
  });
const fail = (status, code, message) =>
  respond(status, { success: false, error: { code, message } });
