# HarmonyAgent 学习沉淀闭环（题库 + 对话沉淀）设计规格（草案，待评审）

**状态：** 已获用户批准（2026-08-17；待拍板 4 项全部按草案建议定稿：看板升级为「题库与掌握度」、问答卡规则拼装零 LLM、重练计入掌握度、错题优先排序不隐藏答对题）  
**日期：** 2026-08-17  
**适用范围：** HarmonyAgent 第二轮能力（Sprint D）  
**前置：** 互动学习书 MVP 规格（2026-08-09）、长期学习者模型规格（2026-08-17）

## 1. 设计结论

把分散的答题与 Agent 问答沉淀为**可重练的学习资产**。题库是既有数据的**派生读模型**（不落新事实表），收录每本书全部 quiz 题与闪卡，展示作答历史、掌握度与复习档位，支持单题重练——重练走既有 `POST /:id/attempts` 链路，证据、掌握度、调度自然累积。Agent 抽屉的回答新增两个沉淀动作：「存为笔记」（复用既有 notes 链路）与「存入题库」（规则拼装自问自答卡，进入闪卡复习体系）。全程零新增 LLM 调用。

## 2. 问题与目标

现状：题目答完即散——用户无法回看「我在哪些题上错过」，也无法针对单题重练；Agent 追问得到的回答留在抽屉里，关掉就再难找回。DeepTutor 的 Question Bank 与 chat-to-book references 分别解决了这两点，是本规格的参照。

目标：作答与问答都变成可找回、可重练、可复习的资产，强化「学习闭环」叙事，且不引入任何新的事实写入路径（重练=attempts，笔记=notes，问答卡=闪卡块）。

## 3. 范围

### 3.1 包含

- **题库读模型**：`GET /api/books/:id/bank` 返回该书全部 quiz 题与闪卡条目（题干/选项/正解/来源章/概念/作答次数/最近对错/掌握度/复习档位与到期时间），实时派生，不落表。
- **题库视图（admin）**：掌握度看板升级为「题库与掌握度」——按章/概念分组，错题优先排序，支持筛选（只看错题/只看到期）；单题「再练一次」原地作答，走 attempts 链路。
- **对话沉淀**：Agent 抽屉每条回答两个动作——
  - 「存为笔记」：回答正文存为当前章（聚焦块）的用户笔记，复用 `POST /:id/notes`；
  - 「存入题库」：生成自问自答卡（Q=用户问题原文，A=规则截取的回答首段 ≤200 字，hint=实际引用页码），追加为该书当前章的一张 `flash_cards` 用户卡，进入间隔重复调度。
- 闪卡用户卡的持久化：写书级 `userCards` 数组（新增字段，同 userNotes 的用户数据语义，不在生成白名单内，重新生成不得覆盖）。

### 3.2 明确排除

- LLM 生成题库题目、LLM 摘要问答卡（规则拼装）；
- 题库跨书聚合视图（首版按书组织；跨书掌握度已由学习者模型覆盖）；
- 自制题目（用户从零编题）；
- 题目分享/导出（导出 Markdown 已覆盖静态内容）；
- mock 演示书行为变更。

## 4. 数据与接口

### 题库条目（派生）

```text
BankItem
├── blockId, chapterId, kind: 'quiz' | 'flash_cards'
├── title（题干预览/卡片正面）, conceptId, conceptLabel
├── attempts: number, lastCorrect: boolean | null, mastery: 0..1（该块）
├── schedule: { stage, dueAt } | null
└── wrong: boolean（最近作答为错 → 错题优先排序依据）
```

- `GET /api/books/:id/bank` → `{ items: BankItem[] }`；派生逻辑复用 `mastery.ts` 与 `schedule.ts`，零 LLM。
- 重练：quiz 走 `POST /:id/attempts`（已支持同块多次作答）；闪卡走 `POST /:id/review/:blockId/result`（既有自评链路）。

### 对话沉淀

- 「存为笔记」：`POST /:id/notes`（既有），body = 回答纯文本（去掉引用标签标记）。
- 「存入题库」：`POST /:id/cards`，body `{ chapterId, front, back, hint? }` → 201 返回卡片；服务端追加到 `book.userCards`（`{ id, chapterId, front, back, hint?, createdAt }`）。复习时 `userCards` 与该章 `flash_cards` 块合并出卡（复习调度按卡 id 记录，沿用 `reviewSchedule`）。
- 上限：每书 userCards ≤ 100 张（防爆），超出返回 409 `card_limit_reached`。

## 5. 对现有结构的影响

| 模块 | 动作 |
| --- | --- |
| `server/src/books/` | 新增 `bank.ts`（题库派生纯函数）；`bookTypes.ts` 加 `userCards`（缺省 `[]`） |
| `server/src/routes/books.ts` | 新增 `GET /:id/bank`、`POST /:id/cards` |
| `admin/src/components/book/MasteryBoardSheet.tsx` | 升级为「题库与掌握度」视图（错题优先、筛选、重练） |
| `admin/src/components/AgentDrawer.tsx` | 回答卡片加「存为笔记 / 存入题库」动作 |
| `admin/src/services/bookApi.ts` | `getBank` / `addCard` + 载荷守卫 |

## 6. 边界与红线

- 题库/问答卡是用户数据与派生数据：不在生成白名单内，任何重新生成不得覆盖（沿用 userNotes 同等级保护，补测试锁死）。
- LLM 只出判分与话术；卡组卡、题库派生全部规则完成。
- 存笔记/存卡都有明确即时反馈（已存入/失败可重试），不静默。
- 对话内容仅在用户主动点击时沉淀，不自动入库（MVP 规格 §3.3「不自动把聊天写入知识地图」精神延伸）。

## 7. 验收标准

1. 答错一题后，题库视图该题标为错题且排在前面；「再练一次」答对后，掌握度与复习档位按既有公式更新。
2. Agent 回答点「存为笔记」→ 对应块下出现该笔记；重新生成其他章后笔记仍在。
3. Agent 回答点「存入题库」→ 该书当前章多出一张问答卡；到期后出现在复习队列。
4. userCards 达 100 张后再存 → 409 `card_limit_reached`。
5. 全程无 LLM 调用（测试空 fetchImpl 断言）。
6. server/admin 测试全绿。

## 8. 待拍板

1. 题库入口形态：掌握度看板升级为「题库与掌握度」——同意？
2. 问答卡规则拼装（Q=问题原文，A=回答首段 ≤200 字，hint=引用页码），不调 LLM——同意？
3. 重练作答计入掌握度（走同一 attempts 链路）——同意？
4. 错题默认优先排序但不隐藏答对题——同意？
