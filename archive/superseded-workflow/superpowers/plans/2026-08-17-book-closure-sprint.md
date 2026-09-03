# 互动学习书 MVP 闭环收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对照已批准规格 §14，把验收 #10（知识地图接真实书）、#11（今日页接真实数据）从「部分完成」补到「完成」，补真实书用户笔记入口，并完成正式验收与文档收口。

**Architecture:** admin 新增两个纯函数域模块（bookMapProjection / todayNextStep）从真实书数据派生展示态，页面经可选 props 注入、缺省回退 mock 演示；server 新增笔记读写窄路由（bookStore.update 原子落盘），admin 经 bookApi + 块级 BlockNotesSection 接入。

**Tech Stack:** React + Vite（admin）、Express 4 + TypeScript（server）、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-09-interactive-learning-book-mvp-design.md`（已获用户批准）

## Global Constraints

- 节点存在 ≠ 已学习：学习状态必须由 evidence/attempts 派生（规格 §9 红线）。
- 笔记是用户数据：写书级 `userNotes`，不在生成白名单内，任何生成流程不得覆盖（规格 §6.2）。
- mock 演示书（`ml-chapter-03`）行为不变；无真实书时地图/今日回退 mock 演示内容。
- 今日页只突出一个有依据的下一步：到期复习 > 进行中（提案/生成）> 最新证据（规格 §5.7/§10）。
- 协同纪律：commit 前 `git status` 核对；推送前 `pull --rebase`；不 force；HelpCC 本地化。

---

### Task 1: 真实书概念进知识地图（验收 #10）

**Files:**
- Create: `admin/src/domain/bookMapProjection.ts` / `.test.ts`
- Modify: `admin/src/pages/LearningMapPage.tsx`（可选 mapNodes/mapRelationships props）
- Modify: `admin/src/App.tsx`（projectBooksToMap(realBooks) 注入）

- [x] 写失败测试：空书/无概念章跳过、节点 bookId 前缀作用域、核心概念居中、已拒绝关系剔除、evidence 烘焙学习状态、多簇确定性布局（6 例）
- [x] 实现 projectBooksToMap：章=主题簇环形布局，concept=节点，候选/已确认关系=边
- [x] LearningMapPage 接 props，缺省回退 mock + projectLearningEvidence
- [x] App 注入，真实书无概念时回退 mock
- [x] tsc + admin 全量测试通过

### Task 2: 今日页接真实书数据（验收 #11）

**Files:**
- Create: `admin/src/domain/todayNextStep.ts` / `.test.ts`
- Modify: `admin/src/pages/TodayPage.tsx`（派生逻辑收进域函数）
- Modify: `admin/src/App.tsx`（pickTodayRealBook + continueToday）

- [x] 写失败测试：pickTodayRealBook 优先级与空态（6 例）、deriveTodayFocus 各分支（7 例）
- [x] 实现域函数；TodayPage 改为 deriveTodayFocus(book) ?? 静态演示内容
- [x] App：todayBook = todayRealBook ?? learningBook；CTA 打开真实书（提案→目录页，其余→阅读页）
- [x] tsc + admin 全量测试通过

### Task 3: 真实书用户笔记入口（验收 #14 红线）

**Files:**
- Modify: `server/src/routes/books.ts`（POST/DELETE /:id/notes + 日志白名单两类）
- Create: `server/src/routes/bookNotes.test.ts`
- Create: `admin/src/components/book/BlockNotesSection.tsx`
- Modify: `admin/src/services/bookApi.ts` / `.test.ts`、`admin/src/pages/InteractiveBookPage.tsx`、`admin/src/App.tsx`、`admin/src/index.css`

- [x] server 失败测试：201 落盘/400/404/409、删除 204/404、ready 章拒绝重新生成（409）、后续章生成不动笔记（8 例）
- [x] server 实现：bookStore.update 原子写；note 挂已存在块
- [x] admin bookApi 失败测试：addNote/deleteNote 正常与畸形载荷（5 例）后实现
- [x] UI：块级笔记列表/新增/删除，失败可重试提示；仅真实书渲染
- [x] 双端全量测试通过（admin 292 / server 377）
- [x] 单 commit 1662e38，pull --rebase 后推送 origin/codex/interactive-learning-book-mvp

### Task 4: 正式 E2E 验收 + 文档收口

- [x] 勾选 6 份既有计划 checkbox（real-book-generation Task 7 仅 Step 1 可勾，Step 2–6 浏览器侧未做留空）
- [x] 真实 E2E（20 页文本型 PDF，真实 DeepSeek，API 级 15/15 + 重启恢复核对；见 worklog `2026-08-17-book-closure-sprint-result.md`）
- [x] worklog 结果文档
- [x] 更新 memory/project-harmony-agent-contest.md
