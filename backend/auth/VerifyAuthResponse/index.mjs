// Lambda: VerifyAuthResponse (เวอร์ชันมีกันเดารหัส)
// Cognito trigger: Verify auth challenge response
// Environment variables: TU_APP_KEY

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// ===== LOCKOUT START (โค้ดชุดเดียวกับใน EnsureUser) =====
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ATTEMPTS_TABLE = "LoginAttempts";
const MAX_FAILS = 5;
const WINDOW_SEC = 15 * 60;
const LOCK_SEC = 15 * 60;
const nowSec = () => Math.floor(Date.now() / 1000);

const getAttempt = async (username) =>
    (await ddb.send(new GetCommand({ TableName: ATTEMPTS_TABLE, Key: { username } }))).Item;

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
            expires_at: now + Math.max(WINDOW_SEC, LOCK_SEC) + 60
        }
    }));
    return locked;
};

const clearFails = (username) =>
    ddb.send(new DeleteCommand({ TableName: ATTEMPTS_TABLE, Key: { username } }));
// ===== LOCKOUT END =====

export const handler = async (event) => {
    const username = event.userName;
    const password = event.request.challengeAnswer;
    const tuAppKey = process.env.TU_APP_KEY;

    event.response.answerCorrect = false;

    try {
        // ถูกล็อกอยู่ → ไม่ส่งไปถาม TU
        const attempt = await getAttempt(username);
        if (lockRemaining(attempt)) {
            console.log(`Locked out: ${username}`);
            return event;
        }

        const tuResponse = await fetch("https://restapi.tu.ac.th/api/v1/auth/Ad/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Application-Key": tuAppKey
            },
            body: JSON.stringify({
                "UserName": username,
                "PassWord": password
            })
        });

        const data = await tuResponse.json().catch(() => null);

        if (tuResponse.status === 200 && data?.status === true) {
            event.response.answerCorrect = true;
            await clearFails(username);
            console.log(`Login Success for: ${username}, Type: ${data.type}`);
        } else {
            const locked = await recordFail(username, attempt);
            console.log(`Login Failed for: ${username}${locked ? " (now locked)" : ""}`);
        }
    } catch (error) {
        console.error("Verify error:", error);
        event.response.answerCorrect = false;
    }

    return event;
};
