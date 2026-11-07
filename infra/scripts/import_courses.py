"""
นำเข้ารายวิชาจริงจาก CourseDetailData + CoursePrerequisitesData → ตาราง Courses (ใช้กับ CurriculumAdminApi / GetCurriculumApi)
  python3 import_courses.py           ทดลอง (ไม่เขียนอะไร)
  python3 import_courses.py --write   สร้างตาราง Courses (ถ้ายังไม่มี) และเขียนข้อมูล
"""
import boto3, re, sys, json, os, collections
from datetime import datetime, timezone

WRITE = "--write" in sys.argv
P = os.environ.get("TABLE_PREFIX", "")   # เช่น "cstu-v5-" (template.yaml) หรือ "" (สคริปต์เดิม)
TARGET = P + "Courses"
db = boto3.resource("dynamodb")
now = datetime.now(timezone.utc).isoformat()
norm = lambda c: re.sub(r"\s+", "", str(c or "")).upper()


def scan(name):
    t, out, kw = db.Table(name), [], {}
    while True:
        r = t.scan(**kw); out += r["Items"]
        if "LastEvaluatedKey" not in r: return out
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]


# หมวดวิชาจาก GraduationRules แยกตามปี
cat_by_year = collections.defaultdict(dict)
for r in scan(P + "GraduationRules"):
    y = str(r.get("curriculum_year", ""))
    for c, cat in (r.get("course_categories") or {}).items():
        cat_by_year[y].setdefault(norm(c), cat)

prereq_tbl = {norm(i["course_code"]): i.get("prerequisites") for i in scan(P + "CoursePrerequisitesData")}


def fallback_cat(cls, cur):
    t = ((cls or {}).get("course_type") or {}).get("code")
    if t == "general_education": return "gen_ed"
    if t in ("free_elective", "free"): return "free_elective"
    if t == "specific" and cur.get("requirement_type") == "elective": return "major_elective"
    return None


def convert_prereq(p):
    if not p or not p.get("groups"): return None, None
    g = p["groups"]
    text = p.get("prerequisite_text_th") or ""
    between = (p.get("between_groups_operator") or "").upper()
    if not between:   # ตารางที่ไม่มีฟิลด์นี้: ดูจาก logic_expression
        expr = p.get("logic_expression") or ""
        between = "OR" if ") OR (" in expr else "AND"
    if len(g) == 1:
        op, rules = (g[0].get("within_group_operator") or "AND").upper(), g[0].get("rules") or []
    elif all(len(x.get("rules") or []) == 1 for x in g):
        op, rules = between, [x["rules"][0] for x in g]
    else:
        return {"op": "AND", "items": [], "text": text}, "complex"
    items = []
    for r in rules:
        code = norm(r.get("prerequisite_course_code"))
        th = r.get("rule_type_th") or ""
        if r.get("minimum_grade"):
            items.append({"course": code, "condition": "min_grade", "grade": str(r["minimum_grade"]).strip()})
        elif r.get("rule_type") == "have_taken":
            items.append({"course": code, "condition": "taken"})
        elif "สอบได้" in th or "สอบผ่าน" in th:
            items.append({"course": code, "condition": "min_grade", "grade": "D"})
        else:
            return {"op": "AND", "items": [], "text": text}, "complex"
    if not items or op not in ("AND", "OR"):
        return {"op": "AND", "items": [], "text": text}, "complex"
    return {"op": op, "items": items, "text": text}, None


out, complex_, nocat, skipped = [], [], [], []
for d in scan(P + "CourseDetailData"):
    det = d.get("detail") or {}
    co, cu = det.get("course") or {}, det.get("curriculum") or {}
    m = re.search(r"(25\d{2})", cu.get("curriculum_id") or "")
    if not m: skipped.append(d["course_code"]); continue
    year, code = m.group(1), norm(d["course_code"])
    cr = co.get("credits") or {}
    total = cu.get("credits_counted") or cr.get("total") or "0"
    pw = (cu.get("pathway_id") or "").split("-")
    pre, flag = convert_prereq(det.get("prerequisite") or prereq_tbl.get(code))
    if flag: complex_.append((year, code, pre["text"]))
    cat = cat_by_year[year].get(code) or fallback_cat(det.get("classification"), cu)
    it = {
        "curriculum_year": year, "course_code": code,
        "title_en": co.get("title_en") or "", "title_th": co.get("title_th") or "",
        "credits": f"{total} ({cr.get('lecture','0')}-{cr.get('lab','0')}-{cr.get('self_study','0')})",
        "major": pw[3] if len(pw) > 3 else (pw[1] if len(pw) > 1 else ""),
        "active": co.get("active", True) is not False and cu.get("active", True) is not False,
        "prerequisite": pre, "dataset": "REAL", "imported_at": now,
        "source_course_id": co.get("course_id"), "source_curriculum_course_id": cu.get("curriculum_course_id"),
    }
    if cat: it["category"] = cat
    else: nocat.append(f"{year}/{code}")
    out.append(it)

dups = [k for k, n in collections.Counter((i["curriculum_year"], i["course_code"]) for i in out).items() if n > 1]
print("รวม", len(out), "วิชา |", dict(collections.Counter(i["curriculum_year"] for i in out)))
print("ข้าม (ไม่มีปี):", skipped or "-")
print("key ซ้ำ:", dups or "-")
print("ไม่มีหมวด", len(nocat), ":", nocat)
print("prerequisite ซับซ้อน (แปลงอัตโนมัติไม่ได้)", len(complex_), ":")
for x in complex_: print("  ", x)
print("ตัวอย่าง:"); print(json.dumps([i for i in out if i["course_code"] in ("CS361", "CS303", "CNC303")] or out[:1], ensure_ascii=False, indent=1, default=str))

if not WRITE:
    print("\n(ทดลองเท่านั้น ยังไม่เขียน) ถ้าผลถูกต้อง รัน: python3 import_courses.py --write"); sys.exit()

client = boto3.client("dynamodb")
if TARGET not in client.list_tables()["TableNames"]:
    client.create_table(TableName=TARGET, BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": "curriculum_year", "AttributeType": "S"},
                              {"AttributeName": "course_code", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "curriculum_year", "KeyType": "HASH"},
                   {"AttributeName": "course_code", "KeyType": "RANGE"}])
    client.get_waiter("table_exists").wait(TableName=TARGET)
    print("สร้างตาราง", TARGET, "แล้ว")
with db.Table(TARGET).batch_writer(overwrite_by_pkeys=["curriculum_year", "course_code"]) as w:
    for i in out: w.put_item(Item=i)
print("เขียนลง", TARGET, "แล้ว", len(out), "วิชา")
