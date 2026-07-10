# Lucian's Digital IC Notes

个人 GitHub Pages 博客，使用 Hexo 和自定义 `lucian` 主题构建。

站点定位是数字 IC / 硬件工程学习笔记门户，第一阶段以《数字设计和计算机体系结构：RISC-V 版》读书笔记为主线。

## Local Development

```powershell
npm install
npm run clean
npm run build
npm run dev
```

本地预览地址默认是 <http://localhost:4000>。

## Writing

### 正式发布文章

正式文章放在 `source/_posts/`，这些 Markdown 会参与构建并出现在首页、归档、分类、标签和搜索结果里。

新增文章：

```powershell
npx hexo new post "RISC-V 指令格式笔记"
```

删除文章时，只删除 `source/_posts/` 中对应的 `.md` 文件，不要删除 `themes/`、`source/editor/`、`source/about/`、`source/friend/`、`.github/` 或 `_config.yml`。

### 草稿

暂时不发布的内容放在 `source/_drafts/`。

```powershell
npx hexo new draft "流水线冒险笔记"
npx hexo publish post "流水线冒险笔记"
```

`publish` 后，草稿会从 `source/_drafts/` 移到 `source/_posts/`。

### 网站写作页

`/editor/` 是本地浏览器草稿箱和 Markdown 生成器。它会把草稿保存在当前浏览器的 `localStorage`，不会自动写入 GitHub 仓库。

编辑器中的“主分类”建议只填写一个值，例如 `Reading Notes`。Hexo 会把多个 `categories` 条目解释成层级分类，不是并列分类；更细的主题请放进 `tags`，例如 `digital-design, systemverilog, verilog`。

推荐流程：

```text
网站写作页起草 -> 复制 Markdown 或下载 .md -> 放入 source/_posts/ -> git commit -> git push
```

### 学习进度

首页学习主线读取 `source/_data/progress.yml`。每个章节使用 `0` 到 `100` 的整数表示进度，总进度是所有章节百分比的平均值。

可以在 `/editor/` 切换到“学习进度”，调整标题、章节顺序和百分比。页面会把修改自动保存在当前浏览器中，但不会直接修改 GitHub 仓库。

发布进度：

1. 在网站写作页下载 `progress.yml`。
2. 用下载文件替换仓库中的 `source/_data/progress.yml`。
3. 执行构建检查。

   ```powershell
   npm run clean
   npm run build
   ```

4. 提交并推送修改。

   ```powershell
   git add source/_data/progress.yml
   git commit -m "Update learning progress"
   git push
   ```

配置格式：

```yaml
title: "《数字设计和计算机体系结构：RISC-V 版》阅读笔记"
chapters:
  - title: "第 4 章：硬件描述语言"
    progress: 100
  - title: "第 5 章：数字构件"
    progress: 50
```

### 发布检查

```powershell
npm run clean
npm run build
npm run server -- --port 4002
```

本地确认无误后：

```powershell
git add source/_posts README.md
git commit -m "Add notes"
git push
```

文章建议结构：

```markdown
## 本节问题

## 核心概念

## 硬件结构 / 信号流

## 关键推导 / 时序关系

## RTL 实验 / 例程

## 易错点
```

RTL 代码块可以使用：

    ```systemverilog
    always_ff @(posedge clk_i or negedge rst_n_i) begin
      if (!rst_n_i) begin
        q_o <= '0;
      end else begin
        q_o <= d_i;
      end
    end
    ```

站点会在构建时把 `systemverilog` / `sv` 代码块交给 Verilog 高亮器处理。
