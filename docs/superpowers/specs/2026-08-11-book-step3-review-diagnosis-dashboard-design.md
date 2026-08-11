# Step 3 批次一设计：间隔重复调度 + 错题四类诊断 + 掌握度看板

日期：2026-08-11
工作区：`E:/Tang_Project/HarmonyAgent-worktrees/interactive-learning-book-mvp`（分支 `codex/interactive-learning-book-mvp`）
前置：Step 1（内容形态）、Step 2（学习闭环 MVP）已交付。参数探索器（widget）属 Step 4，不在本 spec。

## 目标

让"学过"变成"记住"：答错的题和翻过的闪卡按间隔序列到期重现，答错时给出错误类型诊断与针对性补救，全书掌握状态一页可见。借鉴 DeepTutor Mastery Path（掌握后进入间隔重复调度 + 目标状态仪表盘），不引入完整 FSRS 算法。

## M1 间隔重复调度

### 数据模型

`StoredBook` 新增可选字段：

```ts
reviewSchedule?: Record<string, ReviewScheduleEntry>  // key = blockId

interface ReviewScheduleEntry {
  kind: 'quiz' | 'flash_cards'
  stage: number          // 当前间隔档位，从 0 开始
  lapses: number         // 答错/没记住次数
  dueAt: string          // ISO 时间；<= now 即到期
  updatedAt: string
}
```

旧书无此字段，读取时按 `{}` 处理，不写迁移。

### 间隔序列（固定档，不做 FSRS）

- `quiz`（短序列）：`[1, 4, 10]` 天
- `flash_cards`（记忆序列）：`[1, 3, 7, 16, 35]` 天

规则（纯函数 `server/src/books/schedule.ts`，时钟以参数注入便于测试）：

- quiz 答错（`POST /:id/attempts` 内）：入调度或重置 —— `stage=0, lapses+1, dueAt=now`（当天即可复习）。
- quiz 答对：若该块在调度中，`stage+1`；`stage` 未越界则 `dueAt = now + intervals[stage]`，越界（走完序列）则**毕业**：从 `reviewSchedule` 删除。未答错过的 quiz 块不入调度。
- flash_cards 自评（新 API）：「记住了」→ 未入调度则 `stage=0` 入调度，`dueAt = now + intervals[0]`；已在调度则 `stage+1`，越界毕业。「没记住」→ `stage=0, lapses+1, dueAt=now`。
- 同一块只有一个调度项；块被删除/重建（重生成换 id）时旧调度项自然失效（读取时过滤书中不存在的 blockId）。

### API

- `GET /api/books/:id/review/due` → `200 { items: DueItem[] }`，`DueItem = { blockId, chapterId, kind, title, dueAt, stage, lapses }`，按 dueAt 升序；只含 `dueAt <= now` 且块仍存在的项。无 LLM 调用。
- `POST /api/books/:id/review/:blockId/result`，body `{ result: 'remembered' | 'forgotten' }`，仅限 flash_cards 块；quiz 复习作答走既有 `POST /:id/attempts`（其内部同步更新调度）。响应 `200 { schedule: ReviewScheduleEntry | null, mastery? }`（毕业时为 null）。错误：块不存在/类型不符 `409 review_target_invalid`，书不存在 `404`。
- `POST /:id/attempts` 响应的 `attempt` 不变，另在响应体加 `schedule: ReviewScheduleEntry | null`（该块的调度新状态）。

### UI

- 书页顶部（章列表旁）新增「今日复习」入口，带到期数徽标；点击打开复习 Sheet。
- 复习 Sheet 数据源由"派生错题队列"（`buildReviewQueue`，最近答错即入队）改为 `GET review/due`：quiz 项重新作答（走 attempts），flash_cards 项翻卡后自评「记住了/没记住」。**行为变化**：答错后立即答对不再直接出队，而是进入短间隔序列，走完才消失——这是本 spec 有意的语义变更。
- `admin/src/domain/reviewQueue.ts` 的派生逻辑随之失去消费者，**删除该文件及其测试**；复习入口统一走 due API，避免"错题队列"与"调度到期"两套语义并存。

## M2 错题四类诊断

### 分类

答错时（`POST /:id/attempts`，`isCorrect=false`）同步做一次轻量 LLM 分类，输出四选一：

| type | 含义 | 补救引导方向 |
| ---- | ---- | ------------ |
| `concept` | 概念不清 | 回到对应概念/讲解块 |
| `application` | 会概念但不会用 | 看例子块、追问 Agent 带场景 |
| `misread` | 审题偏差 | 重读题干，对比选项差异 |
| `overconfident` | 大概会但做错 | 费曼复述该概念 |

分类输入：题干、选项、所选与正确项、所属概念 label、章标题；不引入原文大段摘录（控制 token）。输出 `{ type, advice }`（advice ≤ 60 字）。

### 降级与契约

- LLM 未配置 / 调用失败 / 输出非法 → `diagnosis: null`（「未诊断」），**不阻塞答题**，响应仍为 201。
- `QuizAttempt` 增加可选字段 `diagnosis?: { type: DiagnosisType; advice: string } | null`；`POST /:id/attempts` 201 响应增加 `diagnosis` 字段（答对时为 `null`）。
- 审计日志加 `attempt_diagnosed` / `attempt_diagnosis_failed` 类别，不记录题干全文以外的敏感信息（题干本就非敏感）。

### UI

- quiz 反馈区（答错时）在现有 feedback 文案下显示诊断标签（如「概念不清」）+ advice 一句 + 「带着诊断问 Agent」按钮：点击后打开 Agent 抽屉并预填草稿「我刚才在【题干预览】这道题答错了，错误类型是【诊断标签】。请用提问引导我，而不是直接给答案。」（复用现有带上下文提问链路，不新增 API）。

## M3 掌握度看板

- 书级 Sheet/视图「掌握度总览」，入口在书页头部（与「今日复习」并列）。
- 行 = 章 × 概念（来自 concept 块的 concepts），列：概念名、状态、掌握度百分比。
- 状态机（纯前端投影 `admin/src/domain/masteryBoard.ts`，输入为书 JSON，与 server mastery 同规则）：
  - `未学`：该概念无任何 quiz attempt；
  - `起步`：有 attempt 但掌握度 < 0.5；
  - `掌握中`：0.5 ≤ 掌握度 < 0.8；
  - `已掌握`：≥ 0.8 且关联块无到期调度项；
  - `待复习`：该概念关联块存在 `dueAt <= now` 的调度项（优先级高于已掌握/掌握中）。
- 掌握度数值复用 `admin/src/domain/learningProjection.ts` 的镜像实现（与 server `computeMastery` 逐字一致，本 spec 不改算法）。
- 点击概念行 → 跳到对应章的概念块。

## 非目标

- 完整 FSRS/Anki 算法、跨书调度、复习推送通知、多用户；
- widget 参数探索器（Step 4）；鸿蒙迁移；
- 诊断的用户手工修正（后续可加）。

## 测试策略

- `schedule.ts` 纯函数：入队/进阶/毕业/重置/序列边界/旧书无字段兼容；时钟注入。
- 路由：due 列表过滤（未到期/块已删/书不存在）、review result 类型校验、attempts 答错带诊断与降级 null、调度字段在响应中的形状。
- 诊断：四类合法输出解析、非法输出降级、未配置 LLM 降级。
- 前端：复习 Sheet 两种形态（quiz 作答 / 闪卡自评）、徽标计数、诊断展示与问 Agent 草稿预填、看板五状态投影。
- E2E（真实 DeepSeek）：答错 → 诊断出现 → 今日复习出现该项 → 复习答对 → 进入下一档 → 看板状态变化。

## 风险

- 诊断同步调用增加答题延迟：预算 ≤ 800 tokens、单次不重试；失败即 null。若实测过慢，改为异步（响应先返回，抽屉轮询）——实现计划中先按同步做，E2E 时实测。
- 复习语义变更影响既有 ReviewQueueSheet 测试：按新语义改写测试，不保留旧断言。
