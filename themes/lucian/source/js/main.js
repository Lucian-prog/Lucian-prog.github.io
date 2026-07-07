const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
const loader = document.querySelector('.site-loader');
const ambientLayer = document.querySelector('.ambient-layer');
const backToTop = document.querySelector('.back-to-top');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.body.classList.add('is-loading');

if (toggle && links) {
  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

if (ambientLayer && !reduceMotion) {
  const dotCount = window.matchMedia('(max-width: 768px)').matches ? 12 : 24;

  for (let i = 0; i < dotCount; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'ambient-dot';
    dot.style.setProperty('--left', `${Math.random() * 100}%`);
    dot.style.setProperty('--size', `${Math.floor(Math.random() * 3) + 3}px`);
    dot.style.setProperty('--duration', `${Math.random() * 10 + 14}s`);
    dot.style.setProperty('--delay', `${Math.random() * -18}s`);
    dot.style.setProperty('--drift', `${Math.random() * 80 - 40}px`);
    ambientLayer.appendChild(dot);
  }
}

const hideLoader = () => {
  document.body.classList.remove('is-loading');
  loader?.classList.add('is-hidden');
};

if (loader && !reduceMotion) {
  window.addEventListener('load', () => {
    window.setTimeout(hideLoader, 320);
  });
  window.setTimeout(hideLoader, 1400);
} else {
  hideLoader();
}

const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  revealItems.forEach((item) => observer.observe(item));

  window.setTimeout(() => {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }, 1200);
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const updateBackToTop = () => {
  if (!backToTop) return;
  backToTop.classList.toggle('is-visible', window.scrollY > 480);
};

window.addEventListener('scroll', updateBackToTop, { passive: true });
updateBackToTop();

backToTop?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
});
