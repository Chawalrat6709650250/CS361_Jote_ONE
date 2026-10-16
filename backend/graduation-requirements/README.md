# Graduation Requirements API

ไฟล์ชุดนี้เพิ่ม endpoint สำหรับข้อมูลเงื่อนไขการสำเร็จการศึกษาแบบที่ Frontend แสดงเป็นการ์ดและ Accordion ได้โดยตรง

## DynamoDB table

สร้างตาราง `GraduationRequirementsData` โดยกำหนด key ดังนี้

| Key             | Type                   | หน้าที่                            |
| --------------- | ---------------------- | ---------------------------------- |
| `curriculum_id` | String (partition key) | รหัสหลักสูตร เช่น `BSC-CS-2566`    |
| `pathway_id`    | String (sort key)      | รหัสวิชาเอก เช่น `BSC-CS-2566-ACS` |

นำข้อมูลจากไฟล์ JSON แต่ละไฟล์เข้าเป็นหนึ่ง item ในตาราง เช่น

- `BSC-CS-2566-ACS.json` - คอมพิวเตอร์ประยุกต์ ปี 2566
- `BSC-CNC-2568-CNC.json` - คอมพิวเตอร์เครือข่ายและความปลอดภัยทางไซเบอร์ ปี 2568

## Lambda environment variable

กำหนด environment variable:

```text
GRADUATION_REQUIREMENTS_TABLE=GraduationRequirementsData
```

Lambda role ต้องได้รับสิทธิ์ `dynamodb:GetItem` สำหรับตารางนี้ และต้องไม่มี Service Control Policy ที่ deny การอ่านตาราง

## Endpoint

```text
GET /prod/api?resource=graduation_requirements&curriculum_id=BSC-CS-2566&pathway_id=BSC-CS-2566-ACS
```

ส่ง JSON ที่มี `categories` และ `graduation_criteria` กลับไปให้ Frontend โดยมี CORS headers สำหรับเรียกจากเว็บไซต์

## เชื่อมกับ Lambda หลักของทีม

หาก Lambda หลักใช้ router ตามค่า `resource` ให้นำ logic ใน `handler.mjs` ไปเพิ่มเป็นกรณี `graduation_requirements` หรือ import handler นี้ใน router เดิม แล้ว deploy ใหม่
