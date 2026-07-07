const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
const loader = document.querySelector('.site-loader');
const ambientLayer = document.querySelector('.ambient-layer');
const backToTop = document.querySelector('.back-to-top');
const themeToggle = document.querySelector('.theme-toggle');
const themeMenu = document.querySelector('.theme-menu');
const themeButtons = document.querySelectorAll('[data-theme-choice]');
const editorPage = document.querySelector('.editor-page');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const siteFeatures = window.LUCIAN_FEATURES || {};
const themeKey = 'lucian-color-theme';

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

const setColorTheme = (theme) => {
  document.documentElement.dataset.theme = theme;

  try {
    localStorage.setItem(themeKey, theme);
  } catch (error) {
    // Theme switching still works for the current page when storage is unavailable.
  }

  themeButtons.forEach((button) => {
    const isActive = button.dataset.themeChoice === theme;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'true' : 'false');
  });
};

if (themeButtons.length > 0) {
  let initialTheme = document.documentElement.dataset.theme || 'scarlet';

  try {
    initialTheme = localStorage.getItem(themeKey) || initialTheme;
  } catch (error) {}

  setColorTheme(initialTheme);
}

if (themeToggle && themeMenu) {
  themeToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = themeMenu.classList.toggle('is-open');
    themeToggle.setAttribute('aria-expanded', String(isOpen));
  });

  themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setColorTheme(button.dataset.themeChoice);
      themeMenu.classList.remove('is-open');
      themeToggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', (event) => {
    if (!themeMenu.contains(event.target) && event.target !== themeToggle) {
      themeMenu.classList.remove('is-open');
      themeToggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      themeMenu.classList.remove('is-open');
      themeToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const slugifyDraft = (value) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'untitled-note';
};

const splitDraftList = (value) => value
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const formatYamlList = (items) => {
  if (!items.length) return '  - Notes';
  return items.map((item) => `  - ${item}`).join('\n');
};

const quoteYaml = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const renderDraftMarkdown = (markdown) => {
  const lines = markdown.split('\n');
  const html = [];
  let inCode = false;
  let inList = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${escapeHtml(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      flushParagraph();
      closeList();
      if (inCode) {
        html.push('</code></pre>');
      } else {
        html.push('<pre><code>');
      }
      inCode = !inCode;
      return;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      return;
    }

    const listItem = line.match(/^-\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${escapeHtml(listItem[1])}</li>`);
      return;
    }

    paragraph.push(line.trim());
  });

  flushParagraph();
  closeList();

  if (inCode) {
    html.push('</code></pre>');
  }

  return html.join('\n');
};

if (editorPage) {
  const titleInput = document.getElementById('draftTitle');
  const slugInput = document.getElementById('draftSlug');
  const categoriesInput = document.getElementById('draftCategories');
  const tagsInput = document.getElementById('draftTags');
  const excerptInput = document.getElementById('draftExcerpt');
  const bodyInput = document.getElementById('draftBody');
  const markdownOutput = document.getElementById('draftMarkdown');
  const preview = document.getElementById('draftPreview');
  const filename = document.getElementById('draftFilename');
  const status = document.getElementById('draftStatus');
  const copyButton = document.querySelector('[data-editor-action="copy"]');
  const downloadButton = document.querySelector('[data-editor-action="download"]');

  const syncDraft = () => {
    const title = titleInput.value.trim() || '未命名文章';
    const slug = slugifyDraft(slugInput.value || title);
    const categories = splitDraftList(categoriesInput.value);
    const tags = splitDraftList(tagsInput.value);
    const excerpt = excerptInput.value.trim();
    const body = bodyInput.value.trimEnd();
    const today = new Date().toISOString().slice(0, 10);

    const markdown = `---\ntitle: ${quoteYaml(title)}\ndate: ${today}\ncategories:\n${formatYamlList(categories)}\ntags:\n${formatYamlList(tags)}\nexcerpt: ${quoteYaml(excerpt)}\n---\n\n${body}\n`;

    slugInput.value = slug;
    filename.textContent = `${slug}.md`;
    markdownOutput.value = markdown;
    preview.innerHTML = renderDraftMarkdown(body);
    status.textContent = '已同步';
  };

  [titleInput, slugInput, categoriesInput, tagsInput, excerptInput, bodyInput].forEach((field) => {
    field.addEventListener('input', syncDraft);
  });

  copyButton?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(markdownOutput.value);
      status.textContent = '已复制';
    } catch (error) {
      markdownOutput.select();
      document.execCommand('copy');
      status.textContent = '已复制';
    }
  });

  downloadButton?.addEventListener('click', () => {
    const blob = new Blob([markdownOutput.value], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.textContent;
    link.click();
    URL.revokeObjectURL(link.href);
    status.textContent = '已下载';
  });

  syncDraft();
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
