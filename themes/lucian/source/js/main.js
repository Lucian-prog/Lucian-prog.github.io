const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
const loader = document.querySelector('.site-loader');
const ambientLayer = document.querySelector('.ambient-layer');
const backToTop = document.querySelector('.back-to-top');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const siteFeatures = window.LUCIAN_FEATURES || {};

document.body.classList.add('is-loading');

const loadScript = (src) => new Promise((resolve, reject) => {
  if (!src) {
    reject(new Error('Missing script source'));
    return;
  }

  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    existing.addEventListener('load', resolve, { once: true });
    resolve();
    return;
  }

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.addEventListener('load', resolve, { once: true });
  script.addEventListener('error', reject, { once: true });
  document.head.appendChild(script);
});

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

if (siteFeatures.effects?.firework?.enable && !reduceMotion) {
  loadScript(siteFeatures.effects.firework.script)
    .then(() => {
      if (typeof window.firework === 'function') {
        window.firework({
          excludeElements: ['a', 'button', 'input', 'textarea', 'pre', 'code'],
          particles: [
            {
              shape: 'circle',
              move: ['emit'],
              easing: 'easeOutExpo',
              colors: ['#c53b53', '#e04663', '#c0caf5', '#f6c177'],
              number: 18,
              duration: [900, 1500],
              shapeOptions: {
                radius: [10, 24],
                alpha: [0.25, 0.5]
              }
            },
            {
              shape: 'circle',
              move: ['diffuse'],
              easing: 'easeOutExpo',
              colors: ['#c53b53'],
              number: 1,
              duration: [900, 1500],
              shapeOptions: {
                radius: 16,
                alpha: [0.18, 0.42],
                lineWidth: 5
              }
            }
          ]
        });
      }
    })
    .catch(() => {});
}

if (siteFeatures.effects?.live2d?.enable && !reduceMotion) {
  loadScript(siteFeatures.effects.live2d.script)
    .then(() => {
      if (window.L2Dwidget) {
        window.L2Dwidget.init({
          model: {
            jsonPath: siteFeatures.effects.live2d.model,
            scale: 1
          },
          display: {
            position: 'right',
            width: 135,
            height: 250,
            hOffset: 20,
            vOffset: -18
          },
          mobile: {
            show: true,
            scale: 0.72
          },
          react: {
            opacityDefault: 0.78,
            opacityOnHover: 0.95
          },
          dialog: {
            enable: true,
            script: {
              'tap body': '时间已经整理好了。',
              'tap face': '主人，请专心看笔记。',
              'idle 10': '需要我为下一篇笔记准备目录吗？'
            }
          }
        });
      }
    })
    .catch(() => {});
}
