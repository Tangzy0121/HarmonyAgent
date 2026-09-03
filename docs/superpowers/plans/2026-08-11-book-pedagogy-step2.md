# 学习闭环 MVP（Step 2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让学习书从"读物"变成"教练"：答题与掌握度持久化、摸底诊断定起点、错题重做、章末费曼检验、Agent 苏格拉底化。

**Architecture:** 服务端新增答题/摸底/费曼三个 JSON 端点（复用既有 json 路由、上游调用、审计日志模式），掌握度为纯函数模块；前端真实书答题改走服务端持久化，摸底与费曼为可选流程卡，错题复习队列由已持久化 attempts 派生，不新增存储结构以外的表。

**Tech Stack:** Express + tsx（server, vitest + supertest + chapterAwareFetch harness）、React 18 + Vite 5（admin, vitest + Fake DOM harness）。无新依赖。

**工作区：** `E:/Tang_Project/HarmonyAgent-worktrees/interactive-learning-book-mvp`，分支 `codex/interactive-learning-book-mvp`。规格：`docs/superpowers/specs/2026-08-10-book-pedagogy-design.md` §8。

## Global Constraints

- 只本地提交，**永不 push**；不碰原工作区；每次 commit 前 `git status` 核对暂存区。
- 双端类型镜像：`server/src/books/bookTypes.ts` 与 `admin/src/types/learningBook.ts` 字段逐一对应。
- 掌握度公式逐字如下：取该范围最近 5 次作答，按时间从近到远权重 (1.0, 0.95, 0.85, 0.7, 0.5) 加权正确率；作答 1 次封顶 0.5，2 次封顶 0.8，≥3 次不封顶。权重数组常量 `MASTERY_WEIGHTS = [1, 0.95, 0.85, 0.7, 0.5]`（索引 0 = 最近一次）。
- 摸底题：固定 5 道，选择题 2–4 个选项；`max_completion_tokens: 1500`，`response_format: json_object`，`temperature: 0.2`（与提案调用参数一致）。
- 费曼判定：`max_completion_tokens: 800`，json_object，输出 `{passed: boolean, feedback: string, gap: string}`；费曼结果**不持久化**（MVP 无状态，规格 §8 范围内）。
- 密钥不进响应/日志；上游错误体不记日志（沿用 safeErrorName/状态码白名单）；新端点复用 `emitLog`。
- 所有 LLM 输出走"不可信数据"包裹 + 伪造标签转义（沿用 `escapeDocumentData`/`wrapDocumentData` 模式）；引用类文本不进入摸底/费曼（这两处不需要 citation 硬校验）。
- 既有行为不破：mock 原型页、Agent /api/agent 契约、章节生成链路、旧书（无 attempts）打开正常。
- 文案简体中文；服务端错误 code 用 snake_case。
- 测试用既有 harness（server: `chapterAwareFetch`/`appWith`/`createConfirmedBook`；admin: Fake DOM 风格），不新增测试依赖。

---

### Task 1: 服务端答题持久化 + 掌握度纯函数 + attempts 端点

**Files:**
- Create: `server/src/books/mastery.ts`
- Modify: `server/src/routes/books.ts`（新增 POST `/:id/attempts`）
- Test: `server/src/books/mastery.test.ts`、`server/src/routes/books.test.ts`

**Interfaces:**
- Produces:
  - `computeMastery(attempts: { isCorrect: boolean; submittedAt: string }[]): number` —— 按 submittedAt 降序取前 5，weights `MASTERY_WEIGHTS`，封顶规则见 Global Constraints；空数组返回 0。
  - `POST /api/books/:id/attempts`，请求 `{blockId: string, answerId: string}`；成功 201 返回 `{attempt: QuizAttempt, evidence: LearningEvidence, mastery: { chapter: number, concept: number } }`；错误：404 `book_not_found`、409 `quiz_not_found` / `invalid_answer`、503 `chapter_not_configured` 不需要（无 LLM 调用）。
  - 服务端 QuizAttempt：`id = attempt_<randomUUID()>`，`submittedAt = new Date().toISOString()`；允许同一块多次作答（复习需要）。
  - 服务端 Evidence：`id = evidence_<randomUUID()>`，`conceptId` 取 quiz 块的 conceptId，`sourceBlockId = blockId`，`statement = 「${question}」答对/答错记录` 格式：`答对：${question}` 或 `答错待复习：${question}`（question ≤80 字符截断），`outcome = isCorrect ? 'mastered' : 'review'`，`createdAt` ISO。

- [x] **Step 1: mastery 纯函数失败测试**

```ts
// mastery.test.ts
// 空 → 0；一次答对 → 0.5（封顶）；两次都对 → 0.8（封顶）
// 三次都对 → 1；近→远权重：最新错+前四次对 = (0*1 + 1*(0.95+0.85+0.7+0.5)) / (1+0.95+0.85+0.7+0.5) = 3/4 = 0.75
// 超过 5 次只取最近 5 次；submittedAt 乱序输入按时间排序后取
expect(computeMastery([])).toBe(0)
expect(computeMastery([{ isCorrect: true, submittedAt: '2026-08-11T01:00:00Z' }])).toBe(0.5)
expect(computeMastery(fiveRecent)).toBe(0.75)
```

- [x] **Step 2: 端点失败测试**（books.test.ts，沿用 appWith/createConfirmedBook + chapterAwareFetch 让 ch-1 ready 后答题）

```ts
// 答对：201，attempt.isCorrect=true，evidence.outcome='mastered'，mastery.chapter=0.5
// 同一块再次作答：允许，返回第二条 attempt（id 不同）
// 答错后再答对：mastery.chapter 按最近作答重算
// blockId 不是 quiz → 409 quiz_not_found；answerId 不在 options → 409 invalid_answer
// 落盘核实：bookStore.get(id) 的 quizAttempts/evidence 包含新记录（刷新恢复的关键）
```

- [x] **Step 3: RED → 实现 → GREEN**

`mastery.ts` 实现（约 25 行纯函数）；books.ts 新增路由（无 LLM 调用，直接读写 bookStore；复用既有 404/409/500 模式与 `emitLog`，category 用新值 `'attempt_recorded'`，需加入 BooksLogEvent 联合）。mastery 的 chapter 范围 = 该章全部 quiz 块的 attempts；concept 范围 = 该 quiz 块 conceptId 对应块的 attempts。

- [x] **Step 4: server 全量 + build → Commit**

```bash
git add server/src/books/mastery.ts server/src/books/mastery.test.ts server/src/routes/books.ts server/src/routes/books.test.ts
git commit -m "feat(server): persist quiz attempts with mastery scoring endpoint"
```

---

### Task 2: 前端真实书答题走服务端 + 掌握度/学习状态展示

**Files:**
- Modify: `admin/src/services/bookApi.ts`（`submitAttempt(bookId, blockId, answerId)`）
- Modify: `admin/src/pages/InteractiveBookPage.tsx`（真实书 onSubmitQuiz 走服务端；mock 书保持本地 submitQuizAttempt）
- Modify: `admin/src/domain/learningProjection.ts`（若已有 learningState 投影则对齐新规则，否则扩展）
- Test: `admin/src/services/bookApi.test.ts`、页面级测试沿用 `App.realBook.test.tsx` 风格

**Interfaces:**
- Consumes: Task 1 的端点与返回形状。
- Produces: `submitAttempt(bookId: string, blockId: string, answerId: string): Promise<{ attempt: QuizAttempt; evidence: LearningEvidence; mastery: { chapter: number; concept: number } }>`（守卫校验返回形状，非法抛 BookApiError）。
- 展示规则：章节卡/章标题处显示掌握度百分比（仅当该章有 attempts）；概念 `learningState`：无作答→'暂无学习记录'，最近一次答错→'待复习'，其余→'已学习'（客户端从 attempts 派生，不改服务端块数据）。
- 已答过的 quiz 块展示最近一次结果；答错的块允许"重新作答"（清掉选中态再提交，服务端多次记录）。

- [x] **Step 1: 失败测试**：bookApi.submitAttempt 形状守卫（201 正常/409 code 透传）；真实书答题后 attempts 出现在页面且刷新（重新 getBook）后仍在；答错块出现"重新作答"。
- [x] **Step 2: RED → 实现 → GREEN**：mock fetch 模式照抄 bookApi.test.ts 现有用例。
- [x] **Step 3: admin 全量 + build → Commit** `feat(admin): submit real-book quiz attempts to server with mastery display`

---

### Task 3: 摸底诊断服务端（pretest 生成 + 提交判定）

**Files:**
- Create: `server/src/books/pretestPrompt.ts`、`server/src/books/pretestValidation.ts`
- Modify: `server/src/books/bookTypes.ts`、`admin/src/types/learningBook.ts`（镜像）
- Modify: `server/src/routes/books.ts`（POST `/:id/pretest`、POST `/:id/pretest/result`）
- Test: 对应三个测试文件

**Interfaces:**
- Produces:
  - 类型镜像：`PretestQuestion { id: string; chapterId: string; question: string; options: { id: string; marker: string; text: string }[]; correctAnswerId: string; explanation: string }`；`LearningBook.pretest?: { questions: PretestQuestion[]; result: null | { answers: Record<string, string>; suggestedStartChapterId: string; skippableChapterIds: string[]; submittedAt: string } }`（可选字段，旧书无此字段必须能过守卫）。
  - `POST /:id/pretest`：仅书状态非 proposal 且 `pretest` 不存在时生成（已存在则直接返回现存量，幂等）；409 `pretest_unavailable`（proposal 状态）；上游/校验失败 502 `upstream_unavailable`。
  - `POST /:id/pretest/result`：请求 `{answers: Record<questionId, optionId>}`；判定规则——某章 5 题中**该章关联题**全对 → 进 skippableChapterIds；suggestedStartChapterId = 第一个非可跳过章（全可跳过则为最后一章）；落盘返回整书。
  - 生成提示词（pretestPrompt.ts）：基于书名+目录+各章 objective（不传原文全文），5 题覆盖不同章，json_object；校验（pretestValidation.ts）：5 题、选项 2–4、correctAnswerId 命中、chapterId 必须是真实章节 id——非法即 pretest_invalid 重试一次后 502。

- [x] **Step 1: 失败测试**（生成形状/校验丢弃/幂等返回/result 判定三态：全对可跳过、部分对、全错）
- [x] **Step 2: RED → 实现 → GREEN → server 全量 + build**
- [x] **Step 3: Commit** `feat(server): add diagnostic pretest generation and scoring endpoints`

---

### Task 4: 摸底诊断前端流程

**Files:**
- Modify: `admin/src/services/bookApi.ts`（`getPretest`/`submitPretest`）
- Create: `admin/src/components/book/PretestSheet.tsx`（底部弹层，5 题依次作答→提交→结论）
- Modify: 提案确认后的页面（确认完成→出现"先摸底（5 题）"可选入口；结果后章节轨标注"可跳过/建议从这里开始"）
- Test: `admin/src/components/book/PretestSheet.test.tsx` + bookApi 守卫用例

**Interfaces:**
- Consumes: Task 3 端点；`getPretest(bookId)` 返回 `{ questions: PretestQuestion[] }`；`submitPretest(bookId, answers)` 返回整书（parseLearningBook 过守卫，含 pretest.result）。
- UI 约束：可选、可跳过（"直接开始生成"不受影响）；44px 触控；320px 无溢出；结论页给出建议起点按钮（点击跳到该章）。

- [x] **Step 1: 失败测试**（5 题流→提交→结论渲染可跳过标注；跳过入口不阻塞直接生成）
- [x] **Step 2: RED → 实现 → GREEN → admin 全量 + build**
- [x] **Step 3: Commit** `feat(admin): add optional pretest flow with chapter recommendations`

---

### Task 5: 错题重做（复习队列）

**Files:**
- Create: `admin/src/domain/reviewQueue.ts`
- Modify: 章节末/书级入口组件（章节块列表尾部 + 知识库书卡各加"复习错题"入口，仅当有错题时显示）
- Test: `admin/src/domain/reviewQueue.test.ts` + 组件测试

**Interfaces:**
- Consumes: 已持久化的 quizAttempts（Task 1/2）。
- Produces: `buildReviewQueue(book: LearningBook): { chapterId: string; blockId: string; question: string }[]`——规则：按块分组取**最近一次**作答，答错且之后无答对记录的块入队，按提交时间升序。
- 交互：复习入口打开含这些 quiz 块的列表（复用 BookBlockRenderer quiz 渲染，服务端已支持多次作答）；答对后该项出队（最近一次为对）。

- [x] **Step 1: 失败测试**（答错入队/答对出队/先错后对出队/多块排序；空队列不渲染入口）
- [x] **Step 2: RED → 实现 → GREEN → admin 全量 + build**
- [x] **Step 3: Commit** `feat(admin): add wrong-answer review queue derived from persisted attempts`

---

### Task 6: 费曼检验（章末"用自己的话讲讲"）

**Files:**
- Create: `server/src/books/feynmanPrompt.ts`
- Modify: `server/src/routes/books.ts`（POST `/:id/chapters/:cid/feynman`）
- Create: `admin/src/components/book/FeynmanCard.tsx`
- Modify: 章节块列表尾部（quiz 之后挂 FeynmanCard，仅章 ready 时显示）
- Test: server 路由测试 + admin 组件测试

**Interfaces:**
- Produces:
  - 端点：请求 `{explanation: string}`（trim 后 1–2000 字符，非法 400 `invalid_request`；章非 ready 409 `chapter_not_generatable` 复用）；上游 json_object 输出 `{passed, feedback, gap}`，校验失败重试一次后 502；返回 `{passed: boolean, feedback: string, gap: string}`。**不持久化**。
  - 提示词要点：给章节 title+objective+各块 keyPoint 摘要（≤2000 字符，走不可信包裹），判定学生复述是否抓住核心；passed 标准宽松（覆盖主要概念即可），gap 指出缺失点。
  - 前端：`FeynmanCard` 输入框（≤2000 字计数）→ 提交（loading）→ 结果卡（passed 显示鼓励+feedback；未过显示 gap + "回看建议"链接到相关块）。FE 守卫校验返回形状。

- [x] **Step 1: 失败测试**（server：200 passed/gap 形状、400/409/502 路径、提示词不含密钥；admin：提交流程与两种结果渲染）
- [x] **Step 2: RED → 实现 → GREEN → 双端全量 + build**
- [x] **Step 3: Commit** `feat: add per-chapter Feynman self-explanation check`

---

### Task 7: Agent 苏格拉底化 + 真实 E2E 验收

**Files:**
- Modify: `server/src/agent/bookAgentPrompt.ts`（system 规则追加）
- Test: `server/src/agent/bookAgentPrompt.test.ts`；E2E 证据 `.superpowers/book-pedagogy/step2-e2e.md`

**Interfaces:**
- system 规则追加（不改变既有证据/安全规则）：
  - '你是辅导员而非讲解员：先判断学生卡在哪里，再给最小提示，不直接给完整答案；学生连续两次未答对才给完整解答。'
  - '每次回复不超过 200 字，并以一个引导学生思考的追问结尾。'
- E2E 断言（真实 DeepSeek，复用 8 页测试 PDF 新建一本书）：
  1. 答题后刷新页面，作答记录与掌握度仍在
  2. 摸底：确认目录后完成 5 题，出现"可跳过/建议起点"标注
  3. 答错一题 → 复习入口出现 → 重做对 → 出队
  4. 章末费曼：随便写一句 → 得到 passed/gap 反馈
  5. Agent 提问 → 回复 ≤200 字且以问句结尾、不直接给答案（真实链路目测）
  6. 320/390 零溢出；控制台无错误
- 发现的缺陷 TDD 修复后 commit；minor 记 HelpCC 延期清单。

- [x] **Step 1: 提示词测试 + 实现（server 全量 + build）→ Commit** `feat(server): make book agent socratic`
- [x] **Step 2: 真实 E2E 六项断言全过 + 证据落盘**
- [x] **Step 3: 全分支终审（review-package 自本计划 BASE 到 HEAD）**

---

## Self-Review 记录

- Spec §8 覆盖：摸底（T3/T4）、掌握度持久化量化（T1/T2）、错题重做（T5）、费曼（T6）、Agent 苏格拉底化（T7）。学习状态挂 concept.learningState（T2 派生规则）。
- 跨任务类型一致性：`PretestQuestion`、`submitAttempt` 返回形状、Evidence statement 格式在 T1 定义、T2/T4 消费，字面一致。
- 明确不做（与 spec §2.3 一致）：跨天间隔重复、IRT/BKT、费曼持久化、错题四类诊断分类。
- 已知风险：摸底题 LLM 可能产出重复/偏题（校验+重试兜底；E2E 实测）；掌握度百分比展示位置走现有章节卡，不新设计页面。
