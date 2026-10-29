(() => {
  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const passwordToggle = document.getElementById("password-toggle");
  const submitButton = document.getElementById("login-submit");
  const status = document.getElementById("login-status");

  function setFieldError(input, message) {
    const group = input.closest(".login-form__group");
    const error = group.querySelector(".login-form__error");
    group.classList.toggle("is-invalid", Boolean(message));
    error.textContent = message;
  }

  function validate() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    setFieldError(
      usernameInput,
      username ? "" : "กรุณากรอกชื่อผู้ใช้หรือรหัสประจำตัวนักศึกษา",
    );
    setFieldError(passwordInput, password ? "" : "กรุณากรอกรหัสผ่าน");
    return Boolean(username && password);
  }

  passwordToggle.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    passwordToggle.setAttribute(
      "aria-label",
      isHidden ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน",
    );
  });

  [usernameInput, passwordInput].forEach((input) => {
    input.addEventListener("input", () => setFieldError(input, ""));
  });

  // กลับไปหน้าที่ผู้ใช้ตั้งใจจะเข้า (รับเฉพาะ path ในเว็บเรา กัน open redirect)
  function nextUrl() {
    const n = new URLSearchParams(window.location.search).get("next");
    if (!n) return "../index.html";

    try {
      const currentPage = new URL(window.location.href);
      const nextPage = new URL(n, currentPage);
      const isSameSite =
        nextPage.protocol === currentPage.protocol &&
        nextPage.host === currentPage.host;

      return isSameSite ? nextPage.href : "../index.html";
    } catch {
      return "../index.html";
    }
  }

  if (window.Auth && Auth.isLoggedIn()) window.location.replace(nextUrl());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.className = "login-form__status";
    status.textContent = "";
    if (!validate()) return;

    submitButton.disabled = true;
    submitButton.textContent = "กำลังเข้าสู่ระบบ...";
    status.classList.add("is-loading");
    status.textContent = "กำลังตรวจสอบข้อมูล...";

    try {
      // ส่ง username/password ไปให้ Cognito -> Lambda -> TU API ตรวจจริง
      await Auth.login(usernameInput.value, passwordInput.value);
      window.location.replace(nextUrl());
    } catch (err) {
      status.className = "login-form__status is-error";
      status.textContent = err.message;
      passwordInput.value = "";
      submitButton.disabled = false;
      submitButton.textContent = "เข้าสู่ระบบ";
    }
  });
})();
