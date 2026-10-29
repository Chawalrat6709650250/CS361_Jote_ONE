(() => {
  // ข้อมูลตัวอย่าง: เมื่อ API FAQ พร้อม สามารถแทนที่รายการนี้ด้วยข้อมูลจากระบบได้
  const faqs = [
    {
      category: "graduation",
      question: "ต้องมีหน่วยกิตรวมเท่าไรจึงจะจบ?",
      answer: "จำนวนหน่วยกิตขั้นต่ำขึ้นอยู่กับปีหลักสูตรของนักศึกษา กรุณาตรวจสอบที่หน้าเงื่อนไขการสำเร็จการศึกษา หรือหน้าตรวจสอบการจบของฉันหลังเข้าสู่ระบบ",
    },
    {
      category: "graduation",
      question: "วิชาบังคับเรียนคืออะไร?",
      answer: "วิชาบังคับคือรายวิชาที่หลักสูตรกำหนดให้นักศึกษาต้องเรียนและผ่านตามเกณฑ์ จึงจะมีคุณสมบัติครบสำหรับการสำเร็จการศึกษา",
    },
    {
      category: "graduation",
      question: "ถ้าหน่วยกิตไม่ครบ สามารถยื่นขอได้หรือไม่?",
      answer: "ยังไม่สามารถยื่นขอสำเร็จการศึกษาได้จนกว่าจะผ่านเงื่อนไขหน่วยกิตและเงื่อนไขอื่นของหลักสูตรครบถ้วน กรุณาปรึกษาอาจารย์ที่ปรึกษาเพื่อวางแผนการเรียน",
    },
    {
      category: "graduation",
      question: "ตรวจสอบผลการเรียนล่าสุดได้จากที่ไหน?",
      answer: "เมื่อเข้าสู่ระบบแล้ว สามารถดูรายวิชา เกรด และความคืบหน้าตามเงื่อนไขหลักสูตรได้จากเมนูหน้าของนักศึกษา",
    },
    {
      category: "transfer",
      question: "สามารถเทียบหน่วยกิตจากวิชาเลือกเสรีข้ามสาขาได้หรือไม่?",
      answer: "ทำได้ในบางกรณี โดยต้องเป็นไปตามเงื่อนไขของหลักสูตรและได้รับอนุมัติจากหน่วยงานที่เกี่ยวข้อง กรุณาตรวจสอบรายละเอียดก่อนยื่นคำร้อง",
    },
    {
      category: "transfer",
      question: "ต้องเตรียมเอกสารอะไรสำหรับการเทียบโอน?",
      answer: "โดยทั่วไปใช้คำร้องเทียบโอน ผลการเรียนรายวิชา และคำอธิบายรายวิชา ทั้งนี้เอกสารที่ต้องใช้จริงอาจเปลี่ยนตามกรณี",
    },
    {
      category: "transfer",
      question: "ผลการเทียบโอนมีผลต่อ GPAX หรือไม่?",
      answer: "ขึ้นอยู่กับประเภทการเทียบโอนและระเบียบของมหาวิทยาลัย ควรสอบถามเจ้าหน้าที่ทะเบียนก่อนดำเนินการ",
    },
    {
      category: "transfer",
      question: "ยื่นคำร้องเทียบโอนได้ช่วงเวลาใด?",
      answer: "ควรยื่นตามกำหนดการของภาคการศึกษานั้น ๆ โปรดติดตามประกาศจากคณะและสำนักทะเบียน",
    },
    {
      category: "registration",
      question: "ลงทะเบียนเรียนไม่ทันต้องทำอย่างไร?",
      answer: "โปรดตรวจสอบกำหนดการเพิ่ม-ถอนรายวิชา และติดต่ออาจารย์ผู้สอนหรือเจ้าหน้าที่ทะเบียนโดยเร็วที่สุด",
    },
    {
      category: "registration",
      question: "สามารถเพิ่มหรือถอนรายวิชาได้ถึงวันไหน?",
      answer: "วันสุดท้ายของการเพิ่มหรือถอนรายวิชาจะแจ้งไว้ในปฏิทินการศึกษา กรุณาตรวจสอบก่อนดำเนินการทุกครั้ง",
    },
    {
      category: "fees",
      question: "ชำระค่าธรรมเนียมการศึกษาได้อย่างไร?",
      answer: "สามารถตรวจสอบช่องทางและกำหนดชำระเงินจากประกาศของมหาวิทยาลัยหรือระบบทะเบียนนักศึกษา",
    },
    {
      category: "fees",
      question: "มีทุนการศึกษาสำหรับนักศึกษาหรือไม่?",
      answer: "มีทุนหลายประเภทตามคุณสมบัติของผู้สมัคร โปรดติดตามประกาศทุนจากคณะ มหาวิทยาลัย และหน่วยงานผู้ให้ทุน",
    },
  ];

  const categories = [
    { id: "all", label: "ทั้งหมด", icon: "home" },
    { id: "transfer", label: "การเทียบการศึกษา", icon: "cap" },
    { id: "graduation", label: "การสำเร็จการศึกษา", icon: "cap" },
    { id: "registration", label: "การลงทะเบียน", icon: "document" },
    { id: "fees", label: "ค่าเทอม/ทุนการศึกษา", icon: "wallet" },
  ];

  const icons = {
    home: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></svg>',
    cap: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m2.5 9.4 9.5-5 9.5 5-9.5 5-9.5-5Z" /><path d="M6 11.3v4.1c2.9 2.9 9.1 2.9 12 0v-4.1" /></svg>',
    document: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 2.75h8.5L19 7.25V21.25H6a1 1 0 0 1-1-1v-16.5a1 1 0 0 1 1-1Z" /><path d="M14 2.75v4.5h5M8.5 12h7M8.5 15.5h7" /></svg>',
    wallet: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 18V8a1.5 1.5 0 0 1 1.5-1.5Z" /><path d="M3.5 8 16 5.2a1.4 1.4 0 0 1 1.7 1.3M15.5 13h4" /></svg>',
  };

  const categoryList = document.getElementById("faq-category-list");
  const searchInput = document.getElementById("faq-search-input");
  const items = document.getElementById("faq-items");
  const resultStatus = document.getElementById("faq-result-status");
  const breadcrumbHome = document.getElementById("faq-breadcrumb-home");
  const breadcrumbHomeLabel = document.getElementById("faq-breadcrumb-home-label");
  let selectedCategory = "all";

  // FAQ เปิดให้ทุกคนอ่านได้ แต่ผู้ที่ล็อกอินควรย้อนกลับไปหน้าของนักศึกษาได้
  if (window.Auth && Auth.isLoggedIn()) {
    breadcrumbHome.href = "student-dashboard.html";
    breadcrumbHome.setAttribute("aria-label", "กลับหน้าของนักศึกษา");
    breadcrumbHomeLabel.hidden = false;
  }

  function categoryCount(categoryId) {
    return categoryId === "all"
      ? faqs.length
      : faqs.filter((item) => item.category === categoryId).length;
  }

  function renderCategories() {
    categoryList.innerHTML = categories
      .map(
        (category) => `
          <button
            class="faq-category"
            type="button"
            data-category="${category.id}"
            aria-pressed="${category.id === selectedCategory}"
          >
            <span class="faq-category__icon">${icons[category.icon]}</span>
            <span>${category.label} (${categoryCount(category.id)})</span>
          </button>
        `,
      )
      .join("");
  }

  function matchesSearch(item, keyword) {
    const content = `${item.question} ${item.answer}`.toLowerCase();
    return content.includes(keyword.toLowerCase());
  }

  function renderFaqs() {
    const keyword = searchInput.value.trim();
    const visibleFaqs = faqs.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      return matchesCategory && matchesSearch(item, keyword);
    });

    resultStatus.textContent = keyword
      ? `พบ ${visibleFaqs.length} คำถามสำหรับ “${keyword}”`
      : "";

    if (!visibleFaqs.length) {
      items.innerHTML = '<p class="faq-empty">ไม่พบคำถามที่ค้นหา ลองใช้คำค้นหาอื่นอีกครั้ง</p>';
      return;
    }

    items.innerHTML = visibleFaqs
      .map(
        (item, index) => `
          <article class="faq-item">
            <button
              class="faq-item__question"
              id="faq-question-${index}"
              type="button"
              aria-expanded="false"
              aria-controls="faq-answer-${index}"
            >
              <span>${item.question}</span>
              <svg class="faq-item__chevron" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              id="faq-answer-${index}"
              class="faq-item__answer"
              role="region"
              aria-labelledby="faq-question-${index}"
              hidden
            >
              ${item.answer}
            </div>
          </article>
        `,
      )
      .join("");
  }

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    selectedCategory = button.dataset.category;
    renderCategories();
    renderFaqs();
  });

  items.addEventListener("click", (event) => {
    const question = event.target.closest(".faq-item__question");
    if (!question) return;

    const answer = document.getElementById(question.getAttribute("aria-controls"));
    const isOpen = question.getAttribute("aria-expanded") === "true";

    question.setAttribute("aria-expanded", String(!isOpen));
    answer.hidden = isOpen;
  });

  searchInput.addEventListener("input", renderFaqs);

  renderCategories();
  renderFaqs();
})();
