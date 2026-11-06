// ===== ค่าตั้งต้นของระบบ (ไม่ใช่ความลับ ใส่ในหน้าบ้านได้) =====
// ห้ามใส่ TU_APP_KEY หรือรหัสผ่านใดๆ ในไฟล์นี้
window.APP_CONFIG = {
  region: "ap-southeast-2",
  userPoolId: "ap-southeast-2_XGpZESWeV",
  clientId: "3uubmn76ci8mqnikobur0717t5",
  apiBase: "https://3r0xvwx60k.execute-api.ap-southeast-2.amazonaws.com/prod/api",

  // รูปแบบ Header: "Bearer" -> "Authorization: Bearer <token>"
  // ถ้าทดสอบแล้ว API Gateway ตอบ 401 ทั้งที่ token ถูก ให้ลองเปลี่ยนเป็น "" (ส่ง token เปล่าๆ)
  authScheme: "Bearer",

  // token ที่จะแนบ: เพื่อนตั้ง Authorizer ไว้ที่ IdToken
  tokenType: "idToken", // หรือ "accessToken"

  loginPage: "pages/login.html",

  // URL ของ Lambda EnsureUser (POST, body: {username, password}) -- ขอจากเพื่อนคนที่ 4
  // ตัวอย่าง: "https://3r0xvwx60k.execute-api.ap-southeast-2.amazonaws.com/prod/ensure-user"
  ensureUserUrl: "https://3r0xvwx60k.execute-api.ap-southeast-2.amazonaws.com/prod/auth/ensure-user",
};
