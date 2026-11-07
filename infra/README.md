# V5 — Infrastructure as Code (AWS SAM)

ระบบทั้งหมดอยู่ใน `template.yaml` ไฟล์เดียว สร้าง / อัปเดต / ลบ ได้ด้วยคำสั่ง ไม่ต้องตั้งค่าใน Console

| ส่วน | อยู่ที่ |
|---|---|
| DynamoDB 16 ตาราง (+ GSI `advisor-index`, TTL ของ LoginAttempts) | `template.yaml` |
| IAM role ของ Lambda (สิทธิ์เฉพาะตารางของ stack) | `template.yaml` |
| Lambda 11 ตัว | `template.yaml` + โค้ดใน `src/` |
| Cognito User Pool, 4 groups, app client, custom auth triggers | `template.yaml` |
| HTTP API stage `prod`, 20 routes, JWT authorizer, CORS | `template.yaml` |
| EventBridge sync ทะเบียนทุกวัน 08:00 | `template.yaml` |
| ค่าลับ (TU key, GAS URL, registrar key) | SSM Parameter Store ← `scripts/put_secrets.sh` |
| ข้อมูลตั้งต้น + บัญชี mock | `scripts/bootstrap.sh` |
| Deploy อัตโนมัติเมื่อ push เข้า main | `.github/workflows/deploy-infra.yml` |
| หน้าเว็บ | Amplify Hosting เชื่อม GitHub (deploy อัตโนมัติเมื่อ push) |

ชื่อทรัพยากรทุกตัวขึ้นต้นด้วยชื่อ stack (`cstu-v5-...`) จึงสร้างหลาย environment ในบัญชีเดียวได้ เช่น `cstu-v5` (หลัก) และ `cstu-v5-dev` (ทดสอบ)

## เครื่องมือที่ต้องมี (ครั้งเดียว)
AWS CLI v2 (ตั้ง `aws configure` แล้ว), Python 3 + boto3, และ SAM CLI:
```bash
curl -sL https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip -o sam.zip
unzip -q sam.zip -d sam-installation && sudo ./sam-installation/install && rm -rf sam.zip sam-installation
sam --version
```

## สร้างระบบใหม่ทั้งหมด (4 คำสั่ง)
```bash
cd infra
bash scripts/put_secrets.sh                 # ครั้งแรกเท่านั้น
sam build && sam deploy                     # สร้าง/อัปเดต stack cstu-v5
MOCK_PASSWORD='...' bash scripts/bootstrap.sh cstu-v5
```
ท้าย `sam deploy` จะแสดง `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `EnsureUserUrl` สำหรับใส่ใน `src/js/config.js` ของหน้าเว็บ

## Environment ทดสอบ
```bash
sam build && sam deploy --config-env dev
MOCK_PASSWORD='...' bash scripts/bootstrap.sh cstu-v5-dev
sam delete --stack-name cstu-v5-dev          # ลบทั้ง environment
```

## แก้ระบบ
แก้ `template.yaml` หรือโค้ดใน `src/` → commit → push เข้า `main` → GitHub Actions build และ deploy ให้เอง
ห้ามแก้ทรัพยากรใน Console โดยตรง (จะถูกทับตอน deploy ครั้งถัดไป) ตรวจว่ามีการแก้ด้วยมือหรือไม่ได้ที่ CloudFormation → stack → **Stack actions → Detect drift**

## ตั้งค่า GitHub Actions (ครั้งเดียว)
Repo → Settings → Secrets and variables → Actions → New repository secret
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## หมายเหตุ
- ลบ stack แล้วข้อมูลในตารางหายด้วย ข้อมูลส่วนใหญ่ดึงกลับได้ด้วย `bootstrap.sh` ยกเว้นสิ่งที่ Admin แก้และประวัติการแก้ไข
- ค่าลับเก็บเป็น SSM แบบ String และจะเห็นได้ใน environment ของ Lambda ใน Console
- เปลี่ยนค่าลับด้วย `put_secrets.sh` แล้วต้อง `sam deploy` ใหม่
