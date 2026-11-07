"""
สร้างร่าง GraduationRules (เงื่อนไขการจบ) จากข้อมูลแผนการเรียนที่ดึงมาแล้ว
  StudyPlansData   → วิชาในแผน + หน่วยกิตวิชาเลือกแต่ละภาค
  CourseDetailData → ชื่อวิชา, หน่วยกิต, ประเภทวิชา (หาหมวด)

  python3 build_graduation_rules.py                     ทดลอง ทุกแผน (ไม่เขียน)
  python3 build_graduation_rules.py --plan <id>         ทดลองแผนเดียว
  python3 build_graduation_rules.py --write [--plan id] เขียนลงตาราง (ไม่ทับแผนที่มีอยู่แล้ว)
  python3 build_graduation_rules.py --write --force     เขียนทับแผนที่มีอยู่แล้ว

ตัวเลขเป็น "ร่าง" ที่คำนวณจากแผนการเรียน — ต้องตรวจกับเล่มหลักสูตรก่อนใช้จริง
(แก้ทีหลังได้ในหน้า Admin → เงื่อนไขการจบ ซึ่งจะบันทึกประวัติให้)
"""
import sys, re, json, os, collections
from datetime import datetime, timezone
from decimal import Decimal
import boto3

WRITE = "--write" in sys.argv
FORCE = "--force" in sys.argv
ONLY = sys.argv[sys.argv.index("--plan") + 1] if "--plan" in sys.argv else None
db = boto3.resource("dynamodb")
P = os.environ.get("TABLE_PREFIX", "")   # เช่น "cstu-v5-"
now = datetime.now(timezone.utc).isoformat()
norm = lambda c: re.sub(r"\s+", "", str(c or "")).upper()
num = lambda v: int(float(str(v))) if str(v or "").strip() not in ("", "None") else 0

LABEL = {"gen_ed": "วิชาศึกษาทั่วไป", "core": "วิชาแกน", "major_required": "วิชาเฉพาะด้าน (บังคับ)",
         "major_elective": "วิชาเอกเลือก / วิชาโท", "free_elective": "วิชาเลือกเสรี"}
REQ_TO_CAT = {"general_choice": "gen_ed", "general": "gen_ed", "gen_ed": "gen_ed",
              "major_elective_or_minor": "major_elective", "major_elective": "major_elective", "minor": "major_elective",
              "free_elective": "free_elective", "free": "free_elective"}
PROJECT_RE = re.compile(r"โครงงาน|สหกิจ|project|co-?op|cooperative", re.I)


def scan(name):
    t, out, kw = db.Table(name), [], {}
    while True:
        r = t.scan(**kw); out += r["Items"]
        if "LastEvaluatedKey" not in r: return out
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]


# ---------- รายวิชาของแต่ละหลักสูตร ----------
catalog = collections.defaultdict(dict)   # curriculum_id -> code -> info
for d in scan(P + "CourseDetailData"):
    det = d.get("detail") or {}
    co, cu, cl = det.get("course") or {}, det.get("curriculum") or {}, det.get("classification") or {}
    cid = cu.get("curriculum_id") or ""
    code = norm(d.get("course_code"))
    catalog[cid][code] = {
        "title_en": co.get("title_en") or "",
        "credits": num(cu.get("credits_counted") or (co.get("credits") or {}).get("total")),
        "type": ((cl.get("course_type") or {}).get("code") or ""),
        "group": cu.get("course_group") or "",
        "req": cu.get("requirement_type") or "",
    }


def base_category(info):
    """หมวดของวิชาจากข้อมูลทางการ (ยังไม่รู้ว่าอยู่ในแผนหรือไม่)"""
    if info["type"] in ("general_education", "general"): return "gen_ed"
    if info["type"] in ("free_elective", "free"): return "free_elective"
    if "แกน" in info["group"]: return "core"
    if info["req"] == "elective": return "major_elective"
    return "major_required"


def build(plan):
    summary, detail = plan.get("summary") or {}, plan.get("detail") or {}
    pid = plan["study_plan_id"]
    cid = summary.get("curriculum_id") or (detail.get("study_plan") or {}).get("curriculum_id") or ""
    year = (re.search(r"(25\d{2})", cid) or re.search(r"(25\d{2})", pid)).group(1)
    cat_info = catalog.get(cid, {})

    scheduled, req_credits = {}, collections.Counter()
    for t in detail.get("terms") or []:
        for c in t.get("courses") or []:
            co = c.get("course") or {}
            code = norm(co.get("course_code"))
            if code:
                scheduled[code] = {"title_en": co.get("title_en") or cat_info.get(code, {}).get("title_en", ""),
                                   "credits": num(co.get("credits_total")) or cat_info.get(code, {}).get("credits", 0)}
        for r in t.get("requirements") or []:
            req_credits[REQ_TO_CAT.get(str(r.get("requirement_type") or "").lower(), "free_elective")] += num(r.get("credits_required"))

    # หมวดของทุกวิชาในหลักสูตร: วิชาที่บังคับอยู่ในตารางแผน (ที่ไม่ใช่ศึกษาทั่วไป/แกน) นับเป็นวิชาเฉพาะบังคับ
    categories = {}
    for code, info in cat_info.items():
        c = base_category(info)
        if code in scheduled and c in ("major_elective", "free_elective"): c = "major_required"
        categories[code] = c
    for code in scheduled:
        categories.setdefault(code, "major_required")

    project = sorted(c for c, v in scheduled.items() if PROJECT_RE.search(v["title_en"]) or PROJECT_RE.search(cat_info.get(c, {}).get("group", "")))
    required = sorted(c for c in scheduled if c not in project)

    cat_min = collections.Counter()
    for code, v in scheduled.items():
        cat_min[categories[code]] += v["credits"]
    for k, v in req_credits.items():
        cat_min[k] += v
    total = sum(cat_min.values())

    titles = {c: v["title_en"] for c, v in cat_info.items()}
    titles.update({c: v["title_en"] for c, v in scheduled.items() if v["title_en"]})
    unsched = lambda cat: sorted(c for c, k in categories.items() if k == cat and c not in scheduled)

    return {
        "study_plan_id": pid,
        "curriculum_year": year,
        "plan_code": summary.get("plan_code") or "",
        "plan_name_th": summary.get("plan_name_th") or "",
        "version": 1,
        "min_total_credits": total,
        "min_gpa": Decimal("2.00"),
        "categories": [{"id": k, "label_th": LABEL[k], "min_credits": cat_min[k]} for k in LABEL if cat_min[k] > 0],
        "required_courses": required,
        "project_or_coop_courses": project,
        "gen_ed_choice_courses": unsched("gen_ed"),
        "major_elective_courses": unsched("major_elective"),
        "course_categories": categories,
        "course_titles": titles,
        "source_note_th": "ร่างที่สร้างอัตโนมัติจากแผนการเรียน (StudyPlansData) — ต้องตรวจกับเล่มหลักสูตรก่อนใช้จริง",
        "generated_at": now,
    }


plans = [p for p in scan(P + "StudyPlansData") if not ONLY or p["study_plan_id"] == ONLY]
if not plans: sys.exit(f"ไม่พบแผน {ONLY or ''} ใน StudyPlansData")
existing = {r["study_plan_id"] for r in scan(P + "GraduationRules")}
rules = [build(p) for p in sorted(plans, key=lambda p: p["study_plan_id"])]

for r in rules:
    mark = " (มีอยู่แล้ว)" if r["study_plan_id"] in existing else ""
    cats = ", ".join(f'{c["id"]}={c["min_credits"]}' for c in r["categories"])
    print(f'{r["study_plan_id"]}{mark}\n  รวม {r["min_total_credits"]} หน่วยกิต | {cats}\n'
          f'  วิชาบังคับ {len(r["required_courses"])} | โครงงาน/สหกิจ {r["project_or_coop_courses"] or "-"}')
if ONLY:
    show = {k: v for k, v in rules[0].items() if k not in ("course_titles", "course_categories")}
    print(json.dumps(show, ensure_ascii=False, indent=1, default=str))

if not WRITE:
    print("\n(ทดลองเท่านั้น) ถ้าตัวเลขสมเหตุสมผล รันซ้ำพร้อม --write"); sys.exit()

t = db.Table(P + "GraduationRules")
written = 0
for r in rules:
    if r["study_plan_id"] in existing and not FORCE: continue
    t.put_item(Item=r); written += 1
print(f"เขียนลง GraduationRules แล้ว {written} แผน" + ("" if FORCE else " (ข้ามแผนที่มีอยู่แล้ว)"))
