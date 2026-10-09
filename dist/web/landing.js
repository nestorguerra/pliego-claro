(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  function closeMenu(returnFocus = false) {
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
    if (returnFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(true); });
  document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
  const mobileNav = matchMedia('(max-width: 800px)');
  mobileNav.addEventListener('change', () => closeMenu());

  const panels = [...document.querySelectorAll('[data-panel]')];
  const steps = [...document.querySelectorAll('[data-step]')];
  const controls = [...document.querySelectorAll('[data-step-button]')];
  const counter = document.querySelector('#journey-counter');
  let current = 0;
  let manualSelection = false;
  function activate(index) {
    if (index === current) return;
    current = index;
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
      panel.classList.toggle('is-entering', i === index && !reduceMotion.matches);
    });
    controls.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    counter.textContent = `${String(index + 1).padStart(2, '0')} / 05`;
  }
  controls.forEach((button, index) => button.addEventListener('click', () => {
    manualSelection = true;
    activate(index);
  }));
  const progress = document.querySelector('.reading-progress span');
  let scheduled = false;
  function update() {
    scheduled = false;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0})`;
    if (manualSelection || window.innerWidth <= 580) return;
    const center = Math.max(200, window.innerHeight * .52);
    let closest = 0;
    let distance = Infinity;
    steps.forEach((step, index) => {
      const box = step.getBoundingClientRect();
      const delta = Math.abs(box.top + box.height / 2 - center);
      if (delta < distance) { distance = delta; closest = index; }
    });
    const journey = document.querySelector('.journey-layout').getBoundingClientRect();
    if (journey.top < window.innerHeight && journey.bottom > 0) activate(closest);
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule);
  // Manual preview remains stable until the visitor deliberately resumes scrolling.
  window.addEventListener('wheel', () => { manualSelection = false; }, {passive: true});
  window.addEventListener('touchmove', () => { manualSelection = false; }, {passive: true});
  document.addEventListener('keydown', event => { if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key) && !event.target.closest('button,input,textarea,select')) manualSelection = false; });
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    document.body.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), {rootMargin:'0px 0px -30px 0px', threshold: .06});
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  }
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) document.body.classList.remove('motion-ready'); });
  update();
})();
