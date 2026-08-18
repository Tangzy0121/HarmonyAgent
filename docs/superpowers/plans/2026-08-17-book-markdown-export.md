# 学习书导出 Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一键把互动学习书（含原文引用页码、用户笔记、学习记录摘要）导出为单个 Markdown 文件，纯确定性序列化，无 LLM。

**Architecture:** server 纯函数序列化器 `bookMarkdown.ts` + 窄路由 `GET /api/books/:id/export`；admin `bookExportUrl` + 阅读器导航 `<a download>`。

**Tech Stack:** Express 4 + TS、React + Vite、Vitest。

**背景：** DeepTutor v1.5.13 对照后选定方向之一（Sprint A）。不与已批准 MVP 规格冲突（只读投影、无新写入、无 LLM）。

## Global Constraints

- 无 LLM、无新写入；导出是只读投影。
- 用户笔记必须包含且标注为用户内容（规格 §6.2 延伸）；引用必须带原文页码。
- 错误只暴露稳定 code；日志白名单新增 `book_exported` 一类。
- mock 演示书行为不变（导出按钮仅真实书渲染）。

---

### Task 1: Markdown 序列化器

**Files:** Create `server/src/books/bookMarkdown.ts` + `.test.ts`

- [x] 失败测试（2 章/9 种块/2 笔记/1 答题：标题、来源行、章序、⚠️ 不完整章、💡 keyPoint、引用页码、quiz 答案、$$/mermaid 围栏、概念关系、笔记标注、摘要计数，9 例）
- [x] 实现 `renderBookMarkdown(book, exportedAt?)`
- [x] 9/9 通过

### Task 2: 导出路由

**Files:** Modify `server/src/routes/books.ts`；Create `server/src/routes/bookExport.test.ts`

- [x] 失败测试（200 text/markdown + attachment + 正文；404 book_not_found，2 例）
- [x] 实现 `GET /:id/export` + `book_exported` 日志类别
- [x] 2/2 通过

### Task 3: admin 导出按钮

**Files:** Modify `admin/src/services/bookApi.ts`(+`.test.ts`)、`admin/src/pages/InteractiveBookPage.tsx`、`admin/src/index.css`

- [x] 失败测试（URL 编码 1 例）
- [x] `bookExportUrl` + 导航栏「导出 Markdown」（仅 isRealBook）+ 样式
- [x] tsc + admin 293 全绿

### Task 4: 收口

- [x] 双端全量测试（server 388 / admin 293）
- [x] curl 真实导出验证（Content-Type/Disposition/正文抽查）
- [x] worklog `2026-08-17-book-markdown-export-result.md`；记忆更新
