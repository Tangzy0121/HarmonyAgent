# 学习沉淀闭环（题库 + 对话沉淀）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 答题与 Agent 问答沉淀为可重练资产：题库派生读模型（错题优先、原地重练）+ 对话沉淀（存为笔记/存入题库问答卡），零新增 LLM。

**Architecture:** server `bank.ts` 派生 + `GET /:id/bank`、`POST /:id/cards`（userCards ≤100）+ userCards 复习轻量调度路径；admin 看板升级「题库与掌握度」+ AgentDrawer 沉淀动作。

**Tech Stack:** Express 4 + TS、React + Vite、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-17-question-bank-design.md`（已获用户批准 2026-08-17）

## Global Constraints

- 题库派生不落表；userCards 是用户数据，不在生成白名单内，重新生成不得覆盖。
- 零新增 LLM 调用；问答卡规则拼装（Q=问题原文，A=回答首段 ≤200 字，hint=引用页码）。
- 重练走既有 attempts / review 链路，计入掌握度。
- mock 演示书行为不变。

---

### Task 1: bank 派生 + userCards 类型

**Files:** Create `server/src/books/bank.ts` + `.test.ts`；Modify `server/src/books/bookTypes.ts`（UserCard）

- [x] 失败测试 6 例（空书/作答统计/错题优先/闪卡调度/问答卡收录/概念 label 解析）
- [x] 实现 buildBankItems（quiz+flash_cards+userCards，错题优先、掌握度升序）

### Task 2: 路由 + 复习合并

**Files:** Modify `server/src/routes/books.ts`（GET bank、POST cards、review result 收 userCards）、`server/src/books/schedule.ts`（listDueItems 收 userCards）；Create `server/src/routes/bookBank.test.ts`

- [x] 失败测试 7 例（bank 统计与 404/cards 201 与校验与上限 409/后续章生成不动卡/due 收录与自评推进）
- [x] 实现；userCards 复习走 applyReviewGrade 轻量路径（不经 evidenceService）
- [x] 修复：bookStore 不做 userCards 迁移注入（各消费点 `?? []` 容错），保住 roundtrip 相等性

### Task 3: admin API + 类型

**Files:** Modify `admin/src/types/learningBook.ts`（UserCard/BankItem）、`admin/src/services/bookApi.ts` + `.test.ts`

- [x] getBank/addCard + 载荷守卫（6 例，72/72 通过）

### Task 4: UI + 接线

**Files:** Modify `admin/src/components/book/MasteryBoardSheet.tsx`（题库区+原地重练+自评）、`admin/src/components/AgentDrawer.tsx`（存为笔记/存入题库动作+反馈）、`admin/src/App.tsx`（bankItems 拉取+capture 处理器+接线）、`admin/src/index.css`

- [x] 看板升级「题库与掌握度」；App.realBook 测试断言同步新标题
- [x] tsc + 双端全量（server 435 / admin 311）

### Task 5: 收口

- [x] worklog + 记忆更新 + commit push（codex/question-bank）
