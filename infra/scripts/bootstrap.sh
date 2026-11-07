#!/usr/bin/env bash
# ใส่ข้อมูลตั้งต้นหลัง sam deploy — รันซ้ำได้
#   bash scripts/bootstrap.sh <stack> [step ...]
#   step: seed users curriculum registrar rules courses count   (ไม่ระบุ = ทำทุกขั้นตามลำดับ)
#   บัญชี mock สร้างเมื่อมี MOCK_PASSWORD เช่น  MOCK_PASSWORD='...' bash scripts/bootstrap.sh cstu-v5
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${1:?ระบุชื่อ stack เช่น cstu-v5}; shift || true
STEPS=${*:-seed users curriculum registrar rules courses count}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-$(aws configure get region || echo ap-southeast-2)}

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
export TABLE_PREFIX; TABLE_PREFIX=$(out TablePrefix)
POOL_ID=$(out UserPoolId)
[ -n "$TABLE_PREFIX" ] && [ "$TABLE_PREFIX" != "None" ] || { echo "ไม่พบ stack $STACK (deploy ก่อน)"; exit 1; }
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
step() { echo; echo "========== $* =========="; }

invoke() { # function payload
  aws lambda invoke --function-name "${STACK}-$1" --cli-binary-format raw-in-base64-out --payload "$2" \
    --cli-read-timeout 0 "$TMP" --query FunctionError --output text
  head -c 600 "$TMP"; echo
}

mk_user() { # username group
  aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username "$1" --message-action SUPPRESS \
    --user-attributes Name=name,Value="$1" >/dev/null 2>&1 && echo "สร้าง  $1" || echo "มีแล้ว $1"
  aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" --username "$1" --password "$MOCK_PASSWORD" --permanent
  aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL_ID" --username "$1" --group-name "$2"
}

count() {
  for t in CurriculumData CourseDetailData CourseMappingData CoursePrerequisitesData StudyPlansData GraduationRules \
           GraduationRequirementsData Courses FAQ Students StudentRecords RegistrarSync UserProfiles; do
    printf "%-28s %s\n" "$t" "$(aws dynamodb scan --table-name "${TABLE_PREFIX}$t" --select COUNT --query Count --output text)"
  done
}

for s in $STEPS; do
  case "$s" in
    seed)
      step "FAQ + เงื่อนไขการสำเร็จการศึกษา"
      python3 scripts/seed_json.py "${TABLE_PREFIX}FAQ" seed/faq.json
      python3 scripts/seed_json.py "${TABLE_PREFIX}GraduationRequirementsData" seed/graduation_requirements/*.json ;;
    users)
      step "บัญชี mock"
      if [ -z "${MOCK_PASSWORD:-}" ]; then echo "ข้าม (ไม่ได้ตั้ง MOCK_PASSWORD)"; continue; fi
      mk_user mock.admin Admin; mk_user mock.staff Staff; mk_user mock.professor Professor
      for x in a b c d e; do mk_user "mock.student.$x" Student; done; mk_user mock.student Student ;;
    curriculum)
      step "ดึงหลักสูตรจาก Apps Script (หลายนาที)"
      invoke SyncCurriculumData '{}' ;;
    registrar)
      step "ดึงนักศึกษา + ผลการเรียนจากทะเบียนจำลอง"
      invoke RegistrarApi '{"source":"aws.events","detail-type":"Scheduled Event"}' ;;
    rules)
      step "ร่างเงื่อนไขการจบจากแผนการเรียน (ไม่ทับแผนที่มีอยู่แล้ว)"
      python3 scripts/build_graduation_rules.py --write ;;
    courses)
      step "ตาราง Courses สำหรับหน้า Admin"
      python3 scripts/import_courses.py --write ;;
    count)
      step "จำนวนข้อมูล"; count ;;
    *) echo "ไม่รู้จักขั้น $s"; exit 1 ;;
  esac
done
