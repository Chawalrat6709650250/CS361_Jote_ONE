(function () {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const root = document.body.dataset.root || "./";
  const page = document.body.dataset.page || "programs";

  mount.innerHTML = `
    <header class="site-header">
      <a href="${root}index.html" class="logo">
        <img class="logo-icon" src="https://my-website-assets-cs361.s3.amazonaws.com/images/cstu_logo.png" alt="CSTU">
      </a>
      <button class="nav-toggle" type="button" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="main-nav">
        <span></span><span></span><span></span>
      </button>
      <nav class="main-nav" id="main-nav">
        <a href="${root}index.html" data-nav="home" class="${page === "home" ? "active" : ""}">เกี่ยวกับ CSTU</a>
        <a href="${root}index.html#programs" data-nav="programs" class="${page === "programs" ? "active" : ""}">หลักสูตร</a>
        <a href="${root}pages/graduation-requirements.html" class="${page === "graduation" ? "active" : ""}">เงื่อนไขการสำเร็จการศึกษา</a>
        <a href="#">ผลงานและนวัตกรรม</a>
        <a href="#">ติดต่อ</a>
      </nav>
      <div class="header-right">
        <div class="lang-switch">
          <span class="lang-th active" data-lang="th">TH</span>/<span class="lang-en" data-lang="en">EN</span>
        </div>
        <div class="search-wrapper">
          <input type="text" class="search-box" placeholder="ค้นหา...">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="#222" stroke-width="2">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
      </div>
    </header>
  `;

  const header = mount.querySelector(".site-header");
  const toggle = mount.querySelector(".nav-toggle");
  const nav = mount.querySelector(".main-nav");

  function setMenuOpen(open) {
    header.classList.toggle("site-header--open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "ปิดเมนู" : "เปิดเมนู");
  }

  toggle.addEventListener("click", () => {
    setMenuOpen(!header.classList.contains("site-header--open"));
  });

  // ปิดเมนูมือถือเมื่อเลือกลิงก์ (สำคัญสำหรับลิงก์ #programs ที่อยู่หน้าเดียวกัน)
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenuOpen(false);
  });

  // หน้า index: ไฮไลต์ "เกี่ยวกับ CSTU" หรือ "หลักสูตร" ตามตำแหน่งที่เลื่อนอยู่
  // (header.js ถูกโหลดก่อน section#programs จึงต้องรอ DOMContentLoaded)
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

    homeLink.addEventListener("click", (e) => {
      // อยู่หน้า index อยู่แล้ว: เลื่อนกลับขึ้นบนสุดแทนการโหลดหน้าใหม่
      e.preventDefault();
      history.replaceState(null, "", location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("load", updateActive);
    updateActive();
  }
})();
