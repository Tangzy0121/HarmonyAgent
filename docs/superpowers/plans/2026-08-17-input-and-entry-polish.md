# 输入与入口打磨（EPUB / 成本估算 / starter 建议）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** G1 EPUB 输入；G2 spine 逐章成本估算；G3 模板化 starter 建议。零新增 LLM。

**Spec:** `docs/superpowers/specs/2026-08-17-input-and-entry-polish-design.md`（已获用户批准 2026-08-17）

**分支：** `codex/input-and-entry-polish`（从主线 9f4b5a9 拉）。G1 由子 agent 实施，G2/G3 主 agent 实施。

---

### Task 1: G1 EPUB 输入（子 agent，TDD）

- [x] jszip 升为运行时依赖；`epubParser.ts`（container.xml→OPF→spine 顺序→去标签→虚拟分页管线；`epub_unreadable`/`doc_no_text`/`doc_too_long`）
- [x] documents 路由分发（.epub 优先、epub+zip Content-Type 兜底）+ format 'EPUB' 落盘（documentStore/bookTypes/admin 三处镜像）
- [x] admin 上传接受 .epub + 文案；测试：parser 6 + 路由 3 全绿

### Task 2: G2 spine 成本估算（TDD）

- [x] server `estimate.ts`：章页数×800 + 6000 预算；缺锚点按总页均摊 → 3 例绿
- [x] `GET /api/books/:id/estimate`（200/404）→ 2 例绿
- [x] admin `getEstimate`（payload 校验 3 例）+ BookProposalPage 逐章估算 + 页脚合计（仅真实书）

### Task 3: G3 starter 建议（TDD）

- [x] server `suggestions.ts`：悬崖（带天数）> 薄弱（mastery<0.3）> 继续读最近书，≤3 条 → 3 例绿
- [x] `GET /api/learner/suggestions` → 2 例绿
- [x] admin `getSuggestions`（payload 校验 4 例）+ 今日页「学习建议」区（有 bookId 可点击跳书；空不渲染）

### Task 4: 收尾

- [x] App.tsx 补 `epub_unreadable` 错误文案
- [x] tsc 零错误；server 441 / admin 312 全绿
