# HarmonyAgent 长期学习者模型设计规格（草案，待评审）

**状态：** 已获用户批准（2026-08-17；待拍板 4 项全部按草案建议定稿：label 归一、悬崖阈值 1.5×、节律建议进今日页、displayLabel 取最近写法）  
**日期：** 2026-08-17  
**适用范围：** HarmonyAgent 第二轮能力（Sprint B）  
**前置：** 互动学习书 MVP 规格（2026-08-09）与本规格冲突时以本规格为准；本规格不推翻 MVP 的任何写入边界

## 1. 设计结论

把分散在各本学习书里的答题、证据与复习记录，实时派生成一个**跨书的长期学习者模型**：概念掌握度画像 + 学习节律画像。模型只由**规则引擎**计算与写入，LLM 不参与模型数值。模型的第一反哺点是**今日页下一步推荐升级**（加入「遗忘悬崖」与「学习节律」两条新依据），第二是**学习地图节点状态口径统一**（跨书同一概念合并显示）。

本阶段不做实体对齐 LLM 调用、不做情绪/认知诊断、不改学习者模型驱动内容生成的任何链路。

## 2. 问题与目标

现状：掌握度、复习调度、学习证据都按「单本书」组织。今日页只能看到单书的最近证据；地图上跨书同名概念是不同节点；系统不知道用户「通常在晚上学、连续学了几天、哪个概念在多本书里都错」。这正是立项卖点「自迭代学习伙伴」缺的那一层。

目标：不新增任何用户操作，仅利用既有数据（quizAttempts / evidence / reviewSchedule 的时间戳与结果）派生可解释的学习者画像，并让今日推荐更有依据。

## 3. 范围

### 3.1 包含

- 跨书概念掌握度画像：按**归一化 label** 合并同名概念（小写、去首尾空格、去全半角差异），聚合其全部 quiz attempts 计算掌握度（复用 `mastery.ts` 同公式：近 5 次加权、1 次封顶 0.5、2 次 0.8）。
- 遗忘悬崖预警：概念最近一次答对距今超过其复习调度当前档位间隔的 1.5 倍，且无后续作答 → 标记「遗忘悬崖」。
- 学习节律画像：近 30 天活跃天数、连续学习天数、活跃时段分布（上午/下午/晚上/深夜四桶）、日均学习事件数。
- 今日页推荐升级：优先级调整为 **到期复习 > 遗忘悬崖 > 进行中（提案/生成）> 最新证据 > 节律建议**；仍只突出一个下一步。
- 学习地图：跨书同名概念合并为一个节点（掌握度按上式聚合），节点仍只读投影。
- 只读 API：`GET /api/learner/profile` 返回上述全部派生结果（供 admin 今日页/地图消费）。

### 3.2 明确排除

- LLM 参与模型数值计算、实体对齐、自然语言画像生成；
- 情绪、认知风格、能力倾向等推断性标签；
- 用学习者模型改变学习书事实内容或生成内容；
- 跨设备同步、多用户；
- 对 mock 演示书生效（mock 原型行为不变）。

## 4. 数据模型

全部为**派生读模型**，不落独立事实表；事实来源仍是各书的 userNotes / quizAttempts / evidence / reviewSchedule。

```text
LearnerProfile
├── concepts: ConceptMastery[]
│     ├── label（归一化）, displayLabel（最近一次出现的原始写法）
│     ├── mastery: 0..1（mastery.ts 同公式）
│     ├── attempts: number, lastOutcome, lastAttemptAt
│     ├── sources: [{ bookId, chapterId, conceptId }]（可追溯）
│     └── forgettingCliff: boolean
├── rhythm: LearningRhythm
│     ├── activeDays30: number, streakDays: number
│     ├── periodDistribution: { morning, afternoon, evening, night }（各 0..1）
│     └── dailyAverageEvents: number
└── derivedAt: ISO 时间戳
```

派生时机：API 请求时实时计算（书数量小、事件量万级以内，暴力计算可接受）；不建 outbox/读模型缓存——若后续性能不足再沿用 masteryProjector 的 outbox 模式加缓存，属实现细节变更，不改本规格语义。

## 5. 计算规则（规则引擎，LLM 零参与）

- **归一化**：`normalizeLabel(label) = label.trim().toLowerCase()` 并做全角→半角折叠；同归一化 key 的概念合并。
- **掌握度**：合并后概念的全部 attempts 按 `mastery.ts` 公式（近 5 次、权重 1/0.95/0.85/0.7/0.5、1 次封顶 0.5、2 次 0.8）。
- **遗忘悬崖**：存在该概念相关 quiz 块的 reviewSchedule 条目时，`now - lastAttemptAt > 1.5 × 当前档位间隔` 且最近 outcome 为 mastered → true；无调度条目的概念不产生悬崖（避免噪声）。
- **节律**：事件 = quizAttempts ∪ evidence 的 createdAt；时段桶：06–12 上午、12–18 下午、18–23 晚上、23–06 深夜（本地时区）；streak = 含今天或昨天的连续活跃天数。
- **今日推荐**：在 `todayNextStep` 既有优先级中，「到期复习」之后插入「遗忘悬崖」（取 mastery 最高且 cliff 的概念所属书）；全部无候选时，若当日尚无学习事件且处于用户最活跃时段桶，给「节律建议」（回到最近在读的书）。

## 6. 边界与红线

- 节点/概念存在 ≠ 已学习；一切状态由 attempts/evidence 推导（沿用规格 §9）。
- LLM 只出判分 grade 与话术，不写模型任何字段（沿用立项红线）。
- 画像是只读投影；删除书后其数据自然从画像消失（实时派生天然满足）。
- 隐私：画像不出端（server 本地计算），不进入任何日志；API 不接收也不返回原文内容。

## 7. 对现有结构的影响

| 现有模块 | 动作 |
| --- | --- |
| `server/src/learning/` | 新增 `learnerProfile.ts`（纯函数派生） |
| `server/src/routes/` | 新增 `learner.ts`（GET /api/learner/profile） |
| `admin/src/domain/todayNextStep.ts` | 插入遗忘悬崖/节律两条候选，不改既有分支语义 |
| `admin/src/domain/bookMapProjection.ts` | 跨书同名概念合并节点（sources 合并） |
| `admin/src/App.tsx` | 拉取 profile 注入今日页/地图 |
| 今日页/地图 UI | 仅文案与状态口径变化，布局不变 |

## 8. 验收标准

1. 两本书各有一次同名概念（如「监督学习」，一书答对一书答错）→ profile 合并为一个概念，掌握度按合并 attempts 计算。
2. 构造悬崖场景（答对后超过 1.5 倍档位间隔无作答）→ 今日页下一步指向该概念所属书，文案说明原因。
3. 连续 3 天有事件 → streak=3；改系统时间无事件日 → streak 中断。
4. 地图跨书同名概念只显示一个节点，状态由聚合掌握度推导。
5. 删除一本书 → 其概念从画像消失（实时派生验证）。
6. server/admin 测试全绿；全程无 LLM 调用（测试用空 fetchImpl 断言零调用）。

## 9. 待拍板

1. 跨书归一并**只按 label 归一化**（不调用 LLM 实体对齐）——同意？
2. 遗忘悬崖阈值 **1.5 倍档位间隔**——同意还是先按 2 倍保守？
3. 节律画像是否进入今日页（第 5 条候选「节律建议」），还是首版只做前 4 条优先级、节律仅展示？
4. 地图合并节点的 displayLabel 取「最近一次出现的原始写法」——同意？
