// ===== auth.js =====
// จัดการ Login / Logout / Token ฝั่งหน้าบ้าน (Cognito CUSTOM_AUTH ผ่าน fetch ตรง ไม่ต้องใช้ไลบรารี)
// Flow: InitiateAuth(CUSTOM_AUTH, USERNAME) -> RespondToAuthChallenge(ANSWER = password)
//       -> ได้ IdToken / AccessToken / RefreshToken กลับมา
(function () {
  const C = window.APP_CONFIG;
  const KEY = "cstu_auth";
  const ENDPOINT = `https://cognito-idp.${C.region}.amazonaws.com/`;

  // ---------- เรียก Cognito ----------
  async function cognito(target, body) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || "Cognito error");
      err.code = (data.__type || "").split("#").pop();
      throw err;
    }
    return data;
  }

  function friendlyError(err) {
    switch (err.code) {
      case "NotAuthorizedException":
        return "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
      case "UserNotFoundException":
        return "ไม่พบผู้ใช้นี้ในระบบ (ติดต่อผู้ดูแลระบบ)";
      case "InvalidParameterException":
      case "InvalidLambdaResponseException":
      case "UserLambdaValidationException":
        return "ระบบยืนยันตัวตนขัดข้อง กรุณาลองใหม่ภายหลัง";
      case "TooManyRequestsException":
      case "LimitExceededException":
        return "ลองหลายครั้งเกินไป กรุณารอสักครู่";
      default:
        return err.name === "TypeError"
          ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต"
          : "เข้าสู่ระบบไม่สำเร็จ: " + (err.message || err.code || "unknown");
    }
  }

  // ---------- เก็บ / อ่าน token (sessionStorage: ปิดแท็บแล้วหาย) ----------
  function save(tokens) {
    sessionStorage.setItem(KEY, JSON.stringify(tokens));
  }
  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  }
  function clear() {
    sessionStorage.removeItem(KEY);
  }

  // ---------- ถอดรหัส JWT (อ่านอย่างเดียว ไม่ได้ตรวจลายเซ็น — ตรวจจริงที่ API Gateway) ----------
  function decode(jwt) {
    try {
      const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(b64).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  const isExpired = (jwt, skewSec = 30) => {
    const p = decode(jwt);
    return !p || !p.exp || p.exp * 1000 <= Date.now() + skewSec * 1000;
  };

  // ---------- EnsureUser: เช็ครหัสกับ TU + สร้าง user ใน Cognito ให้ถ้ายังไม่มี ----------
  // ต้องเรียก "ก่อน" InitiateAuth เสมอ (เพื่อให้คนที่ยังไม่เคยล็อกอินมี user ใน pool ก่อน)
  async function ensureUser(username, password) {
    if (!C.ensureUserUrl) {
      console.warn("[auth] ยังไม่ได้ตั้ง ensureUserUrl ใน config.js -- ข้ามขั้นสร้าง user");
      return;
    }
    let res;
    try {
      res = await fetch(C.ensureUserUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต หรือแจ้งผู้ดูแล (อาจติด CORS)");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    if (res.status === 400) throw new Error("กรุณากรอกรหัสผู้ใช้และรหัสผ่านให้ครบ");
        if (res.status === 429) {
      const min = Math.ceil((data.retry_after_sec || 900) / 60);
      throw new Error(`ใส่รหัสผิดหลายครั้ง กรุณาลองใหม่ในอีก ${min} นาที`);
    }
    if (res.status === 403) throw new Error("ประเภทบัญชีนี้ยังไม่รองรับในระบบ");
    if (!res.ok || data.success === false) {
      console.error("[auth] EnsureUser failed:", res.status, data);
      throw new Error("ระบบตรวจสอบบัญชี TU ขัดข้อง กรุณาลองใหม่ภายหลัง");
    }
  }

  // ---------- Login ----------
  async function login(username, password) {
    username = String(username || "").trim();
    if (!username || !password) throw new Error("กรุณากรอกรหัสผู้ใช้และรหัสผ่านให้ครบ");
    try {
      await ensureUser(username, password);
      const init = await cognito("InitiateAuth", {
        AuthFlow: "CUSTOM_AUTH",
        ClientId: C.clientId,
        AuthParameters: { USERNAME: username },
      });
      if (init.ChallengeName !== "CUSTOM_CHALLENGE") {
        throw Object.assign(new Error("Unexpected challenge: " + init.ChallengeName), {
          code: "InvalidParameterException",
        });
      }
      const done = await cognito("RespondToAuthChallenge", {
        ClientId: C.clientId,
        ChallengeName: "CUSTOM_CHALLENGE",
        Session: init.Session,
        ChallengeResponses: { USERNAME: username, ANSWER: password },
      });
      if (!done.AuthenticationResult) {
        // Cognito ส่ง challenge ซ้ำ = รหัสผ่านผิด (DefineAuthChallenge ให้ลองใหม่)
        throw Object.assign(new Error("wrong password"), { code: "NotAuthorizedException" });
      }
      const r = done.AuthenticationResult;
      save({
        idToken: r.IdToken,
        accessToken: r.AccessToken,
        refreshToken: r.RefreshToken,
        username,
      });
      return getUser();
    } catch (err) {
      console.error("[auth] login failed:", err.code, "|", err.message);
      throw new Error(err.code || err.name === "TypeError" ? friendlyError(err) : err.message);
    }
  }

  // ---------- Logout ----------
  async function logout() {
    const t = load();
    clear(); // ล้างฝั่งเราก่อนเสมอ
    if (t?.accessToken) {
      try {
        await cognito("GlobalSignOut", { AccessToken: t.accessToken }); // best-effort
      } catch {
        /* token หมดอายุแล้วก็ไม่เป็นไร */
      }
    }
  }

  // ---------- ขอ token ใหม่ด้วย refresh token ----------
  async function refresh() {
    const t = load();
    if (!t?.refreshToken) return null;
    try {
      const r = (
        await cognito("InitiateAuth", {
          AuthFlow: "REFRESH_TOKEN_AUTH",
          ClientId: C.clientId,
          AuthParameters: { REFRESH_TOKEN: t.refreshToken },
        })
      ).AuthenticationResult;
      const next = { ...t, idToken: r.IdToken, accessToken: r.AccessToken };
      save(next);
      return next;
    } catch {
      clear();
      return null;
    }
  }

  // ---------- เรียกใช้ ----------
  // คืน token ที่ยังไม่หมดอายุ (ถ้าหมดจะ refresh ให้เอง) หรือ null
  async function getToken() {
    let t = load();
    if (!t) return null;
    if (isExpired(t[C.tokenType])) t = await refresh();
    return t ? t[C.tokenType] : null;
  }

  // เช็คแบบเร็ว (sync) สำหรับ UI: มี session และ refresh token อยู่
  function isLoggedIn() {
    const t = load();
    return !!(t && (t.refreshToken || !isExpired(t.idToken)));
  }

  // ข้อมูลผู้ใช้จาก IdToken (ไว้ทำ V3 บทบาท: ดู groups)
  function getUser() {
    const t = load();
    const p = t && decode(t.idToken);
    if (!p) return null;
    return {
      username: p["cognito:username"] || t.username,
      groups: p["cognito:groups"] || [],
      claims: p,
    };
  }
  const hasRole = (role) => !!getUser()?.groups.includes(role);

  // ใส่ไว้บนสุดของหน้าที่ต้อง login:  Auth.requireLogin();
  function requireLogin(roles) {
    const root = document.body.dataset.root || "./";
    const ok = isLoggedIn() && (!roles || roles.some(hasRole));
    if (!ok) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace(`${root}${C.loginPage}?next=${next}`);
    }
    return ok;
  }

  // ---------- เรียก API Gateway พร้อมแนบ token ----------
  // apiFetch("courses", { curriculum_id: "BSC-CS-2566" }, { auth: "required" | "optional" })
  //   required = ต้อง login (ไม่มี token -> ไปหน้า login, ได้ 401 -> ล้าง session แล้วไปหน้า login)
  //   optional = มี token ก็แนบ ไม่มีก็เรียกแบบ public (ค่าเริ่มต้น)
  async function apiFetch(resource, params = {}, { auth = "optional", signal } = {}) {
    const url = new URL(C.apiBase);
    url.searchParams.set("resource", resource);
    Object.entries(params).forEach(([k, v]) => v != null && v !== "" && url.searchParams.set(k, v));

    const headers = { Accept: "application/json" };
    const token = await getToken();
    if (token) headers.Authorization = C.authScheme ? `${C.authScheme} ${token}` : token;
    else if (auth === "required") {
      requireLogin();
      throw new Error("ต้องเข้าสู่ระบบก่อน");
    }

    const res = await fetch(url, { headers, signal });
    if (res.status === 401 || res.status === 403) {
      if (auth === "required") {
        clear();
        requireLogin();
      }
      throw new Error(res.status === 401 ? "เซสชันหมดอายุหรือไม่ได้รับอนุญาต" : "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  window.Auth = { login, logout, getToken, isLoggedIn, getUser, hasRole, requireLogin, apiFetch };
})();
