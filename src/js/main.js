document.addEventListener("DOMContentLoaded", () => {
  initCarousel();
  initAccordion();
});

function initCarousel() {
  const slides = document.querySelectorAll(".hero__slide");
  const dots = document.querySelectorAll(".hero__dot");
  const prevBtn = document.querySelector(".hero__arrow--prev");
  const nextBtn = document.querySelector(".hero__arrow--next");

  if (!slides.length) return;

  let current = 0;

  function goTo(index) {
    slides[current].classList.remove("hero__slide--active");
    dots[current]?.classList.remove("hero__dot--active");

    current = (index + slides.length) % slides.length;

    slides[current].classList.add("hero__slide--active");
    dots[current]?.classList.add("hero__dot--active");
  }

  prevBtn?.addEventListener("click", () => goTo(current - 1));
  nextBtn?.addEventListener("click", () => goTo(current + 1));

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => goTo(i));
  });
}

function initAccordion() {
  const items = document.querySelectorAll(".accordion__item");

  items.forEach((item) => {
    const header = item.querySelector(".accordion__header");

    header?.addEventListener("click", () => {
      const isOpen = item.classList.contains("accordion__item--open");

      items.forEach((other) => other.classList.remove("accordion__item--open"));

      if (!isOpen) {
        item.classList.add("accordion__item--open");
      }
    });
  });
}
