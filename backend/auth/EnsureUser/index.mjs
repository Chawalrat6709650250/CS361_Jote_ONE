// Lambda: EnsureUser (เวอร์ชันมีกันเดารหัส)
// หน้าที่: เช็กรหัสกับ TU API ก่อน ถ้าถูกและยังไม่มี user ใน Cognito ให้สร้างให้อัตโนมัติ
// เรียกจากหน้าเว็บ "ก่อน" InitiateAuth (CUSTOM_AUTH)
//
// Environment variables:
//   USER_POOL_ID = us-east-1_xxxxxxx
//   TU_APP_KEY   = Application-Key ของ TU API

import {
    CognitoIdentityProviderClient,
    AdminUpdateUserAttributesCommand,
    AdminGetUserCommand,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminAddUserToGroupCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;
const TU_APP_KEY = process.env.TU_APP_KEY;

// ===== LOCKOUT START (โค้ดชุดเดียวกับใน VerifyAuthResponse) =====
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ATTEMPTS_TABLE = "LoginAttempts";
const MAX_FAILS = 5;            // ผิดได้กี่ครั้ง
const WINDOW_SEC = 15 * 60;     // ภายในกี่วินาที
const LOCK_SEC = 15 * 60;       // ล็อกนานเท่าไร
const nowSec = () => Math.floor(Date.now() / 1000);
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;

const getAttempt = async (username) =>
    (await ddb.send(new GetCommand({ TableName: ATTEMPTS_TABLE, Key: { username } }))).Item;

// คืนจำนวนวินาทีที่ยังถูกล็อก (0 = ไม่ล็อก)
const lockRemaining = (item) => (item?.lock_until > nowSec() ? item.lock_until - nowSec() : 0);

const recordFail = async (username, item) => {
    const now = nowSec();
    const fresh = !item || item.window_end <= now;
    const count = fresh ? 1 : item.fail_count + 1;
    const locked = count >= MAX_FAILS;
    await ddb.send(new PutCommand({
        TableName: ATTEMPTS_TABLE,
        Item: {
            username,
            fail_count: locked ? 0 : count,
            window_end: fresh ? now + WINDOW_SEC : item.window_end,
            lock_until: locked ? now + LOCK_SEC : 0,
            expires_at: now + Math.max(WINDOW_SEC, LOCK_SEC) + 60   // TTL ให้ DynamoDB ลบเอง
        }
    }));
    return locked;
};

const clearFails = (username) =>
    ddb.send(new DeleteCommand({ TableName: ATTEMPTS_TABLE, Key: { username } }));
// ===== LOCKOUT END =====

const verifyWithTU = async (username, password) => {
    const res = await fetch("https://restapi.tu.ac.th/api/v1/auth/Ad/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Application-Key": TU_APP_KEY },
        body: JSON.stringify({ UserName: username, PassWord: password })
    });
    const data = await res.json().catch(() => null);
    return res.status === 200 && data?.status === true ? data : null;
};

const userExists = async (username) => {
    try {
        await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
        return true;
    } catch (e) {
        if (e.name === "UserNotFoundException") return false;
        throw e;
    }
};

// แปลงประเภทบัญชีจาก TU API เป็นกลุ่มใน Cognito
// ค่าที่ไม่รู้จัก → null (ไม่สร้างบัญชี ไม่ให้สิทธิ์ Staff โดยปริยาย)
const GROUP_BY_TU_TYPE = { student: "Student", employee: "Staff" };
const groupFor = (tuData) => GROUP_BY_TU_TYPE[String(tuData?.type || "").toLowerCase()] || null;

const createUser = async (username, group) => {
    await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        MessageAction: "SUPPRESS"
    }));
    await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        Password: crypto.randomBytes(24).toString("base64") + "Aa1!",
        Permanent: true
    }));
    await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID, Username: username, GroupName: group
    }));
};

// ชื่อที่จะแสดง: ใช้ชื่อไทยก่อน ถ้าไม่มีใช้ชื่ออังกฤษ
const displayNameOf = (tuData) =>
    String(tuData?.displayname_th || tuData?.displayname_en || "").trim();

// บันทึกชื่อจาก TU ลง Cognito → ไปโผล่ใน ID token (claim "name")
// ทำทุกครั้งที่ login เพื่อให้ user เก่าได้ชื่อด้วย และชื่ออัปเดตตาม TU เสมอ
const syncName = async (username, tuData) => {
    const name = displayNameOf(tuData);
    if (!name) return;
    await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [{ Name: "name", Value: name }]
    }));
};

export const handler = async (event) => {
    try {
        let body;
        try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
        const username = String(body.username || "").trim();
        const password = String(body.password || "");

        if (!USERNAME_RE.test(username) || !password || password.length > 128) {
            return respond(400, { success: false, message: "Invalid username or password format" });
        }

        // 0) ถูกล็อกอยู่ไหม — ถ้าล็อกจะไม่ส่งไปถาม TU เลย
        const attempt = await getAttempt(username);
        const remain = lockRemaining(attempt);
        if (remain) {
            return respond(429, { success: false, message: "Too many failed attempts", retry_after_sec: remain });
        }

        // 1) เช็กกับ TU
        const tuData = await verifyWithTU(username, password);
        if (!tuData) {
            const locked = await recordFail(username, attempt);
            return locked
                ? respond(429, { success: false, message: "Too many failed attempts", retry_after_sec: LOCK_SEC })
                : respond(401, { success: false, message: "Invalid credentials" });
        }
        await clearFails(username);

        // 2) ยังไม่มีใน Cognito → สร้าง (เฉพาะประเภทบัญชีที่รู้จัก)
        const exists = await userExists(username);
        if (!exists) {
            const group = groupFor(tuData);
            if (!group) {
                console.warn(`Unknown TU account type for ${username}: ${JSON.stringify(tuData?.type)}`);
                return respond(403, { success: false, message: "Account type not supported" });
            }
            await createUser(username, group);
        }

        // ชั่วคราว: ดูว่า TU ส่ง field อะไรมาบ้าง (log แค่ชื่อ field ไม่ log ค่า)
        console.log("TU fields:", Object.keys(tuData));

        await syncName(username, tuData);

        return respond(200, { success: true, created: !exists, name: displayNameOf(tuData) });
    } catch (err) {
        console.error("EnsureUser error:", err);
        return respond(500, { success: false, message: "Internal error" });
    }
};

const respond = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body)
});
