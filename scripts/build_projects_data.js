// ============================================================
// build_projects_data.js - 项目矩阵数据合成
// 输入：source/_data/projects.yml（手维护）
// 输出：source/data/projects.json（yml 数据 + GitHub 实时元数据）
// 说明：js-yaml 来自 Hexo 自带依赖，无需额外安装；
//       GITHUB_TOKEN 存在时用认证请求（5000/h），否则匿名（60/h）
// ============================================================
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const SRC_YAML = path.join(ROOT, 'source', '_data', 'projects.yml');
const OUT_DIR = path.join(ROOT, 'source', 'data');
const OUT_JSON = path.join(OUT_DIR, 'projects.json');

const TOKEN = process.env.GITHUB_TOKEN || '';
const HEADERS = {
  'User-Agent': 'project-matrix-builder',
  'Accept': 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function fetchRepoMeta(fullName) {
  const url = `https://api.github.com/repos/${fullName}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    console.warn(`  [warn] ${fullName}: HTTP ${res.status}，跳过元数据`);
    return null;
  }
  const j = await res.json();
  return {
    stars: j.stargazers_count ?? 0,
    language: j.language ?? '',
    pushed_at: j.pushed_at ?? '',
    open_issues: j.open_issues_count ?? 0,
    html_url: j.html_url ?? '',
  };
}

(async () => {
  const doc = yaml.load(fs.readFileSync(SRC_YAML, 'utf8'));
  const projects = doc.projects || [];

  // 拉取去重后的仓库元数据（多卡片可指向同一仓库）
  const repoNames = [...new Set(projects.map(p => p.repo).filter(Boolean))];
  const metaMap = {};
  for (const name of repoNames) {
    metaMap[name] = await fetchRepoMeta(name);
    console.log(`  fetched ${name}: stars=${metaMap[name]?.stars ?? '-'}`);
  }

  const out = {
    generated_at: new Date().toISOString(),
    meta: doc.meta || {},
    stages: doc.stages || [],
    projects: projects.map(p => ({
      ...p,
      github: p.repo ? (metaMap[p.repo] || null) : null,
      repo_url: p.repo
        ? `https://github.com/${p.repo}${p.repo_path ? '/' + p.repo_path : ''}`
        : '',
    })),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2), 'utf8');
  console.log(`  => ${OUT_JSON}（${projects.length} 个项目，${repoNames.length} 个仓库）`);
})();
