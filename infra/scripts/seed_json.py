"""
ใส่ข้อมูลจากไฟล์ JSON ลงตาราง DynamoDB
  python3 seed_json.py <ตาราง> <ไฟล์.json> [ไฟล์.json ...]
ไฟล์หนึ่งไฟล์เป็น object เดียว (1 item) หรือ array ของ object ก็ได้
"""
import sys, json, boto3
from decimal import Decimal

if len(sys.argv) < 3:
    sys.exit("usage: python3 seed_json.py <table> <file.json> [...]")

table = boto3.resource("dynamodb").Table(sys.argv[1])
items = []
for path in sys.argv[2:]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f, parse_float=Decimal)
    items += data if isinstance(data, list) else [data]

with table.batch_writer() as w:
    for it in items:
        w.put_item(Item=it)
print(f"เขียนลง {sys.argv[1]} แล้ว {len(items)} รายการ")
