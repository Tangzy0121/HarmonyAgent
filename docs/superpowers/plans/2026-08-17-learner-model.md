# 长期学习者模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跨书概念掌握度 + 遗忘悬崖 + 学习节律的实时派生学习者模型，反哺今日页推荐与学习地图合并节点。

**Architecture:** server 纯函数派生 `learnerProfile.ts`（规则引擎，LLM 零参与）+ 只读路由 `GET /api/learner/profile`；admin 今日页插入悬崖/节律候选、地图按归一化 label 合并跨书同名概念。

**Tech Stack:** Express 4 + TS、React + Vite、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-17-learner-model-design.md`（已获用户批准 2026-08-17）

## Global Constraints

- LLM 零参与模型数值；节点存在 ≠ 已学习；画像只读、不进日志、实时派生不落事实表。
- 今日页优先级：到期复习 > 遗忘悬崖 > 进行中 > 最新证据 > 节律建议；仍只突出一个下一步。
- mock 演示书行为不变；profile 拉取失败静默降级。

---

### Task 1: server 派生器

**Files:** Create `server/src/learning/learnerProfile.ts` + `.test.ts`

- [x] 失败测试 11 例（归一化/跨书合并/封顶/无作答概念/悬崖三分支/活跃天/streak×2/时段桶）
- [x] 实现 deriveLearnerProfile + normalizeConceptLabel（悬崖 1.5× 档位间隔；节律本地时区四桶；streak 含昨天起算）
- [x] 补 rhythm.studiedToday（13/13 通过）

### Task 2: 只读路由

**Files:** Create `server/src/routes/learner.ts` + `.test.ts`；Modify `server/src/index.ts`

- [x] 失败测试 2 例（空画像/跨书合并）→ 实现 → 通过（修复种子缺 createdAt 导致 list 排序 500）

### Task 3: admin profile API

**Files:** Create `admin/src/types/learnerProfile.ts`；Modify `admin/src/services/bookApi.ts` + `.test.ts`

- [x] getLearnerProfile + 载荷守卫（4 例，66/66 通过）

### Task 4: 今日页悬崖/节律候选

**Files:** Modify `admin/src/domain/todayNextStep.ts` + `.test.ts`、`admin/src/pages/TodayPage.tsx`

- [x] 失败测试 6 例（悬崖选书/缺书回退/无 profile 兼容/悬崖焦点/节律建议/反例两则）→ 实现 → 19/19 通过（修正测试时区陷阱）

### Task 5: 地图跨书合并节点

**Files:** Modify `admin/src/domain/bookMapProjection.ts` + `.test.ts`

- [x] 重写测试 8 例（label 作用域 id、跨书合并取最新 outcome、关系端点映射、确定性布局）→ 重写实现 → 8/8 通过

### Task 6: App 接线 + 收口

- [x] App：learnerProfile state + realBooks 变化后重派生 + pickTodayRealBook/TodayPage 注入
- [x] tsc + 双端全量（server 401 / admin 305）
- [x] worklog
