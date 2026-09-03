# 阅读进度 + 全书完成度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 真实记录章节阅读进度（已读/书签/最近时间），派生完成度分数与薄弱章节，仪表盘与阅读器呈现。零新增 LLM。

**Architecture:** server `readingProgress.ts` 纯函数（applyProgressEvent 幂等 + deriveCompletion 0.4/0.6 加权）+ 两个路由；admin 切章防抖上报 + 书签按钮 + 仪表盘完成度区 + 今日页「继续读」。

**Tech Stack:** Express 4 + TS、React + Vite、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-17-reading-progress-design.md`（已获用户批准 2026-08-17）

**分支说明：** 从 `codex/learning-dashboard`（E 分支 `b64396d`）叠拉——完成度区挂在学习数据页，该页仅存在于 E；合并时按 E → F 顺序。

## Global Constraints

- 零新增 LLM；mock 书行为零变化；存量书无 readingProgress 自动初始化。
- 失败静默（上报/完成度拉取不阻断阅读）；书签乐观更新失败回滚。

---

### Task 1: server 纯函数（TDD）

**Files:** Create `server/src/books/readingProgress.ts` + `.test.ts`；Modify `bookTypes.ts`

- [x] ReadingProgress 类型 + StoredBook.readingProgress?
- [x] 失败测试 7 例（visit 幂等/书签幂等/自动初始化/0.4+0.6 加权/幽灵 id 不计/薄弱章升序/零进度）→ 7/7 通过

### Task 2: server 路由（TDD）

**Files:** Modify `server/src/routes/books.ts`；Create `server/src/routes/booksProgress.test.ts`

- [x] POST /:id/progress（400/404/409/200 幂等持久化）+ GET /:id/completion（200/404）→ 5/5 通过；server 全量 434 绿

### Task 3: admin 类型与 API（TDD）

**Files:** Modify `admin/src/types/learningBook.ts`、`admin/src/services/bookApi.ts` + `.test.ts`

- [x] ReadingProgress/BookCompletion 镜像 + postReadingProgress/getCompletion + payload 校验 → bookApi 74 绿

### Task 4: admin 交互接线

**Files:** Modify `admin/src/App.tsx`、`InteractiveBookPage.tsx`、`LearningDataPage.tsx`、`TodayPage.tsx`、`index.css`

- [x] 切章/开书防抖 800ms 上报 visit；导航头部书签按钮（aria-pressed）；仪表盘「完成度」区（进度条+薄弱章「去复习」）；今日页卡片「继续读《书名》章节」
- [x] 修复测试时序抖动：App.realBook.test.tsx 上传用例补一轮 flushEffects（5/5 稳定）

### Task 5: 全量验证

- [x] tsc 零错误；server 434 / admin 322 全绿
- [x] 验收 5 条逐条过（持久化/分数手算可对/薄弱章跳书/零进度不渲染/mock 零变化）
