(function () {
  const mount = document.getElementById("site-footer");
  if (!mount) return;

  const root = document.body.dataset.root || "./";

  mount.innerHTML = `
    <footer class="site-footer">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="${root}index.html" class="logo">
            <img class="logo-icon" src="${root}src/assets/images/cstu_logo.png" width="42" height="42" alt="CSTU">
          </a>
          <p>
            อาคารบรรยายรวม 2 คณะวิทยาศาสตร์และเทคโนโลยี<br>
            มหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต ปทุมธานี 12120
          </p>
        </div>
        <div class="footer-col">
          <h4>เกี่ยวกับสาขาวิชา</h4>
          <ul>
            <li><a href="#">หลักสูตร</a></li>
            <li><a href="#">คณาจารย์</a></li>
            <li><a href="#">บุคลากร</a></li>
            <li><a href="#">ติดต่อสาขาวิชา</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>หลักสูตร</h4>
          <ul>
            <li><a href="#">ปริญญาตรี</a></li>
            <li><a href="#">ปริญญาโท</a></li>
            <li><a href="#">ปริญญาเอก</a></li>
            <li><a href="#">แผนการศึกษา</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>ติดต่อ</h4>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="contact-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="#222" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.6 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.17a2 2 0 0 1 2.11-.45c.85.28 1.73.48 2.63.6A2 2 0 0 1 22 16.92z"/></svg>
              <span>02-986-9157</span>
            </div>
            <div class="contact-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="#222" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <a href="https://cs.sci.tu.ac.th" target="_blank">https://cs.sci.tu.ac.th</a>
            </div>
            <div class="contact-item">
              <svg viewBox="0 0 24 24" fill="#222"><path d="M22 12a10 10 0 1 0-11.6 9.87v-6.98H7.9V12h2.5V9.8c0-2.47 1.47-3.84 3.72-3.84 1.08 0 2.2.19 2.2.19v2.43h-1.24c-1.22 0-1.6.76-1.6 1.54V12h2.72l-.44 2.89h-2.28v6.98A10 10 0 0 0 22 12z"/></svg>
              <span>ศูนย์รับสมัครนักศึกษา วิทยาการคอมพิวเตอร์ มหาวิทยาลัยธรรมศาสตร์</span>
            </div>
          </div>
        </div>
      </div>
      <hr class="footer-divider">
      <div class="footer-bottom">
        Copyright © 2020 Faculty of Science and Technology – Thammasat University. All rights reserved.
      </div>
    </footer>
  `;
})();
