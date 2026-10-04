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
      <nav class="main-nav">
        <a href="#">เกี่ยวกับ CSTU</a>
        <a href="${root}index.html" class="${page === "programs" ? "active" : ""}">หลักสูตร</a>
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
})();
