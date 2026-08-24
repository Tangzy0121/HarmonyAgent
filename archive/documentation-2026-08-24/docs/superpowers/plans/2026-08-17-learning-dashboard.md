# 学习仪表盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「学习数据」页（坚持/掌握/节律三区），全部从 LearnerProfile 纯派生，今日页卡片入口，`#learning-data` hash 可恢复。

**Architecture:** server `LearningRhythm` 增补 `activeDayKeys`（近 30 天活跃日，YYYY-MM-DD 升序）；admin 新增 `learningDashboard.ts` 纯函数视图模型（分桶/薄弱 Top5/悬崖/30 格热力）+ `LearningDataPage.tsx`；TodayPage 加学习数据卡片；App.tsx 以独立布尔 state + hash 约定接线。

**Tech Stack:** Express 4 + TS、React + Vite、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-17-learning-dashboard-design.md`（已获用户批准 2026-08-17）

## Global Constraints

- 零新增 LLM 调用；零 mock 数据泄漏（空态给引导文案）。
- 时区纪律：日期键一律本地时区构造（`new Date(y, m, d)`），不用 UTC 串。
- 不碰 mock 书行为；不改动既有 Destination 三值类型。

---

### Task 1: server activeDayKeys

**Files:** Modify `server/src/learning/learnerProfile.ts` + `.test.ts`

- [x] `LearningRhythm` 新增 `activeDayKeys: string[]`；`localDayKey` 改补零 ISO 格式；空事件分支返回 `[]`
- [x] 测试断言长度/升序/格式正则 → learnerProfile + learner 路由共 13 通过

### Task 2: admin 类型与校验镜像

**Files:** Modify `admin/src/types/learnerProfile.ts`、`admin/src/services/bookApi.ts` + `.test.ts`

- [x] 类型镜像 activeDayKeys；`isRhythmPayload` 增校验；夹具同步 → bookApi 66 通过

### Task 3: 视图模型（TDD）

**Files:** Create `admin/src/domain/learningDashboard.ts` + `.test.ts`

- [x] 失败测试 9 例（四桶/边界 0.8/0.3/空列表/Top5 升序跳无记录/悬崖过滤/无来源 bookId=null/30 格热力/空 activeDayKeys/节律透传）
- [x] 实现 → 9/9 通过

### Task 4: LearningDataPage + 样式

**Files:** Create `admin/src/pages/LearningDataPage.tsx`；Modify `admin/src/index.css`

- [x] 三区（坚持：streak+30 格热力+今日标记；掌握：分桶计数+薄弱 Top5+悬崖「去复习」；节律：四桶条形+日均事件）；空态引导文案
- [x] index.css 追加单行规则（沿用 #9c5848 / rgb(35 31 29 / x) 色板）

### Task 5: TodayPage 卡片 + App 接线

**Files:** Modify `admin/src/pages/TodayPage.tsx`、`admin/src/App.tsx`

- [x] TodayPage 新增 `onOpenLearningData`，learnerProfile 非空时显示 streak 摘要卡片
- [x] App：`learningDataHash = '#learning-data'`、`isLearningDataOpen` state（初始读 hash）、popstate 同步、openLearningData、selectDestination/openRealBook 关闭、三页 isActive 互斥、渲染接线（onOpenBook=openRealBook）

### Task 6: 全量验证

- [x] `npx tsc --noEmit` 零错误（补 todayNextStep.test 夹具 activeDayKeys）
- [x] admin 314 全绿 / server 422 全绿
- [x] 规格验收 4 条：streak 显示、悬崖跳来源书、空态无 mock、`#learning-data` 刷新可恢复
