(function () {
  const form = document.getElementById("loginForm");
  const errEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  // กลับไปหน้าที่ผู้ใช้ตั้งใจจะเข้า (กัน open redirect: รับเฉพาะ path ในเว็บเรา)
  function nextUrl() {
    const n = new URLSearchParams(location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "../index.html";
  }

  if (Auth.isLoggedIn()) location.replace(nextUrl());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "กำลังตรวจสอบ...";
    try {
      await Auth.login(form.username.value, form.password.value);
      location.replace(nextUrl());
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
      form.password.value = "";
    } finally {
      btn.disabled = false;
      btn.textContent = "เข้าสู่ระบบ";
    }
  });
})();
