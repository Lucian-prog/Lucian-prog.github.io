'use strict';

(() => {
  const editorPage = document.querySelector('.editor-page');
  if (!editorPage) return;

  window.LucianDraftEditorEnhanced = true;

  const DRAFT_STORAGE_KEY = 'lucian-editor-drafts-v1';
  const ACTIVE_DRAFT_KEY = 'lucian-editor-active-draft-v1';
  const DATABASE_NAME = 'lucian-editor';
  const ASSET_STORE_NAME = 'assets';
  const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
  const IMAGE_FETCH_TIMEOUT = 15000;
  const ALLOWED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]);

  const elements = {
    title: document.getElementById('draftTitle'),
    slug: document.getElementById('draftSlug'),
    categories: document.getElementById('draftCategories'),
    tags: document.getElementById('draftTags'),
    excerpt: document.getElementById('draftExcerpt'),
    body: document.getElementById('draftBody'),
    markdown: document.getElementById('draftMarkdown'),
    preview: document.getElementById('draftPreview'),
    filename: document.getElementById('draftFilename'),
    status: document.getElementById('draftStatus'),
    stats: document.getElementById('draftEditorStats'),
    draftList: document.getElementById('draftList'),
    draftCount: document.getElementById('draftCount'),
    assetList: document.getElementById('draftAssetList'),
    assetEmpty: document.getElementById('draftAssetEmpty'),
    assetSummary: document.getElementById('assetSummary'),
    localizationAlert: document.getElementById('assetLocalizationAlert'),
    localizationTitle: document.getElementById('assetLocalizationTitle'),
    localizationFailures: document.getElementById('assetLocalizationFailures'),
    imageInput: document.getElementById('draftImageInput'),
    dropZone: document.getElementById('draftDropZone')
  };

  if (Object.values(elements).some((element) => !element)) {
    console.warn('Enhanced editor controls are incomplete; editor initialization skipped.');
    return;
  }

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const fencedCodeRanges = (markdown) => {
    const ranges = [];
    const lines = markdown.match(/.*(?:\r?\n|$)/g) || [];
    let offset = 0;
    let openFence = null;

    lines.forEach((line) => {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!openFence && opening) {
        openFence = {
          start: offset,
          character: opening[1][0],
          length: opening[1].length
        };
      } else if (openFence) {
        const closingPattern = new RegExp(
          `^ {0,3}${escapeRegExp(openFence.character)}{${openFence.length},}\\s*(?:\\r?\\n)?$`
        );
        if (closingPattern.test(line)) {
          ranges.push({ start: openFence.start, end: offset + line.length });
          openFence = null;
        }
      }
      offset += line.length;
    });

    if (openFence) ranges.push({ start: openFence.start, end: markdown.length });
    return ranges;
  };

  const isInsideInlineCode = (markdown, index) => {
    const lineStart = markdown.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const nextBreak = markdown.indexOf('\n', index);
    const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
    const line = markdown.slice(lineStart, lineEnd);
    const relativeIndex = index - lineStart;
    const codeSpanPattern = /(`+)[^`]*?\1/g;
    let span;

    while ((span = codeSpanPattern.exec(line)) !== null) {
      if (relativeIndex >= span.index && relativeIndex < span.index + span[0].length) return true;
    }
    return false;
  };

  const scanMarkdownImages = (markdown) => {
    const pattern = /!\[([^\]\r\n]*)\]\(\s*(?:<([^>\r\n]+)>|((?:\\.|[^\s\r\n)])+?))(?:\s+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^)\r\n]*\)))?\s*\)/g;
    const codeRanges = fencedCodeRanges(markdown);
    const images = [];
    let match;

    while ((match = pattern.exec(markdown)) !== null) {
      if (
        codeRanges.some((range) => match.index >= range.start && match.index < range.end)
        || isInsideInlineCode(markdown, match.index)
      ) {
        continue;
      }
      const source = match[2] || match[3] || '';
      const sourceToken = match[2] ? `<${source}>` : source;
      const sourceTokenOffset = match[0].indexOf(sourceToken, match[0].indexOf('](') + 2);
      const sourceOffset = sourceTokenOffset + (match[2] ? 1 : 0);

      images.push({
        alt: match[1],
        source,
        sourceStart: match.index + sourceOffset,
        sourceEnd: match.index + sourceOffset + source.length
      });
    }

    return images;
  };

  const replaceMarkdownImageSource = (markdown, previousSource, nextSource) => {
    const references = scanMarkdownImages(markdown)
      .filter((image) => image.source === previousSource)
      .sort((left, right) => right.sourceStart - left.sourceStart);
    let result = markdown;

    references.forEach((reference) => {
      result = result.slice(0, reference.sourceStart)
        + nextSource
        + result.slice(reference.sourceEnd);
    });

    return result;
  };

  const normalizedFetchSource = (source) => source.replace(/\\([\\()])/g, '$1');

  const slugifyDraft = (value) => {
    const slug = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'untitled-note';
  };

  const splitDraftList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const quoteYaml = (value) => `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  const formatYamlList = (items) => {
    if (!items.length) return '  - Notes';
    return items.map((item) => `  - ${quoteYaml(item)}`).join('\n');
  };

  const formatLocalDateTime = (date = new Date()) => {
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };

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

  const createId = (prefix) => {
    const randomId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomId}`;
  };

  const requestResult = (request) => new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });

  class DraftAssetStore {
    constructor() {
      this.databasePromise = null;
    }

    open() {
      if (!('indexedDB' in window)) {
        return Promise.reject(new Error('当前浏览器不支持 IndexedDB'));
      }

      if (!this.databasePromise) {
        this.databasePromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(DATABASE_NAME, 1);
          request.addEventListener('upgradeneeded', () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(ASSET_STORE_NAME)) {
              const store = database.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
              store.createIndex('draftId', 'draftId', { unique: false });
            }
          });
          request.addEventListener('success', () => resolve(request.result), { once: true });
          request.addEventListener('error', () => reject(request.error), { once: true });
        });
      }

      return this.databasePromise;
    }

    async getByDraft(draftId) {
      const database = await this.open();
      const transaction = database.transaction(ASSET_STORE_NAME, 'readonly');
      const index = transaction.objectStore(ASSET_STORE_NAME).index('draftId');
      return requestResult(index.getAll(IDBKeyRange.only(draftId)));
    }

    async put(asset) {
      const database = await this.open();
      const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite');
      await requestResult(transaction.objectStore(ASSET_STORE_NAME).put(asset));
      return asset;
    }

    async delete(assetId) {
      const database = await this.open();
      const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite');
      await requestResult(transaction.objectStore(ASSET_STORE_NAME).delete(assetId));
    }

    async deleteByDraft(draftId) {
      const database = await this.open();
      const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(ASSET_STORE_NAME);
      const keys = await requestResult(store.index('draftId').getAllKeys(IDBKeyRange.only(draftId)));
      keys.forEach((key) => store.delete(key));
      await new Promise((resolve, reject) => {
        transaction.addEventListener('complete', resolve, { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error), { once: true });
      });
    }
  }

  const assetStore = new DraftAssetStore();
  const defaultDraftBody = elements.body.value;
  const objectUrls = new Map();
  let drafts = [];
  let activeDraftId = null;
  let currentAssets = [];
  let localizationFailures = new Map();
  const localizationPending = new Set();
  let saveTimer = null;
  let assetStorageAvailable = true;
  let dragDepth = 0;

  const setStatus = (message, tone = 'normal') => {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', tone === 'error');
    elements.status.classList.toggle('is-working', tone === 'working');
  };

  const createDraft = (overrides = {}) => {
    const now = new Date().toISOString();
    return {
      id: createId('draft'),
      title: '新的学习笔记',
      slug: 'new-learning-note',
      categories: 'Reading Notes',
      tags: 'digital-design, systemverilog, verilog',
      excerpt: '记录一个具体问题、核心结论和后续复盘方向。',
      body: defaultDraftBody,
      imageFailures: {},
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  };

  const readDrafts = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((draft) => draft && draft.id) : [];
    } catch (error) {
      setStatus('草稿数据读取失败', 'error');
      return [];
    }
  };

  const writeDrafts = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
      if (activeDraftId) localStorage.setItem(ACTIVE_DRAFT_KEY, activeDraftId);
      return true;
    } catch (error) {
      setStatus('浏览器草稿存储空间不足', 'error');
      return false;
    }
  };

  const findActiveDraft = () => drafts.find((draft) => draft.id === activeDraftId);

  const assetPublicPath = (asset, slug = slugifyDraft(elements.slug.value)) => (
    `/images/posts/${slug}/${asset.filename}`
  );

  const releaseObjectUrls = () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  };

  const ensureObjectUrl = (asset) => {
    if (!objectUrls.has(asset.id)) objectUrls.set(asset.id, URL.createObjectURL(asset.blob));
    return objectUrls.get(asset.id);
  };

  const buildMarkdown = () => {
    const title = elements.title.value.trim() || '未命名文章';
    const slug = slugifyDraft(elements.slug.value || title);
    const categoryValues = splitDraftList(elements.categories.value);
    const category = categoryValues[0] || 'Notes';
    const tags = Array.from(new Set([
      ...splitDraftList(elements.tags.value),
      ...categoryValues.slice(1)
    ]));
    const excerpt = elements.excerpt.value.trim();
    const body = elements.body.value.trimEnd();

    return {
      title,
      slug,
      categories: [category],
      tags,
      excerpt,
      body,
      markdown: `---\ntitle: ${quoteYaml(title)}\ndate: ${formatLocalDateTime()}\ncategories:\n${formatYamlList([category])}\ntags:\n${formatYamlList(tags)}\nexcerpt: ${quoteYaml(excerpt)}\n---\n\n${body}\n`
    };
  };

  const updateStats = () => {
    const body = elements.body.value;
    const characterCount = body.replace(/\s/g, '').length;
    const lineCount = body ? body.split('\n').length : 0;
    elements.stats.textContent = `${characterCount} 字 · ${lineCount} 行`;
  };

  const fallbackLocalizationReason = (source) => {
    if (/^(?:file:|[a-zA-Z]:[\\/]|\.{0,2}[\\/])/.test(source)) {
      return '浏览器无法直接读取本地文件路径';
    }
    if (source.startsWith('/images/posts/')) return '浏览器中缺少对应的本地图片资源';
    return '图片尚未本地化，可重新粘贴以再次尝试';
  };

  const renderLocalizationFailureList = (failures) => {
    elements.localizationFailures.innerHTML = '';
    elements.localizationAlert.hidden = failures.size === 0;
    elements.localizationTitle.textContent = `${failures.size} 张图片未能本地化`;

    failures.forEach((reason, source) => {
      const item = document.createElement('li');
      const sourceLabel = document.createElement('code');
      sourceLabel.textContent = source;
      sourceLabel.title = source;
      const reasonLabel = document.createElement('span');
      reasonLabel.textContent = reason;
      item.append(sourceLabel, reasonLabel);
      elements.localizationFailures.appendChild(item);
    });
  };

  const renderPreview = () => {
    const body = elements.body.value;
    let html;

    try {
      if (!window.marked?.parse) throw new Error('Marked 未加载');
      html = window.marked.parse(body, { gfm: true, breaks: false });
      if (window.DOMPurify?.sanitize) {
        html = window.DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          ADD_ATTR: ['target']
        });
      } else {
        html = `<pre><code>${escapeHtml(body)}</code></pre>`;
      }
    } catch (error) {
      html = `<div class="editor-render-error">预览组件未能加载，Markdown 内容仍可继续编辑。</div><pre><code>${escapeHtml(body)}</code></pre>`;
    }

    const slug = slugifyDraft(elements.slug.value);
    const assetsByPath = new Map(currentAssets.map((asset) => [assetPublicPath(asset, slug), asset]));
    const bodyImageSources = new Set(scanMarkdownImages(body).map((image) => image.source));
    const displayedFailures = new Map();
    const template = document.createElement('template');
    template.innerHTML = html;

    Array.from(localizationFailures.keys()).forEach((source) => {
      if (!bodyImageSources.has(source)) localizationFailures.delete(source);
    });

    template.content.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('src') || '';
      const asset = assetsByPath.get(source);
      image.loading = 'lazy';
      if (asset) {
        image.src = ensureObjectUrl(asset);
        image.dataset.assetId = asset.id;
      } else if (source.startsWith('/images/posts/')) {
        image.removeAttribute('src');
        image.classList.add('is-missing-asset');
        const reason = localizationFailures.get(source) || fallbackLocalizationReason(source);
        image.title = reason;
        displayedFailures.set(source, reason);
      } else if (localizationPending.has(source)) {
        image.classList.add('is-localization-pending');
        image.title = '正在抓取并本地化这张图片';
      } else {
        const reason = localizationFailures.get(source) || fallbackLocalizationReason(source);
        if (/^(?:https?:|data:image\/|blob:|file:|[a-zA-Z]:[\\/]|\.{0,2}[\\/])/.test(source)) {
          image.classList.add('is-localization-failed');
          image.title = reason;
          displayedFailures.set(source, reason);
          image.removeAttribute('src');
        }
      }
    });

    template.content.querySelectorAll('a').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });

    elements.preview.replaceChildren(template.content);
    renderLocalizationFailureList(displayedFailures);

    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(elements.preview, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
          throwOnError: false
        });
      } catch (error) {
        console.warn('KaTeX preview rendering failed.', error);
      }
    }
  };

  const syncDraft = (message = '已同步') => {
    const draftData = buildMarkdown();
    elements.slug.value = draftData.slug;
    elements.filename.textContent = `${draftData.slug}.md`;
    elements.markdown.value = draftData.markdown;
    updateStats();
    renderPreview();
    setStatus(message);
  };

  const migrateSlugReferences = (previousSlug, nextSlug) => {
    if (!previousSlug || previousSlug === nextSlug) return;
    const previousPrefix = `/images/posts/${previousSlug}/`;
    const nextPrefix = `/images/posts/${nextSlug}/`;
    if (elements.body.value.includes(previousPrefix)) {
      elements.body.value = elements.body.value.split(previousPrefix).join(nextPrefix);
    }
  };

  const saveCurrentDraft = (message = '已保存') => {
    const activeDraft = findActiveDraft();
    if (!activeDraft) return false;

    const normalizedSlug = slugifyDraft(elements.slug.value || elements.title.value);
    migrateSlugReferences(activeDraft.slug, normalizedSlug);
    elements.slug.value = normalizedSlug;

    const draftData = buildMarkdown();
    activeDraft.title = draftData.title;
    activeDraft.slug = draftData.slug;
    activeDraft.categories = elements.categories.value.trim();
    activeDraft.tags = elements.tags.value.trim();
    activeDraft.excerpt = draftData.excerpt;
    activeDraft.body = draftData.body;
    const referencedSources = new Set(scanMarkdownImages(draftData.body).map((image) => image.source));
    activeDraft.imageFailures = Object.fromEntries(
      Array.from(localizationFailures.entries())
        .filter(([source]) => referencedSources.has(source) && source.length < 2048)
    );
    activeDraft.updatedAt = new Date().toISOString();

    const stored = writeDrafts();
    syncDraft(stored ? `${message} ${formatDraftTime(activeDraft.updatedAt)}` : '保存失败');
    renderDraftList();
    return stored;
  };

  const scheduleSave = () => {
    syncDraft('未保存');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveCurrentDraft('自动保存于'), 700);
  };

  const renderDraftList = () => {
    elements.draftCount.textContent = String(drafts.length);
    elements.draftList.innerHTML = '';

    drafts
      .slice()
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
      .forEach((draft) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'draft-card';
        button.classList.toggle('is-active', draft.id === activeDraftId);
        button.dataset.draftId = draft.id;

        const title = document.createElement('span');
        title.className = 'draft-card-title';
        title.textContent = draft.title || '未命名文章';

        const time = document.createElement('span');
        time.className = 'draft-card-meta';
        time.textContent = formatDraftTime(draft.updatedAt);

        const tags = document.createElement('span');
        tags.className = 'draft-card-tags';
        tags.textContent = [draft.categories, draft.tags].filter(Boolean).join(' · ') || '未分类';

        button.append(title, time, tags);
        button.addEventListener('click', () => {
          saveCurrentDraft('已自动保存');
          void loadDraft(draft.id);
        });
        elements.draftList.appendChild(button);
      });
  };

  const renderAssets = () => {
    elements.assetList.innerHTML = '';
    elements.assetEmpty.hidden = currentAssets.length > 0;
    const totalSize = currentAssets.reduce((sum, asset) => sum + asset.size, 0);
    elements.assetSummary.textContent = `${currentAssets.length} 张 · ${formatBytes(totalSize)}`;

    currentAssets
      .slice()
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
      .forEach((asset) => {
        const card = document.createElement('article');
        card.className = 'asset-card';

        const image = document.createElement('img');
        image.src = ensureObjectUrl(asset);
        image.alt = asset.filename;
        image.loading = 'lazy';

        const details = document.createElement('div');
        details.className = 'asset-card-details';

        const name = document.createElement('strong');
        name.textContent = asset.filename;
        name.title = asset.filename;

        const metadata = document.createElement('span');
        metadata.textContent = `${formatBytes(asset.size)} · ${asset.mimeType.replace('image/', '').toUpperCase()}`;
        details.append(name, metadata);

        const actions = document.createElement('div');
        actions.className = 'asset-card-actions';

        const insertButton = document.createElement('button');
        insertButton.type = 'button';
        insertButton.textContent = '插入';
        insertButton.addEventListener('click', () => insertAssetReference(asset));

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.textContent = '复制引用';
        copyButton.addEventListener('click', () => void copyAssetReference(asset));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'is-danger';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => void deleteAsset(asset));

        actions.append(insertButton, copyButton, deleteButton);
        card.append(image, details, actions);
        elements.assetList.appendChild(card);
      });
  };

  const refreshAssets = async () => {
    releaseObjectUrls();
    if (!assetStorageAvailable || !activeDraftId) {
      currentAssets = [];
      renderAssets();
      renderPreview();
      return;
    }

    try {
      currentAssets = await assetStore.getByDraft(activeDraftId);
      renderAssets();
      renderPreview();
    } catch (error) {
      assetStorageAvailable = false;
      currentAssets = [];
      renderAssets();
      setStatus('图片存储不可用，文字草稿仍可编辑', 'error');
    }
  };

  const applyDraftToForm = (draft) => {
    elements.title.value = draft.title || '未命名文章';
    elements.slug.value = draft.slug || slugifyDraft(draft.title || 'untitled-note');
    elements.categories.value = draft.categories || '';
    elements.tags.value = draft.tags || '';
    elements.excerpt.value = draft.excerpt || '';
    elements.body.value = draft.body || '';
    localizationFailures = new Map(Object.entries(draft.imageFailures || {}));
    localizationPending.clear();
    syncDraft('已载入');
  };

  const loadDraft = async (id) => {
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;

    activeDraftId = draft.id;
    try {
      localStorage.setItem(ACTIVE_DRAFT_KEY, activeDraftId);
    } catch (error) {}
    applyDraftToForm(draft);
    renderDraftList();
    await refreshAssets();
  };

  const addDraft = () => {
    saveCurrentDraft('已自动保存');
    const newDraft = createDraft({
      slug: `new-learning-note-${drafts.length + 1}`
    });
    drafts.push(newDraft);
    writeDrafts();
    void loadDraft(newDraft.id);
  };

  const deleteActiveDraft = async () => {
    const activeDraft = findActiveDraft();
    if (!activeDraft) return;

    const confirmed = window.confirm(`删除草稿「${activeDraft.title || '未命名文章'}」及其本地图片？`);
    if (!confirmed) return;

    if (assetStorageAvailable) {
      try {
        await assetStore.deleteByDraft(activeDraft.id);
      } catch (error) {
        setStatus('草稿已删除，但部分图片清理失败', 'error');
      }
    }

    drafts = drafts.filter((draft) => draft.id !== activeDraft.id);
    if (!drafts.length) drafts.push(createDraft());
    activeDraftId = drafts
      .slice()
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0].id;
    writeDrafts();
    await loadDraft(activeDraftId);
    setStatus('草稿及图片已删除');
  };

  const selectionText = () => elements.body.value.slice(
    elements.body.selectionStart,
    elements.body.selectionEnd
  );

  const replaceSelection = (replacement, selectStartOffset = null, selectEndOffset = null) => {
    const start = elements.body.selectionStart;
    const end = elements.body.selectionEnd;
    elements.body.setRangeText(replacement, start, end, 'end');
    if (selectStartOffset !== null) {
      const selectionStart = start + selectStartOffset;
      const selectionEnd = start + (selectEndOffset ?? replacement.length);
      elements.body.setSelectionRange(selectionStart, selectionEnd);
    }
    elements.body.focus();
    scheduleSave();
  };

  const wrapSelection = (before, after, placeholder) => {
    const selected = selectionText() || placeholder;
    replaceSelection(`${before}${selected}${after}`, before.length, before.length + selected.length);
  };

  const transformSelectedLines = (transform) => {
    const start = elements.body.selectionStart;
    const end = elements.body.selectionEnd;
    const value = elements.body.value;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextLineBreak = value.indexOf('\n', end);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const selectedLines = value.slice(lineStart, lineEnd);
    const transformed = transform(selectedLines);
    elements.body.setRangeText(transformed, lineStart, lineEnd, 'select');
    elements.body.focus();
    scheduleSave();
  };

  const applyMarkdownCommand = (command) => {
    switch (command) {
      case 'h2':
        transformSelectedLines((value) => value.replace(/^#{1,6}\s+/gm, '').replace(/^/gm, '## '));
        break;
      case 'h3':
        transformSelectedLines((value) => value.replace(/^#{1,6}\s+/gm, '').replace(/^/gm, '### '));
        break;
      case 'bold':
        wrapSelection('**', '**', '重点内容');
        break;
      case 'italic':
        wrapSelection('*', '*', '强调内容');
        break;
      case 'quote':
        transformSelectedLines((value) => value.replace(/^/gm, '> '));
        break;
      case 'ul':
        transformSelectedLines((value) => value.replace(/^/gm, '- '));
        break;
      case 'ol':
        transformSelectedLines((value) => value
          .split('\n')
          .map((line, index) => `${index + 1}. ${line}`)
          .join('\n'));
        break;
      case 'inline-code':
        wrapSelection('`', '`', 'signal_name');
        break;
      case 'code':
        wrapSelection('```verilog\n', '\n```', 'always_ff @(posedge clk) begin\nend');
        break;
      case 'link':
        wrapSelection('[', '](https://example.com)', '链接文字');
        break;
      case 'table':
        replaceSelection('| 字段 | 位宽 | 说明 |\n| --- | ---: | --- |\n| data | 32 | 数据通路 |\n');
        break;
      case 'math':
        wrapSelection('$$\n', '\n$$', 'F_{max}=\\frac{1}{T_{critical}}');
        break;
      case 'image':
        elements.imageInput.click();
        break;
      default:
        break;
    }
  };

  const fileExtension = (file) => ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
  }[file.type] || 'img');

  const buildAssetFilename = (file) => {
    const originalBase = String(file.name || '')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const isGenericClipboardName = !originalBase || /^(image|clipboard|screenshot)$/.test(originalBase);
    const base = isGenericClipboardName ? 'image' : originalBase;
    const stamp = new Date().toISOString()
      .replace(/\D/g, '')
      .slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 7);
    return `${base}-${stamp}-${suffix}.${fileExtension(file)}`;
  };

  const imageFileNameFromSource = (source, alt, mimeType) => {
    let sourceName = '';
    try {
      if (/^https?:/i.test(source)) {
        const pathname = new URL(source).pathname;
        sourceName = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));
      }
    } catch (error) {}

    const fallbackBase = String(alt || 'image')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'image';
    const extension = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif'
    }[mimeType] || 'img';

    return sourceName && /\.[a-z0-9]{2,5}$/i.test(sourceName)
      ? sourceName
      : `${fallbackBase}.${extension}`;
  };

  const inferredImageType = (source, responseType) => {
    const normalizedType = String(responseType || '').split(';')[0].toLowerCase();
    if (ALLOWED_IMAGE_TYPES.has(normalizedType)) return normalizedType;

    const cleanSource = source.split(/[?#]/)[0].toLowerCase();
    if (cleanSource.endsWith('.png')) return 'image/png';
    if (cleanSource.endsWith('.jpg') || cleanSource.endsWith('.jpeg')) return 'image/jpeg';
    if (cleanSource.endsWith('.webp')) return 'image/webp';
    if (cleanSource.endsWith('.gif')) return 'image/gif';
    return '';
  };

  const fetchImageAsFile = async (reference) => {
    const originalSource = reference.source;
    const source = normalizedFetchSource(originalSource);

    if (/^(?:file:|[a-zA-Z]:[\\/]|\.{0,2}[\\/])/.test(source)) {
      throw new Error('浏览器无法直接读取本地文件路径');
    }
    if (!/^(?:https?:|data:image\/|blob:)/i.test(source)) {
      throw new Error('该图片地址不是可抓取的网络或 Base64 地址');
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT);

    try {
      const response = await fetch(source, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`图片服务器返回 HTTP ${response.status}`);

      const blob = await response.blob();
      const mimeType = inferredImageType(source, blob.type);
      if (!mimeType) throw new Error('下载内容不是受支持的图片格式');
      if (blob.size > MAX_IMAGE_SIZE) throw new Error('图片超过 20 MiB');

      return new File(
        [blob],
        imageFileNameFromSource(source, reference.alt, mimeType),
        { type: mimeType }
      );
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('图片抓取超过 15 秒');
      if (error instanceof TypeError) {
        throw new Error('图片服务器拒绝跨域访问（CORS）或网络不可用');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const localizePastedMarkdownImages = async (pastedMarkdown) => {
    const references = scanMarkdownImages(pastedMarkdown);
    const uniqueReferences = Array.from(
      new Map(references.map((reference) => [reference.source, reference])).values()
    ).filter((reference) => !reference.source.startsWith('/images/posts/'));
    if (!uniqueReferences.length) return;

    let localizedCount = 0;
    let failedCount = 0;

    for (const [index, reference] of uniqueReferences.entries()) {
      setStatus(
        `正在本地化图片 ${index + 1}/${uniqueReferences.length}…`,
        'working'
      );

      try {
        let asset = currentAssets.find((item) => item.originalSource === reference.source);
        if (!asset) {
          const file = await fetchImageAsFile(reference);
          asset = {
            id: createId('asset'),
            draftId: activeDraftId,
            filename: buildAssetFilename(file),
            mimeType: file.type,
            size: file.size,
            createdAt: new Date().toISOString(),
            originalSource: reference.source.length < 2048 ? reference.source : '',
            blob: file
          };
          await assetStore.put(asset);
          currentAssets.push(asset);
        }

        const localizedPath = assetPublicPath(asset);
        elements.body.value = replaceMarkdownImageSource(
          elements.body.value,
          reference.source,
          localizedPath
        );
        localizationFailures.delete(reference.source);
        localizedCount += 1;
      } catch (error) {
        localizationFailures.set(
          reference.source,
          error?.message || '图片抓取失败，原链接已保留'
        );
        failedCount += 1;
      } finally {
        localizationPending.delete(reference.source);
        syncDraft(`正在处理图片 ${index + 1}/${uniqueReferences.length}`);
      }
    }

    await refreshAssets();
    const message = failedCount
      ? `已本地化 ${localizedCount} 张；${failedCount} 张失败，原链接已保留`
      : `${localizedCount} 张图片已自动本地化`;
    saveCurrentDraft(message);
  };

  const insertTextAtCursor = (text) => {
    const value = elements.body.value;
    const start = elements.body.selectionStart;
    const end = elements.body.selectionEnd;
    const prefix = start > 0 && value[start - 1] !== '\n' ? '\n\n' : '';
    const suffix = end < value.length && value[end] !== '\n' ? '\n\n' : '\n';
    replaceSelection(`${prefix}${text}${suffix}`);
  };

  const assetAltText = (asset) => asset.filename
    .replace(/\.[^.]+$/, '')
    .replace(/-\d{14}-[a-z0-9]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || '文章图片';

  const assetMarkdown = (asset) => `![${assetAltText(asset)}](${assetPublicPath(asset)})`;

  const insertAssetReference = (asset) => {
    insertTextAtCursor(assetMarkdown(asset));
    setStatus(`已插入 ${asset.filename}`);
  };

  const writeClipboardText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand('copy');
    temporary.remove();
  };

  const copyAssetReference = async (asset) => {
    try {
      await writeClipboardText(assetMarkdown(asset));
      setStatus(`已复制 ${asset.filename} 的引用`);
    } catch (error) {
      setStatus('无法访问剪贴板，请使用“插入”按钮', 'error');
    }
  };

  const deleteAsset = async (asset) => {
    const confirmed = window.confirm(`删除图片「${asset.filename}」并移除正文中的引用？`);
    if (!confirmed) return;

    try {
      await assetStore.delete(asset.id);
      const path = assetPublicPath(asset);
      const imagePattern = new RegExp(
        `!\\[[^\\]]*\\]\\(${escapeRegExp(path)}(?:\\s+["'][^"']*["'])?\\)`,
        'g'
      );
      elements.body.value = elements.body.value.replace(imagePattern, '').replace(/\n{3,}/g, '\n\n');
      await refreshAssets();
      saveCurrentDraft('图片已删除，草稿保存于');
    } catch (error) {
      setStatus('图片删除失败，请检查浏览器存储权限', 'error');
    }
  };

  const validateImage = (file) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return `不支持 ${file.name || '该文件'} 的格式`;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return `${file.name || '图片'} 超过 20 MiB`;
    }
    return '';
  };

  const handleImageFiles = async (files) => {
    const imageFiles = Array.from(files || []);
    if (!imageFiles.length) return;
    if (!assetStorageAvailable) {
      setStatus('当前浏览器无法保存图片', 'error');
      return;
    }

    const validationError = imageFiles.map(validateImage).find(Boolean);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    setStatus(`正在保存 ${imageFiles.length} 张图片…`, 'working');
    const insertedAssets = [];

    try {
      for (const file of imageFiles) {
        const asset = {
          id: createId('asset'),
          draftId: activeDraftId,
          filename: buildAssetFilename(file),
          mimeType: file.type,
          size: file.size,
          createdAt: new Date().toISOString(),
          blob: file
        };
        await assetStore.put(asset);
        insertedAssets.push(asset);
      }

      await refreshAssets();
      insertTextAtCursor(insertedAssets.map(assetMarkdown).join('\n\n'));
      saveCurrentDraft(`${insertedAssets.length} 张图片已插入，草稿保存于`);
    } catch (error) {
      const quotaError = error?.name === 'QuotaExceededError';
      setStatus(
        quotaError ? '图片存储空间不足，请删除旧图片后重试' : '图片保存失败，请检查浏览器存储权限',
        'error'
      );
    }
  };

  const downloadBlob = (blob, name) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyMarkdown = async () => {
    saveCurrentDraft('已保存');
    try {
      await writeClipboardText(elements.markdown.value);
      setStatus(currentAssets.length
        ? 'Markdown 已复制；发布时请同时导出图片资源'
        : 'Markdown 已复制');
    } catch (error) {
      elements.markdown.select();
      document.execCommand('copy');
      setStatus('Markdown 已复制');
    }
  };

  const downloadMarkdown = () => {
    saveCurrentDraft('已保存');
    downloadBlob(
      new Blob([elements.markdown.value], { type: 'text/markdown;charset=utf-8' }),
      elements.filename.textContent
    );
    setStatus(currentAssets.length
      ? '.md 已下载；文章图片需通过“导出文章包”一并保存'
      : '.md 已下载');
  };

  const exportArticlePackage = async () => {
    if (!window.JSZip) {
      setStatus('ZIP 导出组件未加载，请刷新页面后重试', 'error');
      return;
    }

    saveCurrentDraft('已保存');
    const draftData = buildMarkdown();
    setStatus('正在生成文章包…', 'working');

    try {
      const assets = assetStorageAvailable
        ? await assetStore.getByDraft(activeDraftId)
        : [];
      const zip = new window.JSZip();
      zip.file(`source/_posts/${draftData.slug}.md`, draftData.markdown);
      assets.forEach((asset) => {
        zip.file(`source/images/posts/${draftData.slug}/${asset.filename}`, asset.blob);
      });

      const blob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        },
        (metadata) => setStatus(`正在生成文章包 ${Math.round(metadata.percent)}%`, 'working')
      );

      downloadBlob(blob, `${draftData.slug}-article-package.zip`);
      setStatus(`文章包已导出：1 篇 Markdown，${assets.length} 张图片`);
    } catch (error) {
      setStatus('文章包导出失败，请检查浏览器存储空间', 'error');
    }
  };

  const activateComposerPane = (paneName) => {
    document.querySelectorAll('[data-composer-tab]').forEach((tab) => {
      const active = tab.dataset.composerTab === paneName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-composer-pane]').forEach((pane) => {
      pane.classList.toggle('is-active', pane.dataset.composerPane === paneName);
    });
    if (paneName === 'preview') renderPreview();
  };

  const bindEvents = () => {
    [elements.title, elements.categories, elements.tags, elements.excerpt, elements.body]
      .forEach((field) => field.addEventListener('input', scheduleSave));

    elements.slug.addEventListener('input', scheduleSave);
    elements.slug.addEventListener('blur', () => saveCurrentDraft('已保存'));

    document.querySelectorAll('[data-editor-action="new"]')
      .forEach((button) => button.addEventListener('click', addDraft));
    document.querySelector('[data-editor-action="save"]')
      ?.addEventListener('click', () => saveCurrentDraft('已保存'));
    document.querySelector('[data-editor-action="delete"]')
      ?.addEventListener('click', () => void deleteActiveDraft());
    document.querySelector('[data-editor-action="copy"]')
      ?.addEventListener('click', () => void copyMarkdown());
    document.querySelector('[data-editor-action="download"]')
      ?.addEventListener('click', downloadMarkdown);
    document.querySelector('[data-editor-action="export"]')
      ?.addEventListener('click', () => void exportArticlePackage());

    document.querySelectorAll('[data-markdown-command]').forEach((button) => {
      button.addEventListener('click', () => applyMarkdownCommand(button.dataset.markdownCommand));
    });

    document.querySelector('[data-image-action="choose"]')
      ?.addEventListener('click', () => elements.imageInput.click());

    elements.imageInput.addEventListener('change', () => {
      void handleImageFiles(elements.imageInput.files);
      elements.imageInput.value = '';
    });

    elements.body.addEventListener('paste', (event) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const pastedImageReferences = scanMarkdownImages(pastedText)
        .filter((reference) => !reference.source.startsWith('/images/posts/'));
      const imageFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && ALLOWED_IMAGE_TYPES.has(item.type))
        .map((item) => item.getAsFile())
        .filter(Boolean);

      if (pastedImageReferences.length) {
        event.preventDefault();
        pastedImageReferences.forEach((reference) => localizationPending.add(reference.source));
        replaceSelection(pastedText);
        void localizePastedMarkdownImages(pastedText);
        return;
      }

      if (!imageFiles.length) return;
      event.preventDefault();
      void handleImageFiles(imageFiles);
    });

    elements.dropZone.addEventListener('dragenter', (event) => {
      event.preventDefault();
      dragDepth += 1;
      elements.dropZone.classList.add('is-dragging');
    });
    elements.dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    elements.dropZone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) elements.dropZone.classList.remove('is-dragging');
    });
    elements.dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      elements.dropZone.classList.remove('is-dragging');
      void handleImageFiles(Array.from(event.dataTransfer?.files || []));
    });

    elements.body.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        saveCurrentDraft('已保存');
      } else if (key === 'b') {
        event.preventDefault();
        applyMarkdownCommand('bold');
      } else if (key === 'i') {
        event.preventDefault();
        applyMarkdownCommand('italic');
      } else if (key === 'k') {
        event.preventDefault();
        applyMarkdownCommand('link');
      }
    });

    document.querySelectorAll('[data-composer-tab]').forEach((tab) => {
      tab.addEventListener('click', () => activateComposerPane(tab.dataset.composerTab));
    });

    window.addEventListener('beforeunload', releaseObjectUrls);
  };

  const initialize = async () => {
    drafts = readDrafts();
    if (!drafts.length) drafts.push(createDraft());

    try {
      activeDraftId = localStorage.getItem(ACTIVE_DRAFT_KEY);
    } catch (error) {}

    if (!drafts.some((draft) => draft.id === activeDraftId)) {
      activeDraftId = drafts
        .slice()
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0].id;
    }

    try {
      await assetStore.open();
    } catch (error) {
      assetStorageAvailable = false;
      setStatus('图片存储不可用，文字草稿仍可编辑', 'error');
    }

    writeDrafts();
    bindEvents();
    await loadDraft(activeDraftId);
  };

  void initialize();
})();
