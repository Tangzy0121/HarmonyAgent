# 薄弱概念智能出题 设计规格

**状态：** 已获用户批准（DeepTutor 追赶总计划 Sprint H，2026-08-17）
**日期：** 2026-08-17
**分支：** `codex/adaptive-quiz`（叠于 `codex/reading-progress` `5a5d998`，合并顺序 E→F→H）
**对标：** DeepTutor Quiz/Deep Question（按学习者状态现场出题）

## 1. 目标

针对仪表盘识别的薄弱/悬崖概念，LLM 现场生成一道选择题并落为书内正式 quiz 块，答题/诊断/复习调度全部走既有链路。本项目首个新增 LLM 调用点。

## 2. 关键设计决策（与总计划的偏差，用户须知）

总计划写「生成题入 userCards/bank（复用 Sprint D 卡片模型）」。**但 Sprint D（question-bank）未合并且不在 F 支线上**，本分支拿不到 userCards 模型。改为：**生成题落为该概念所在章的正式 quiz 块（`origin: 'adaptive'` 标记），答题走既有 POST /:id/attempts，诊断/复习调度/掌握度零改动**。D 合并后这些题自然进题库派生读模型（bank 按 quiz 块派生），无需迁移。

## 3. 范围

**范围内**
- server：`POST /api/books/:id/concepts/:cid/quiz`——取概念上下文（所在章各块文本 + 该概念历史错误作答）调 LLM 生成单题（题干/4 选项/答案/解析/引用原文）；citation 子串硬校验（复用 chapterValidation 规则），失败重试 1 次，再失败 502；校验通过则以 `origin: 'adaptive'` quiz 块追加到该章末尾并持久化，201 返回块。每概念 adaptive 块 ≥3 → 409 `adaptive_limit_reached`。
- admin：仪表盘薄弱 Top5 与悬崖列表行加「出题练习」按钮（携带 conceptId/chapterId/bookId）；成功后跳来源书对应章（新题即在章末，可即时作答）；loading/失败态。
- domain 视图模型：DashboardConcept 增 conceptId/chapterId。

**范围外**：一次多题、非选择题、跨书出题、题目去重语义判断、mock 书出题。

## 4. 数据模型

```ts
interface QuizBlock { /* 既有字段 */ origin?: 'adaptive' }  // 缺省 = 成书生成
```

## 5. API

- `POST /api/books/:id/concepts/:cid/quiz`
  - 404 book_not_found / 409 concept_not_found / 409 adaptive_limit_reached / 502 adaptive_quiz_failed / 201 `{ block: QuizBlock }`
- 错误文案（admin）：adaptive_limit_reached「这个概念 already 有 3 道加试题，先去复习现有的」→ 定稿「这个概念的加试练习已达 3 道上限，先完成已有练习」；adaptive_quiz_failed「出题失败，请稍后重试」。

## 6. 验收

1. 对薄弱概念点「出题练习」→ 章末出现新 quiz 块，可正常作答、诊断、进复习调度。
2. 第 4 次对同一概念出题 → 409 专项文案。
3. LLM 返回 citation 非原文子串 → 重试 1 次后 502，不落脏块。
4. 零 API key → 明确报错不崩溃；mock 书无入口。
5. 既有测试全绿。
