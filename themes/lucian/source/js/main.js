const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
const loader = document.querySelector('.site-loader');
const backToTop = document.querySelector('.back-to-top');
const themeToggle = document.querySelector('.theme-toggle');
const themeMenu = document.querySelector('.theme-menu');
const themeButtons = document.querySelectorAll('[data-theme-choice]');
const searchToggle = document.querySelector('.search-toggle');
const searchOverlay = document.querySelector('.search-overlay');
const searchClose = document.querySelector('.search-close');
const searchInput = document.getElementById('siteSearchInput');
const searchStatus = document.getElementById('siteSearchStatus');
const searchResults = document.getElementById('siteSearchResults');
const editorPage = document.querySelector('.editor-page');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const siteFeatures = window.LUCIAN_FEATURES || {};
const themeKey = 'lucian-color-theme';
const searchPath = '/search.json';
const lightThemes = new Set(['paper', 'claude-light']);

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

const commentThemeFor = (theme) => lightThemes.has(theme) ? 'github-light' : 'github-dark';

const syncUtterancesTheme = (theme) => {
  const commentTheme = commentThemeFor(theme);
  const script = document.getElementById('utterancesScript');
  const frame = document.querySelector('.utterances-frame');

  script?.setAttribute('theme', commentTheme);
  frame?.contentWindow?.postMessage({ type: 'set-theme', theme: commentTheme }, 'https://utteranc.es');
};

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

  syncUtterancesTheme(theme);
};

if (themeButtons.length > 0) {
  let initialTheme = document.documentElement.dataset.theme || 'claude-light';

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

const commentsCard = document.querySelector('.comments-card');

if (commentsCard && 'MutationObserver' in window) {
  const commentsObserver = new MutationObserver(() => {
    if (commentsCard.querySelector('.utterances-frame')) {
      syncUtterancesTheme(document.documentElement.dataset.theme || 'claude-light');
    }
  });

  commentsObserver.observe(commentsCard, { childList: true, subtree: true });
}

let searchIndex = null;
let searchLoading = false;

const setSearchStatus = (message) => {
  if (searchStatus) searchStatus.textContent = message;
};

const renderSearchResults = (query) => {
  if (!searchResults || !searchIndex) return;

  const keyword = query.trim().toLowerCase();
  searchResults.innerHTML = '';

  if (!keyword) {
    setSearchStatus('输入关键词后，将从标题、标签、分类和正文中检索。');
    return;
  }

  const matches = searchIndex
    .map((item) => {
      const titleScore = item.titleText.includes(keyword) ? 8 : 0;
      const metaScore = item.metaText.includes(keyword) ? 4 : 0;
      const contentScore = item.contentText.includes(keyword) ? 1 : 0;
      return { item, score: titleScore + metaScore + contentScore };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
    .slice(0, 12);

  if (!matches.length) {
    setSearchStatus(`没有找到与 "${query}" 相关的笔记。`);
    searchResults.innerHTML = '<div class="search-empty">没有匹配结果，可以换一个关键词试试。</div>';
    return;
  }

  setSearchStatus(`找到 ${matches.length} 条相关笔记。`);

  const fragment = document.createDocumentFragment();
  matches.forEach(({ item }) => {
    const result = document.createElement('a');
    result.className = 'search-result-item';
    result.href = item.url;
    result.innerHTML = `
      <span class="search-result-meta">${escapeHtml(item.date || 'Notes')} · ${escapeHtml(item.metaLabel || 'Uncategorized')}</span>
      <strong>${highlightTerm(item.title || 'Untitled', query)}</strong>
      <span>${highlightTerm(item.excerpt, query)}</span>
    `;
    fragment.appendChild(result);
  });

  searchResults.appendChild(fragment);
};

const loadSearchIndex = async () => {
  if (searchIndex || searchLoading) return searchIndex;
  searchLoading = true;
  setSearchStatus('正在整理搜索索引...');

  try {
    const response = await fetch(searchPath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Search index request failed: ${response.status}`);
    const data = await response.json();

    searchIndex = data.map((entry) => {
      const categories = normalizeTaxonomy(entry.categories);
      const tags = normalizeTaxonomy(entry.tags);
      const content = stripMarkup(entry.content || '');
      const excerpt = content.slice(0, 150) || '暂无摘要。';
      const title = stripMarkup(entry.title || 'Untitled');
      const url = entry.url || '#';
      const dateMatch = url.match(/\/posts\/(\d{4})?/) ? '' : '';
      const metaLabel = [...categories, ...tags].slice(0, 3).join(' / ');

      return {
        title,
        url,
        date: entry.date || dateMatch,
        excerpt,
        metaLabel,
        titleText: normalizeSearchText(title),
        metaText: normalizeSearchText([...categories, ...tags].join(' ')),
        contentText: normalizeSearchText(content)
      };
    });

    setSearchStatus(searchIndex.length ? '搜索索引已就绪。' : '当前还没有可搜索的正式笔记。');
    return searchIndex;
  } catch (error) {
    searchIndex = [];
    setSearchStatus('搜索索引加载失败，请稍后刷新页面。');
    console.warn('Search index loading failed:', error);
    return searchIndex;
  } finally {
    searchLoading = false;
  }
};

const openSearch = async () => {
  if (!searchOverlay || !searchInput) return;
  searchOverlay.classList.add('is-open');
  searchOverlay.setAttribute('aria-hidden', 'false');
  searchToggle?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('is-searching');
  await loadSearchIndex();
  searchInput.focus();
  renderSearchResults(searchInput.value);
};

const closeSearch = () => {
  if (!searchOverlay) return;
  searchOverlay.classList.remove('is-open');
  searchOverlay.setAttribute('aria-hidden', 'true');
  searchToggle?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('is-searching');
};

if (searchToggle && searchOverlay && searchInput) {
  searchToggle.addEventListener('click', openSearch);
  searchClose?.addEventListener('click', closeSearch);
  searchOverlay.addEventListener('click', (event) => {
    if (event.target === searchOverlay) closeSearch();
  });
  searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));

  document.addEventListener('keydown', (event) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if ((event.key === '/' || (event.ctrlKey && event.key.toLowerCase() === 'k')) && !isTyping) {
      event.preventDefault();
      openSearch();
    }

    if (event.key === 'Escape' && searchOverlay.classList.contains('is-open')) {
      closeSearch();
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
  return items.map((item) => `  - ${quoteYaml(item)}`).join('\n');
};

const quoteYaml = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const formatLocalDateTime = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const stripMarkup = (value = '') => value
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const normalizeSearchText = (value = '') => stripMarkup(String(value)).toLowerCase();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightTerm = (value, term) => {
  const escaped = escapeHtml(value);
  const needle = term.trim();
  if (!needle) return escaped;
  return escaped.replace(new RegExp(`(${escapeRegExp(needle)})`, 'gi'), '<mark>$1</mark>');
};

const normalizeTaxonomy = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    return item?.name || item?.title || '';
  }).filter(Boolean);
};

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
  const draftStorageKey = 'lucian-editor-drafts-v1';
  const activeDraftKey = 'lucian-editor-active-draft-v1';
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
  const draftList = document.getElementById('draftList');
  const draftCount = document.getElementById('draftCount');
  const newButtons = document.querySelectorAll('[data-editor-action="new"]');
  const saveButton = document.querySelector('[data-editor-action="save"]');
  const deleteButton = document.querySelector('[data-editor-action="delete"]');
  const copyButton = document.querySelector('[data-editor-action="copy"]');
  const downloadButton = document.querySelector('[data-editor-action="download"]');
  const editorReady = titleInput
    && slugInput
    && categoriesInput
    && tagsInput
    && excerptInput
    && bodyInput
    && markdownOutput
    && preview
    && filename
    && status
    && draftList
    && draftCount;

  if (!editorReady) {
    console.warn('Editor controls are incomplete; draft editor skipped.');
  } else {
  let drafts = [];
  let activeDraftId = null;
  let saveTimer = null;

  const defaultDraftBody = bodyInput.value;

  const createDraft = (overrides = {}) => {
    const now = new Date().toISOString();
    const id = `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return {
      id,
      title: '新的学习笔记',
      slug: 'new-learning-note',
      categories: 'Reading Notes',
      tags: 'digital-design, systemverilog, verilog',
      excerpt: '记录一个具体问题、核心结论和后续复盘方向。',
      body: defaultDraftBody,
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  };

  const readDrafts = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(draftStorageKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter((draft) => draft && draft.id) : [];
    } catch (error) {
      return [];
    }
  };

  const writeDrafts = () => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
      if (activeDraftId) {
        localStorage.setItem(activeDraftKey, activeDraftId);
      }
    } catch (error) {
      status.textContent = '本地存储不可用';
    }
  };

  const findActiveDraft = () => drafts.find((draft) => draft.id === activeDraftId);

  const formatDraftTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未知时间';

    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const buildMarkdown = () => {
    const title = titleInput.value.trim() || '未命名文章';
    const slug = slugifyDraft(slugInput.value || title);
    const categoryValues = splitDraftList(categoriesInput.value);
    const category = categoryValues[0] || 'Notes';
    const tags = Array.from(new Set([...splitDraftList(tagsInput.value), ...categoryValues.slice(1)]));
    const excerpt = excerptInput.value.trim();
    const body = bodyInput.value.trimEnd();
    const today = formatLocalDateTime();

    return {
      title,
      slug,
      categories: [category],
      tags,
      excerpt,
      body,
      markdown: `---\ntitle: ${quoteYaml(title)}\ndate: ${today}\ncategories:\n${formatYamlList([category])}\ntags:\n${formatYamlList(tags)}\nexcerpt: ${quoteYaml(excerpt)}\n---\n\n${body}\n`
    };
  };

  const renderDraftList = () => {
    draftCount.textContent = String(drafts.length);
    draftList.innerHTML = '';

    drafts
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((draft) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'draft-card';
        button.classList.toggle('is-active', draft.id === activeDraftId);
        button.dataset.draftId = draft.id;
        button.innerHTML = `
          <span class="draft-card-title">${escapeHtml(draft.title || '未命名文章')}</span>
          <span class="draft-card-meta">${escapeHtml(formatDraftTime(draft.updatedAt))}</span>
          <span class="draft-card-tags">${escapeHtml([draft.categories, draft.tags].filter(Boolean).join(' · ') || '未分类')}</span>
        `;
        button.addEventListener('click', () => {
          saveCurrentDraft('已自动保存');
          loadDraft(draft.id);
        });
        draftList.appendChild(button);
      });
  };

  const syncDraft = (message = '已同步') => {
    const draftData = buildMarkdown();

    slugInput.value = draftData.slug;
    filename.textContent = `${draftData.slug}.md`;
    markdownOutput.value = draftData.markdown;
    preview.innerHTML = renderDraftMarkdown(draftData.body);
    status.textContent = message;
  };

  const applyDraftToForm = (draft) => {
    titleInput.value = draft.title || '未命名文章';
    slugInput.value = draft.slug || slugifyDraft(draft.title || 'untitled-note');
    categoriesInput.value = draft.categories || '';
    tagsInput.value = draft.tags || '';
    excerptInput.value = draft.excerpt || '';
    bodyInput.value = draft.body || '';
    syncDraft('已载入');
  };

  const saveCurrentDraft = (message = '已保存') => {
    const activeDraft = findActiveDraft();
    if (!activeDraft) return;

    const draftData = buildMarkdown();
    activeDraft.title = draftData.title;
    activeDraft.slug = draftData.slug;
    activeDraft.categories = categoriesInput.value.trim();
    activeDraft.tags = tagsInput.value.trim();
    activeDraft.excerpt = draftData.excerpt;
    activeDraft.body = draftData.body;
    activeDraft.updatedAt = new Date().toISOString();
    writeDrafts();
    syncDraft(`${message} ${formatDraftTime(activeDraft.updatedAt)}`);
    renderDraftList();
  };

  const scheduleSave = () => {
    syncDraft('未保存');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveCurrentDraft('自动保存于');
    }, 700);
  };

  const loadDraft = (id) => {
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;

    activeDraftId = draft.id;
    try {
      localStorage.setItem(activeDraftKey, activeDraftId);
    } catch (error) {}
    applyDraftToForm(draft);
    renderDraftList();
  };

  const addDraft = () => {
    saveCurrentDraft('已自动保存');
    const newDraft = createDraft({
      title: '新的学习笔记',
      slug: `new-learning-note-${drafts.length + 1}`
    });
    drafts.push(newDraft);
    writeDrafts();
    loadDraft(newDraft.id);
  };

  const deleteActiveDraft = () => {
    const activeDraft = findActiveDraft();
    if (!activeDraft) return;

    const confirmed = window.confirm(`删除草稿「${activeDraft.title || '未命名文章'}」？此操作只会删除浏览器本地草稿。`);
    if (!confirmed) return;

    drafts = drafts.filter((draft) => draft.id !== activeDraft.id);
    if (!drafts.length) {
      drafts.push(createDraft());
    }

    activeDraftId = drafts.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0].id;
    writeDrafts();
    loadDraft(activeDraftId);
    status.textContent = '已删除';
  };

  drafts = readDrafts();
  if (!drafts.length) {
    drafts.push(createDraft());
  }

  try {
    activeDraftId = localStorage.getItem(activeDraftKey);
  } catch (error) {}

  if (!drafts.some((draft) => draft.id === activeDraftId)) {
    activeDraftId = drafts.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0].id;
  }

  writeDrafts();
  loadDraft(activeDraftId);

  [titleInput, slugInput, categoriesInput, tagsInput, excerptInput, bodyInput].forEach((field) => {
    field.addEventListener('input', scheduleSave);
  });

  newButtons.forEach((button) => {
    button.addEventListener('click', addDraft);
  });

  saveButton?.addEventListener('click', () => saveCurrentDraft('已保存'));
  deleteButton?.addEventListener('click', deleteActiveDraft);

  copyButton?.addEventListener('click', async () => {
    saveCurrentDraft('已保存');

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
    saveCurrentDraft('已保存');

    const blob = new Blob([markdownOutput.value], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.textContent;
    link.click();
    URL.revokeObjectURL(link.href);
    status.textContent = '已下载';
  });
  }
}

const featureEnabled = (name) => siteFeatures.features?.[name] !== false;
const postContent = document.querySelector('.post-content');

const slugifyHeading = (value) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `section-${Math.random().toString(16).slice(2)}`;
};

if (postContent && !featureEnabled('toc')) {
  document.getElementById('postTocCard')?.classList.add('is-empty');
}

if (postContent && featureEnabled('toc')) {
  const tocCard = document.getElementById('postTocCard');
  const toc = document.getElementById('postToc');
  const headings = Array.from(postContent.querySelectorAll('h2, h3'));

  if (tocCard && toc && headings.length) {
    const usedIds = new Set();

    headings.forEach((heading, index) => {
      if (!heading.id) {
        heading.id = slugifyHeading(heading.textContent || `section-${index + 1}`);
      }

      while (usedIds.has(heading.id)) {
        heading.id = `${heading.id}-${index + 1}`;
      }

      usedIds.add(heading.id);

      const link = document.createElement('a');
      link.className = `post-toc-link is-${heading.tagName.toLowerCase()}`;
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent.trim();
      link.addEventListener('click', () => {
        toc.querySelectorAll('.post-toc-link').forEach((item) => item.classList.remove('is-active'));
        link.classList.add('is-active');
      });
      toc.appendChild(link);
    });

    if ('IntersectionObserver' in window) {
      const tocLinks = new Map(Array.from(toc.querySelectorAll('.post-toc-link')).map((link) => [
        decodeURIComponent(link.hash.slice(1)),
        link
      ]));

      const headingObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          toc.querySelectorAll('.post-toc-link').forEach((link) => link.classList.remove('is-active'));
          tocLinks.get(entry.target.id)?.classList.add('is-active');
        });
      }, { rootMargin: '-20% 0px -68% 0px', threshold: 0.01 });

      headings.forEach((heading) => headingObserver.observe(heading));
    }

    toc.querySelector('.post-toc-link')?.classList.add('is-active');
  } else {
    tocCard?.classList.add('is-empty');
  }
}

const plainTextFromHighlight = (figure) => {
  const codeLines = Array.from(figure.querySelectorAll('td.code .line'));
  if (codeLines.length) {
    return codeLines.map((line) => line.textContent).join('\n');
  }

  return figure.querySelector('td.code pre, pre code, pre')?.textContent || '';
};

const languageFromHighlight = (element) => {
  const classes = Array.from(element.classList || []);
  const languageClass = classes.find((name) => name.startsWith('language-'));
  if (languageClass) return languageClass.replace('language-', '');

  const highlightClass = classes.find((name) => name !== 'highlight' && name !== 'code-enhanced');
  if (highlightClass === 'verilog') {
    const code = plainTextFromHighlight(element);
    if (/\b(always_ff|always_comb|always_latch|logic|typedef\s+enum|unique\s+case|interface|modport)\b/.test(code)) {
      return 'systemverilog';
    }
  }
  if (highlightClass) return highlightClass;

  return 'code';
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
};

if (postContent && featureEnabled('code_tools')) {
  const figures = Array.from(postContent.querySelectorAll('figure.highlight'));
  const plainBlocks = Array.from(postContent.querySelectorAll('pre > code'))
    .map((code) => code.closest('pre'))
    .filter((pre) => pre && !pre.closest('figure.highlight'));

  figures.forEach((figure) => {
    if (figure.dataset.enhanced === 'true') return;
    figure.dataset.enhanced = 'true';
    figure.classList.add('code-enhanced');

    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    toolbar.innerHTML = `<span class="code-language">${escapeHtml(languageFromHighlight(figure))}</span><button class="code-copy" type="button">Copy</button>`;
    figure.prepend(toolbar);

    const button = toolbar.querySelector('.code-copy');
    button.addEventListener('click', async () => {
      const copied = await copyText(plainTextFromHighlight(figure));
      button.textContent = copied ? 'Copied' : 'Failed';
      button.classList.toggle('is-copied', copied);
      window.setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('is-copied');
      }, 1200);
    });
  });

  plainBlocks.forEach((pre) => {
    if (pre.dataset.enhanced === 'true') return;
    pre.dataset.enhanced = 'true';
    pre.classList.add('code-enhanced');

    const code = pre.querySelector('code');
    const wrapper = document.createElement('div');
    wrapper.className = 'plain-code-wrap';
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    toolbar.innerHTML = `<span class="code-language">${escapeHtml(languageFromHighlight(code || pre))}</span><button class="code-copy" type="button">Copy</button>`;
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(pre);

    const button = toolbar.querySelector('.code-copy');
    button.addEventListener('click', async () => {
      const copied = await copyText(code?.textContent || pre.textContent || '');
      button.textContent = copied ? 'Copied' : 'Failed';
      button.classList.toggle('is-copied', copied);
      window.setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('is-copied');
      }, 1200);
    });
  });
}

if (postContent && featureEnabled('mermaid')) {
  const mermaidFigures = Array.from(postContent.querySelectorAll('figure.highlight.mermaid'));
  const mermaidPreBlocks = Array.from(postContent.querySelectorAll('pre > code.language-mermaid'))
    .map((code) => code.closest('pre'))
    .filter(Boolean);
  const mermaidSources = [...mermaidFigures, ...mermaidPreBlocks];

  if (mermaidSources.length) {
    const mermaidTheme = lightThemes.has(document.documentElement.dataset.theme) ? 'default' : 'dark';

    loadScript(siteFeatures.features?.mermaid_script || 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js')
      .then(async () => {
        if (!window.mermaid) return;

        window.mermaid.initialize({
          startOnLoad: false,
          theme: mermaidTheme,
          securityLevel: 'strict'
        });

        for (const [index, source] of mermaidSources.entries()) {
          const graphDefinition = source.matches('figure.highlight')
            ? plainTextFromHighlight(source)
            : source.querySelector('code')?.textContent || source.textContent || '';
          const graph = document.createElement('div');
          graph.className = 'mermaid-block';

          try {
            const result = await window.mermaid.render(`mermaid-${Date.now()}-${index}`, graphDefinition);
            graph.innerHTML = result.svg;
            source.replaceWith(graph);
          } catch (error) {
            const message = document.createElement('div');
            message.className = 'mermaid-error';
            message.textContent = 'Mermaid 渲染失败，已保留原始代码。';
            source.after(message);
          }
        }
      })
      .catch(() => {});
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
