# 薄弱概念智能出题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 薄弱/悬崖概念 LLM 现场出单选题，落为章末正式 quiz 块（origin:'adaptive'），答题/诊断/调度走既有链路。首个新增 LLM 调用点。

**Spec:** `docs/superpowers/specs/2026-08-17-adaptive-quiz-design.md`（已获用户批准 2026-08-17）

**分支：** `codex/adaptive-quiz`（叠于 F `5a5d998`，合并顺序 E→F→H）。实施：coder 子 agent，主 agent 复核。

---

### Task 1: server 生成管线（TDD）

- [x] QuizBlock.origin?: 'adaptive'；`adaptiveQuizPrompt.ts`（buildMessages + normalize，excerpt 去空白子串硬校验）→ 13 例
- [x] `POST /:id/concepts/:cid/quiz`（404/409 concept_not_found/409 adaptive_limit_reached/503 not_configured/502 failed 重试 1 次/201 落块持久化）→ 8 例

### Task 2: admin（TDD）

- [x] DashboardConcept 增 conceptId/chapterId；quiz 守卫放行 origin:'adaptive'
- [x] `postAdaptiveQuiz`（201 解析/409/502 透传/malformed 拒绝）→ 6 例
- [x] LearningDataPage 薄弱/悬崖行「出题练习」按钮（pending 防重、按 code 提示上限/失败）→ 3 例；App generateAdaptiveQuiz 成功跳书
- [x] index.css 单行样式

### Task 3: 验证

- [x] server 455 全绿 + tsc 零错误（顺手修复 F 遗留的 BooksLogEvent reading_progress 类型缺失）
- [x] admin 331 全绿 + tsc 零错误
