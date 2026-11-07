#!/usr/bin/env bash
# เก็บค่าลับใน SSM Parameter Store (ทำครั้งแรก หรือเมื่อเปลี่ยนค่า) — template.yaml อ่านค่าจากที่นี่ตอน deploy
#   TU_APP_KEY=... GAS_URL=... REGISTRAR_KEY=... bash scripts/put_secrets.sh [/cstu]
# ค่าไหนไม่ได้ส่งมา จะถามให้พิมพ์ (กด Enter = ไม่เปลี่ยนค่าเดิม)
# เปลี่ยนค่าแล้วต้อง sam deploy ใหม่ Lambda จึงจะได้ค่าใหม่
set -euo pipefail
SECRETS_PATH=${1:-/cstu}

put() { # name value
  aws ssm put-parameter --name "$SECRETS_PATH/$1" --type String --value "$2" --overwrite >/dev/null
  echo "บันทึก $SECRETS_PATH/$1"
}
exists() { aws ssm get-parameter --name "$SECRETS_PATH/$1" >/dev/null 2>&1; }

ask() { # name envVarName label
  local name=$1 var=$2 label=$3 val=${!2:-}
  if [ -z "$val" ]; then
    read -r -s -p "$label (Enter = ข้าม): " val; echo
  fi
  if [ -n "$val" ]; then put "$name" "$val"
  elif ! exists "$name"; then put "$name" "none"; echo "  ⚠️  ยังไม่มีค่า $name — ตั้งเป็น none ไว้ก่อน"
  else echo "คงค่าเดิม $SECRETS_PATH/$name"; fi
}

ask tu-app-key    TU_APP_KEY    "TU_APP_KEY (Token ของ TU REST API)"
ask gas-url       GAS_URL       "GAS_URL (Web app URL ของ Apps Script ทะเบียนจำลอง)"
ask registrar-key REGISTRAR_KEY "REGISTRAR_KEY (ต้องตรงกับใน Apps Script)"
