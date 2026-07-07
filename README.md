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

新增文章：

```powershell
npx hexo new "post-title"
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
