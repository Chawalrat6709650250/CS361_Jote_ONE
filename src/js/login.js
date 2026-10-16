(() => {
  const sessionKey = "cstu.loginUi.user";
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.className = "login-form__status";
    status.textContent = "";
    if (!validate()) return;

    // Demo only: Cognito integration in V3 will replace this simulated response.
    submitButton.disabled = true;
    submitButton.textContent = "กำลังเข้าสู่ระบบ...";
    status.classList.add("is-loading");
    status.textContent = "กำลังตรวจสอบข้อมูล...";

    window.setTimeout(() => {
      // Never store passwords. This temporary display name lets the Header show Login/Logout states.
      sessionStorage.setItem(sessionKey, usernameInput.value.trim());
      window.location.assign("../index.html");
    }, 700);
  });
})();
