(function () {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const root = document.body.dataset.root || "./";
  const page = document.body.dataset.page || "programs";

  const personIcon = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.25"></circle>
      <path d="M5.5 20c.65-3.15 3.15-5.1 6.5-5.1s5.85 1.95 6.5 5.1"></path>
    </svg>`;
  const logoutIcon = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10 5H5.75A1.75 1.75 0 0 0 4 6.75v10.5C4 18.22 4.78 19 5.75 19H10"></path>
      <path d="M13 8l4 4-4 4M17 12H8"></path>
    </svg>`;
  const homeIcon = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"></path>
    </svg>`;
  const capIcon = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m2.5 9.4 9.5-5 9.5 5-9.5 5-9.5-5Z"></path>
      <path d="M6 11.3v4.1c2.9 2.9 9.1 2.9 12 0v-4.1"></path>
    </svg>`;
  const documentIcon = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 2.75h8.5L19 7.25V21.25H6a1 1 0 0 1-1-1v-16.5a1 1 0 0 1 1-1Z"></path>
      <path d="M14 2.75v4.5h5M8.5 12h7M8.5 15.5h7"></path>
    </svg>`;
  const questionIcon = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M9.7 9a2.45 2.45 0 1 1 4.05 1.86c-1.3 1.05-1.75 1.55-1.75 3.14M12 17.1h.01"></path>
    </svg>`;

  mount.innerHTML = `
    <header class="site-header">
      <a href="${root}index.html" class="logo" aria-label="หน้าหลัก CSTU">
        <img class="logo-icon" src="https://my-website-assets-cs361.s3.amazonaws.com/images/cstu_logo.png" alt="Computer Science Thammasat University">
      </a>
      <button class="nav-toggle" type="button" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="main-nav">
        <span></span><span></span><span></span>
      </button>
      <nav class="main-nav" id="main-nav">
        <a href="${root}index.html" data-nav="home" class="${page === "home" ? "active" : ""}">เกี่ยวกับ CSTU</a>
        <a href="${root}index.html#programs" data-nav="programs" class="${page === "programs" ? "active" : ""}">หลักสูตร</a>
        <a href="${root}pages/graduation-requirements.html" class="${page === "graduation" ? "active" : ""}">เงื่อนไขการสำเร็จการศึกษา</a>
        <a href="${root}pages/course-search.html" class="${page === "course-search" ? "active" : ""}">ค้นหารายวิชา</a>
        <a href="${root}pages/curriculum-compare.html" class="${page === "curriculum-compare" ? "active" : ""}">เปรียบเทียบหลักสูตร</a>
        <a href="${root}pages/faq.html" class="${page === "faq" ? "active" : ""}">FAQ</a>
        <a href="#contact">ติดต่อ</a>
      </nav>
      <div class="header-right">
        <div class="header-auth">
          <a class="header-auth__login" href="${root}pages/login.html">
            <span class="header-auth__avatar header-auth__avatar--guest">${personIcon}</span>
            <span>เข้าสู่ระบบ</span>
          </a>
          <button class="header-auth__menu" type="button" aria-expanded="false" aria-controls="account-menu" hidden>
            <span class="header-auth__avatar" aria-hidden="true"></span>
            <span class="header-auth__user"></span>
            <svg class="header-auth__chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>
          </button>
          <div id="account-menu" class="header-auth__dropdown" hidden>
            <a class="header-auth__link header-auth__link--active" href="${root}pages/student-dashboard.html">${homeIcon}<span>หน้าของนักศึกษา</span></a>
            <a class="header-auth__link" href="${root}pages/graduation-check.html">${capIcon}<span>ตรวจสอบการจบของฉัน</span></a>
            <a class="header-auth__link" href="${root}pages/transcript.html">${documentIcon}<span>ผลการเรียนของฉัน</span></a>
            <a class="header-auth__link" href="${root}pages/faq.html">${questionIcon}<span>FAQ</span></a>
            <div class="header-auth__divider"></div>
            <button class="header-auth__profile" type="button">${personIcon}<span>ข้อมูลส่วนตัว</span></button>
            <button class="header-auth__logout" type="button">${logoutIcon}<span>ออกจากระบบ</span></button>
          </div>
        </div>
      </div>
    </header>
    <div class="logout-modal" hidden>
      <section class="logout-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
        <button class="logout-modal__close" type="button" aria-label="ปิดหน้าต่าง">×</button>
        <div class="logout-modal__icon">${logoutIcon}</div>
        <h2 id="logout-title">ออกจากระบบ</h2>
        <p>คุณต้องการออกจากระบบใช่หรือไม่</p>
        <div class="logout-modal__actions">
          <button class="logout-modal__cancel" type="button">ยกเลิก</button>
          <button class="logout-modal__confirm" type="button">ออกจากระบบ</button>
        </div>
      </section>
    </div>
  `;

  const header = mount.querySelector(".site-header");
  const toggle = mount.querySelector(".nav-toggle");
  const nav = mount.querySelector(".main-nav");
  const loginLink = mount.querySelector(".header-auth__login");
  const accountMenu = mount.querySelector(".header-auth__menu");
  const avatar = accountMenu.querySelector(".header-auth__avatar");
  const userLabel = accountMenu.querySelector(".header-auth__user");
  const dropdown = mount.querySelector(".header-auth__dropdown");
  const logoutButton = mount.querySelector(".header-auth__logout");
  const logoutModal = mount.querySelector(".logout-modal");
  const closeModalButton = mount.querySelector(".logout-modal__close");
  const cancelLogoutButton = mount.querySelector(".logout-modal__cancel");
  const confirmLogoutButton = mount.querySelector(".logout-modal__confirm");

  function closeAccountMenu() {
    dropdown.hidden = true;
    accountMenu.setAttribute("aria-expanded", "false");
  }

  function openLogoutModal() {
    closeAccountMenu();
    logoutModal.hidden = false;
    logoutModal.classList.add("is-open");
    closeModalButton.focus();
  }

  function closeLogoutModal() {
    logoutModal.classList.remove("is-open");
    logoutModal.hidden = true;
    accountMenu.focus();
  }

  async function signOut() {
    if (window.Auth) await Auth.logout(); // ล้าง token + แจ้ง Cognito
    // Add a harmless query string so logging out from index.html always reloads its Header state.
    window.location.assign(`${root}index.html?logout=1`);
  }

  // อ่านผู้ใช้จาก token จริงของ Cognito (ผ่าน auth.js)
  const me = window.Auth && Auth.isLoggedIn() ? Auth.getUser() : null;
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
  const fullName = me
    ? (me.claims?.name || me.name || me.username || "").trim()
    : isPreview
      ? "Wanwisa Janthakham"
      : "";

  // ชื่อต้นโดยตัดคำนำหน้าออก เช่น "นางสาวชวัลรัตน์ ภาคอารีย์" -> "ชวัลรัตน์"
  function givenName(name) {
    const noTitle = name.replace(/^(นางสาว|น\.ส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|Mr\.?|Mrs\.?|Miss|Ms\.?)\s*/i, "");
    return noTitle.split(/\s+/)[0] || name;
  }
  // ข้อความใน header: ชื่อต้น ถ้ายาวเกินตัดด้วย "…" (กันเบียดเมนู)
  const shortLabel = (name, max = 12) => {
    const g = givenName(name);
    return g.length > max ? g.slice(0, max) + "…" : g;
  };
  // ตัวอักษรในวงกลม: ข้ามสระนำหน้า (เ แ โ ใ ไ) เอาพยัญชนะ/ตัวอักษรแรกของชื่อต้น
  const initialOf = (name) => (givenName(name).match(/[ก-ฮA-Za-z0-9]/) || [name.charAt(0)])[0].toUpperCase();

  if (fullName) {
    loginLink.hidden = true;
    accountMenu.hidden = false;
    avatar.textContent = initialOf(fullName);
    userLabel.textContent = me?.shortName || (isPreview ? "Wanwisa.j" : shortLabel(fullName));
    accountMenu.title = fullName; // เอาเมาส์ชี้เพื่อดูชื่อเต็ม
  }

  accountMenu.addEventListener("click", () => {
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    accountMenu.setAttribute("aria-expanded", String(!isOpen));
  });

  logoutButton.addEventListener("click", openLogoutModal);
  closeModalButton.addEventListener("click", closeLogoutModal);
  cancelLogoutButton.addEventListener("click", closeLogoutModal);
  confirmLogoutButton.addEventListener("click", signOut);

  logoutModal.addEventListener("click", (event) => {
    if (event.target === logoutModal) closeLogoutModal();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-auth")) closeAccountMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAccountMenu();
      if (!logoutModal.hidden) closeLogoutModal();
    }
  });

  function setMenuOpen(open) {
    header.classList.toggle("site-header--open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "ปิดเมนู" : "เปิดเมนู");
  }

  toggle.addEventListener("click", () => {
    setMenuOpen(!header.classList.contains("site-header--open"));
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });

  if (page !== "home") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomeNav);
  } else {
    initHomeNav();
  }

  function initHomeNav() {
    const programs = document.getElementById("programs");
    if (!programs) return;

    const homeLink = nav.querySelector('[data-nav="home"]');
    const programsLink = nav.querySelector('[data-nav="programs"]');

    function updateActive() {
      const inPrograms = programs.getBoundingClientRect().top <= window.innerHeight * 0.4;
      homeLink.classList.toggle("active", !inPrograms);
      programsLink.classList.toggle("active", inPrograms);
    }

    homeLink.addEventListener("click", (event) => {
      event.preventDefault();
      history.replaceState(null, "", location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("load", updateActive);
    updateActive();
  }
})();
