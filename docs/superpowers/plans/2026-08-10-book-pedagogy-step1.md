# 学习书内容形态多样化（Step 1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 学习书新增 callout / flash_cards / figure(mermaid) 三种内容块，章节生成提示词升级为"排版架构师"，前端新增三个渲染组件，让学习书不再是纯文字介绍。

**Architecture:** 新块全部为文本产出，复用现有"单章一次 SSE 生成 + 服务端归一化校验 + 前端块渲染器"管线：扩展双端类型与校验白名单、改写章节提示词、新增三个前端组件（mermaid 懒加载）。不新增 LLM 调用次数，不改既有 mock 原型与 Agent 问答契约。

**Tech Stack:** Express + tsx（server, vitest）、React 18 + Vite 5（admin, vitest + 自建 Fake DOM harness）、mermaid（新增，仅 admin 懒加载）。

**工作区：** `E:/Tang_Project/HarmonyAgent-worktrees/interactive-learning-book-mvp`，分支 `codex/interactive-learning-book-mvp`。规格：`docs/superpowers/specs/2026-08-10-book-pedagogy-design.md`。

## Global Constraints

- 只本地提交，**永不 push**；不碰原工作区 `E:/Tang_Project/HarmonyAgent`；每次 commit 前 `git status` 核对暂存区只含本任务文件。
- 双端类型镜像：`server/src/books/bookTypes.ts` 与 `admin/src/types/learningBook.ts` 字段必须逐一对应（两侧不做跨包 import）。
- 新块类型字面量精确为：`'callout'` / `'flash_cards'` / `'figure'`；kind 枚举精确为 `key_idea|pitfall|tip|insight`（callout）与 `flowchart|mindmap|timeline|sequence`（figure）。
- 字段上限（服务端校验强制执行）：callout.body ≤400 字符；flash_cards.cards 3–8 张、front ≤120、back ≤300、hint ≤120；figure.mermaid 1–2000 字符且不得含 `<script`（大小写不敏感）、caption ≤120。
- citation 摘录子串硬校验规则不变；quiz 每章 1–2 道上限不变；章级硬要求在原三条（≥1 explanation、≥1 有效 citation、≥1 quiz）上新增 **≥4 种不同块类型**。
- 章节生成 `max_completion_tokens` 由 4000 上调为 **6000**（仅 `server/src/routes/books.ts` 章节生成那一处；目录提案的 1500 不动，其防回退断言不动）。
- mermaid 只进 admin 依赖且必须**动态 import 懒加载**，不进主包；`securityLevel: 'strict'`，`startOnLoad: false`。
- 新块非法时逐块丢弃并记 warning（与 explanation 等现有策略一致），不得判整章无效；quiz 结构非法仍判整章无效。
- 旧书（无新类型）渲染、parseLearningBook 守卫、mock 原型页面、Agent 问答（/api/agent 契约、usage 白名单）均不得改变行为。
- 测试用既有 vitest harness，不新增测试依赖；前端组件测试用现有 Fake DOM 风格（参考 `admin/src/App.realBook.test.tsx`）。
- 注释/文案用简体中文，与现有文件风格一致。

---

### Task 1: 双端类型扩展 + 服务端新块校验与截断保护

**Files:**
- Modify: `server/src/books/bookTypes.ts`（BookBlockType 联合、三个新接口、BookBlock 联合）
- Modify: `admin/src/types/learningBook.ts`（同构镜像）
- Modify: `server/src/books/chapterValidation.ts`（白名单、三个 normalize、章级 ≥4 类型硬要求、截断保必备类型）
- Test: `server/src/books/chapterValidation.test.ts`

**Interfaces:**
- Produces（后续任务依赖）:
  - `CalloutBlock { type:'callout'; kind:'key_idea'|'pitfall'|'tip'|'insight'; body:string }`
  - `FlashCardsBlock { type:'flash_cards'; cards:{ front:string; back:string; hint?:string }[] }`
  - `FigureBlock { type:'figure'; kind:'flowchart'|'mindmap'|'timeline'|'sequence'; mermaid:string; caption:string }`
  - `normalizeChapterBlocks(value, ctx)` 签名不变；新块走同一入口。

- [x] **Step 1: 写失败测试（新块 schema 校验）**

在 `server/src/books/chapterValidation.test.ts` 追加 describe。沿用文件内既有 ctx fixture（pages/fileName/pageStart/pageEnd/remainingBookBudget 的既有构造方式，照抄文件顶部现有用例的 ctx）。核心用例：

```ts
// 合法 callout / flash_cards / figure 块被保留并赋 id/status/revision/sourceAnchors
const valid = {
  blocks: [
    { type: 'explanation', title: '讲解', body: '正文', keyPoint: '要点' },
    { type: 'citation', excerpt: PAGES_TEXT_SNIPPET, pageRange: '1' }, // 用文件内既有的可命中摘录
    { type: 'quiz', question: '问？', options: [{ id: 'o1', text: '甲' }, { id: 'o2', text: '乙' }], correctAnswerId: 'o1', feedback: '解' },
    { type: 'callout', title: '常见坑', kind: 'pitfall', body: '别混淆' },
    { type: 'flash_cards', title: '术语卡', cards: [
      { front: '监督学习', back: '有标签', hint: '看标签' },
      { front: '无监督学习', back: '无标签' },
      { front: '强化学习', back: '奖励信号' },
    ] },
    { type: 'figure', title: '流程', kind: 'flowchart', mermaid: 'flowchart LR\n  A-->B', caption: '训练流程' },
  ],
}
const result = normalizeChapterBlocks(valid, ctx)
expect(result.blocks.map((b) => b.type)).toEqual(['explanation', 'citation', 'quiz', 'callout', 'flash_cards', 'figure'])
// 各新块字段逐项断言（kind/body/cards/mermaid/caption 原样保留；hint 可选缺省不补）

// 非法新块逐块丢弃 + warning，不判整章无效
//   - callout kind 非枚举（'warning'）→ 丢弃
//   - callout body 401 字符 → 丢弃
//   - flash_cards 仅 2 张 / 9 张 → 丢弃；cards 内含空 front → 丢弃
//   - figure mermaid 空串 / 2001 字符 / 含 '<SCRIPT' → 丢弃
// 以上每个用例断言 blocks 中无该块且 warnings 非空
```

- [x] **Step 2: 写失败测试（章级 ≥4 类型硬要求 + 截断保必备类型）**

```ts
// 只有 explanation+citation+quiz 三种类型 → 抛 ChapterValidationError('chapter_invalid')
expect(() => normalizeChapterBlocks(threeTypeChapter, ctx)).toThrowError(ChapterValidationError)

// 截断保必备：remainingBookBudget 调小使超长，末尾恰有全章唯一 quiz
// 旧实现 slice 会裁掉 quiz；新实现必须保留下 quiz/citation/explanation，优先裁 example/figure/callout/flash_cards
const trimmed = normalizeChapterBlocks(longChapterEndingWithOnlyQuiz, tightCtx)
expect(trimmed.blocks.some((b) => b.type === 'quiz')).toBe(true)
expect(trimmed.blocks.length).toBeLessThanOrEqual(tightCtx.remainingBookBudget)

// 截断后若仍缺必备类型或不足 4 种 → chapter_invalid（复检在截断后）
```

- [x] **Step 3: 跑测试确认 RED**

Run: `cd server && npx vitest run src/books/chapterValidation.test.ts`
Expected: 新用例 FAIL（未知类型块被丢弃 → 类型断言不符；三种类型章未抛错；quiz 被 slice 裁掉）

- [x] **Step 4: 双端类型扩展**

`server/src/books/bookTypes.ts`：`BookBlockType` 联合追加 `'callout' | 'flash_cards' | 'figure'`；新增三接口（字段与上方 Interfaces 完全一致，均 `extends BaseBookBlock`）；`BookBlock` 联合追加三接口。`admin/src/types/learningBook.ts` 做完全相同的镜像修改。

- [x] **Step 5: chapterValidation.ts 实现**

1. 常量与默认标题：

```ts
const CALLOUT_KINDS = new Set(['key_idea', 'pitfall', 'tip', 'insight'])
const FIGURE_KINDS = new Set(['flowchart', 'mindmap', 'timeline', 'sequence'])
const MAX_CALLOUT_BODY_CHARS = 400
const FLASH_CARDS_MIN = 3
const FLASH_CARDS_MAX = 8
const MAX_CARD_FRONT_CHARS = 120
const MAX_CARD_BACK_CHARS = 300
const MAX_CARD_HINT_CHARS = 120
const MAX_MERMAID_CHARS = 2_000
const MAX_FIGURE_CAPTION_CHARS = 120
// DEFAULT_TITLES 追加：callout: '学习提示', flash_cards: '记忆闪卡', figure: '图解'
// GENERATABLE_TYPES 追加 'callout'、'flash_cards'、'figure'
```

2. 三个 normalize 函数（风格对齐现有 `normalizeQuiz`，但非法时返回 null 由调用处丢弃+warning，不调 `invalid()`）：

```ts
function normalizeCallout(raw: Record<string, unknown>): { kind: CalloutBlock['kind']; body: string } | null {
  const kind = optionalText(raw.kind)
  const body = optionalText(raw.body)
  if (kind === null || !CALLOUT_KINDS.has(kind)) return null
  if (body === null || body.length > MAX_CALLOUT_BODY_CHARS) return null
  return { kind: kind as CalloutBlock['kind'], body }
}

function normalizeFlashCards(raw: Record<string, unknown>): { cards: FlashCard[] } | null {
  if (!Array.isArray(raw.cards) || raw.cards.length < FLASH_CARDS_MIN || raw.cards.length > FLASH_CARDS_MAX) return null
  const cards: FlashCard[] = []
  for (const entry of raw.cards) {
    if (!isRecord(entry)) return null
    const front = optionalText(entry.front)
    const back = optionalText(entry.back)
    if (front === null || front.length > MAX_CARD_FRONT_CHARS) return null
    if (back === null || back.length > MAX_CARD_BACK_CHARS) return null
    const hint = optionalText(entry.hint)
    if (hint !== null && hint.length > MAX_CARD_HINT_CHARS) return null
    cards.push(hint === null ? { front, back } : { front, back, hint })
  }
  return { cards }
}

function normalizeFigure(raw: Record<string, unknown>): { kind: FigureBlock['kind']; mermaid: string; caption: string } | null {
  const kind = optionalText(raw.kind)
  const mermaid = optionalText(raw.mermaid)
  const caption = optionalText(raw.caption) ?? ''
  if (kind === null || !FIGURE_KINDS.has(kind)) return null
  if (mermaid === null || mermaid.length > MAX_MERMAID_CHARS) return null
  if (/<script/iu.test(mermaid)) return null
  if (caption.length > MAX_FIGURE_CAPTION_CHARS) return null
  return { kind: kind as FigureBlock['kind'], mermaid, caption }
}
```

3. `normalizeChapterBlocks` 的 switch 追加三个 case（丢弃时 warning 文案风格对齐现有：`` `已丢弃字段缺失的 callout 块「…」` `` 等）。

4. 章级硬要求与截断改为：**先 quiz 上限裁剪（不动）→ 保护性截断 → 复检硬要求**。替换现有"章级硬要求先于预算截断"段为：

```ts
const ESSENTIAL_TYPES = new Set(['explanation', 'citation', 'quiz'])

function trimToBudget(blocks: BookBlock[], budget: number): { blocks: BookBlock[]; trimmed: number } {
  const result = [...blocks]
  let index = result.length - 1
  while (result.length > budget && index >= 0) {
    const type = result[index].type
    const isLastEssential = ESSENTIAL_TYPES.has(type) && !result.some((b, j) => j !== index && b.type === type)
    if (isLastEssential) { index -= 1; continue }
    result.splice(index, 1)
    index -= 1
  }
  return { blocks: result, trimmed: blocks.length - result.length }
}

// normalizeChapterBlocks 尾部：
const budget = Math.max(0, ctx.remainingBookBudget)
if (blocks.length > budget) {
  const { blocks: kept, trimmed } = trimToBudget(blocks, budget)
  warnings.push(`超出全书内容块预算，已按必备类型保护截断 ${trimmed} 个块`)
  blocks = kept
}
if (!blocks.some((block) => block.type === 'explanation')) invalid()
if (!blocks.some((block) => block.type === 'citation')) invalid()
if (!blocks.some((block) => block.type === 'quiz')) invalid()
if (new Set(blocks.map((block) => block.type)).size < 4) invalid()
return { blocks, warnings }
```

同步更新 `normalizeChapterBlocks` 的 JSDoc（硬要求改为四条、截断在复检之前）。

- [x] **Step 6: 跑测试确认 GREEN + 服务端全量**

Run: `cd server && npx vitest run src/books/chapterValidation.test.ts && npm test && npm run build`
Expected: 全 PASS，tsc exit 0

- [x] **Step 7: Commit**

```bash
git add server/src/books/bookTypes.ts server/src/books/chapterValidation.ts server/src/books/chapterValidation.test.ts admin/src/types/learningBook.ts
git commit -m "feat(server): add callout/flash_cards/figure block types with validation and essential-type-protected trimming"
```

---

### Task 2: 章节提示词"排版架构师"升级 + token 上调

**Files:**
- Modify: `server/src/books/chapterPrompt.ts`（systemRules 重写）
- Modify: `server/src/routes/books.ts:275`（4000→6000）
- Test: `server/src/books/chapterPrompt.test.ts`、`server/src/routes/books.test.ts`（若有 4000 断言则同步改）

**Interfaces:**
- Consumes: Task 1 的新块类型与枚举值（提示词字面量必须与 `CALLOUT_KINDS`/`FIGURE_KINDS` 完全一致）。
- Produces: `buildChapterMessages(input)` 签名不变；system 提示词内容变更。

- [x] **Step 1: 写失败测试**

`chapterPrompt.test.ts` 追加：

```ts
const [system] = buildChapterMessages(baseInput)
// 新类型与排版规则进入提示词
expect(system.content).toContain('callout')
expect(system.content).toContain('flash_cards')
expect(system.content).toContain('figure')
expect(system.content).toContain('key_idea') && expect(system.content).toContain('pitfall')
expect(system.content).toContain('flowchart') && expect(system.content).toContain('mindmap')
expect(system.content).toContain('6 到 10 个内容块')
expect(system.content).toContain('至少 4 种')
// 既有安全规则不回归
expect(system.content).toContain('不可信数据')
expect(system.content).toContain('逐字')
```

`books.test.ts`：把章节生成的 `max_completion_tokens` 断言从 4000 改为 6000（若该断言不存在则新增：在既有"章节生成请求体"用例中断言 `max_completion_tokens: 6000`；提案的 1500 断言保持不动）。

- [x] **Step 2: 跑测试确认 RED**

Run: `cd server && npx vitest run src/books/chapterPrompt.test.ts src/routes/books.test.ts`
Expected: 新断言 FAIL

- [x] **Step 3: 重写 systemRules（chapterPrompt.ts）**

在现有规则数组中，把"type 只能是以下六种之一"段替换为九种，并追加排版规则。精确文案：

```ts
'- type 只能是以下九种之一：explanation（讲解）、example（示例）、formula（公式）、citation（原文引用）、concept（概念关系）、quiz（随堂小测）、callout（学习提示卡）、flash_cards（记忆闪卡）、figure（图解）。',
'- callout 块字段：kind（只能是 key_idea/pitfall/tip/insight）、body（不超过 400 字）。key_idea 用于关键概念，pitfall 用于常见易错点，tip 用于学习建议，insight 用于深入洞察。',
'- flash_cards 块字段：cards（3 到 8 张，每张含 front（不超过 120 字）、back（不超过 300 字），hint 可选）。用于定义、术语、需要记忆的内容。',
'- figure 块字段：kind（只能是 flowchart/mindmap/timeline/sequence）、mermaid（合法 mermaid 源码，不超过 2000 字符，只用与 kind 对应的图型语法）、caption（图注，不超过 120 字）。',
```

排版架构师规则（追加在"每章至少包含…"之前）：

```ts
'你同时是本章的排版架构师：像优秀教科书一样组织内容，而不是写一篇连续文章。',
'每章产出 6 到 10 个内容块，至少 4 种不同类型；同一类型不得连续出现超过 2 个。',
'概念关系、流程、演进、对比类内容必须产出至少 1 个 figure 块；易混淆点必须产出 callout（kind 为 pitfall）块；术语或定义密集的内容必须产出 flash_cards 块。',
'相邻块之间要有自然的逻辑衔接。',
```

mermaid 约束（防语法错误，追加）：

```ts
'figure 块的 mermaid 源码必须与 kind 对应：flowchart 用 "flowchart LR/TD"，mindmap 用 "mindmap"，timeline 用 "timeline"，sequence 用 "sequenceDiagram"；节点文字避免引号与换行，保持语法简单。',
```

- [x] **Step 4: books.ts token 上调**

`server/src/routes/books.ts:275`：`max_completion_tokens: 4000` → `max_completion_tokens: 6000`（仅章节生成这处；219 行提案 1500 不动）。

- [x] **Step 5: GREEN + 全量**

Run: `cd server && npx vitest run src/books/chapterPrompt.test.ts src/routes/books.test.ts && npm test && npm run build`
Expected: 全 PASS

- [x] **Step 6: Commit**

```bash
git add server/src/books/chapterPrompt.ts server/src/books/chapterPrompt.test.ts server/src/routes/books.ts server/src/routes/books.test.ts
git commit -m "feat(server): upgrade chapter prompt to layout-architect rules with new block types, raise chapter token budget to 6000"
```

---

### Task 3: 前端守卫、Agent 上下文与三个渲染组件

**Files:**
- Modify: `admin/src/domain/learningBookApi.ts`（isBookBlock 三 case）
- Modify: `admin/src/domain/bookAgentContext.ts`（blockText 三 case）
- Modify: `admin/src/components/book/BookBlockRenderer.tsx`（三 case + 标签）
- Create: `admin/src/components/book/CalloutCard.tsx`
- Create: `admin/src/components/book/FlashCards.tsx`
- Create: `admin/src/components/book/FigureBlockView.tsx`
- Modify: `admin/src/index.css`（三组件样式，追加在现有 book-block 规则之后）
- Modify: `admin/package.json`（+mermaid 依赖）
- Test: `admin/src/domain/learningBookApi.test.ts`、`admin/src/domain/bookAgentContext.test.ts`（若存在；不存在则在 learningBookApi.test.ts 同目录新建）、`admin/src/components/book/BookBlockRenderer.test.tsx`（若不存在则新建，沿用 App.realBook.test.tsx 的 Fake DOM 风格）

**Interfaces:**
- Consumes: Task 1 的类型（admin 侧镜像已在 Task 1 改好）。
- Produces: `CalloutCard({ block: CalloutBlock })`、`FlashCards({ block: FlashCardsBlock })`、`FigureBlockView({ block: FigureBlock })` 三个组件，供 BookBlockRenderer 调用。

- [x] **Step 1: 装依赖**

Run: `cd admin && npm install mermaid`
核对 package.json 新增 `mermaid`（dependencies），并确认构建后主包不含 mermaid（Step 6 验证）。

- [x] **Step 2: 写失败测试（守卫 + 上下文）**

`learningBookApi.test.ts` 追加（fixture 照抄文件内 storedPayload 的构造）：

```ts
// 合法新块通过守卫
const withNewBlocks = /* chapters[0].blocks 追加合法 callout/flash_cards/figure（含全部公共字段 id/status/title/revision/sourceAnchors） */
expect(parseLearningBook(withNewBlocks).chapters[0].blocks).toHaveLength(原有数 + 3)
// 非法 kind / 缺 mermaid / cards 越界 → 抛 invalid_book_payload
expect(() => parseLearningBook(badCalloutKind)).toThrowError(expect.objectContaining(INVALID))
```

`bookAgentContext` 测试追加：

```ts
// callout → body；flash_cards → 每张 "front\nback"（hint 有则追加）；figure → caption + mermaid 源码
const context = buildBookAgentContext(bookWithNewBlocks, { chapterId: 'ch-1' })
expect(context.chapters[0].blocks.find((b) => b.type === 'callout')?.content).toBe('别混淆')
expect(context.chapters[0].blocks.find((b) => b.type === 'figure')?.content).toContain('flowchart LR')
```

- [x] **Step 3: 写失败测试（组件）**

`BookBlockRenderer.test.tsx`（新建则沿用现有 Fake DOM 挂载风格；mermaid 用 `vi.mock('mermaid', ...)` 控制）：

```ts
// callout：渲染 kind 对应修饰类 book-callout--pitfall 与 body 文本
// flash_cards：初始显示第一张 front；点击卡片后显示 back；键盘 Enter 同样翻转；aria-pressed 同步
// figure：mermaid.parse 成功 → 容器内出现渲染标记（mock render 返回 { svg: '<svg>…</svg>' } 后断言容器 innerHTML 含 svg）
// figure：mermaid.parse reject → 显示降级文案"图示生成失败"且 mermaid 源码出现在可折叠元素中，不抛错
```

- [x] **Step 4: 跑测试确认 RED**

Run: `cd admin && npx vitest run src/domain/learningBookApi.test.ts src/components/book/BookBlockRenderer.test.tsx`
Expected: FAIL（未知类型抛 invalid / 组件不存在）

- [x] **Step 5: 实现守卫与上下文**

`learningBookApi.ts` 的 `isBookBlock` switch 追加：

```ts
case 'callout':
  return isOneOf(value.kind, CALLOUT_KINDS) && isString(value.body)
case 'flash_cards':
  return Array.isArray(value.cards) && value.cards.every((item) => (
    isRecord(item) && isString(item.front) && isString(item.back)
    && (item.hint === undefined || isString(item.hint))
  ))
case 'figure':
  return isOneOf(value.kind, FIGURE_KINDS) && isString(value.mermaid) && isString(value.caption)
```

（文件顶部常量区追加 `CALLOUT_KINDS`/`FIGURE_KINDS`，风格对齐既有 `RELATION_TYPES`。）

`bookAgentContext.ts` 的 `blockText` switch 追加：

```ts
case 'callout':
  return block.body
case 'flash_cards':
  return block.cards.map((card) => (card.hint ? `${card.front}\n${card.back}\n提示：${card.hint}` : `${card.front}\n${card.back}`)).join('\n')
case 'figure':
  return `${block.caption}\n${block.mermaid}`
```

- [x] **Step 6: 实现三个组件并接线**

`CalloutCard.tsx`：

```tsx
import type { CalloutBlock } from '../../types/learningBook'

const KIND_LABEL: Record<CalloutBlock['kind'], string> = {
  key_idea: '关键概念', pitfall: '常见坑', tip: '小贴士', insight: '洞察',
}

export function CalloutCard({ block }: { block: CalloutBlock }) {
  return (
    <div className={`book-callout book-callout--${block.kind}`} role="note">
      <span className="book-callout__kind">{KIND_LABEL[block.kind]}</span>
      <p>{block.body}</p>
    </div>
  )
}
```

`FlashCards.tsx`：受控索引 + 翻转状态；卡片为 `<button type="button" aria-pressed={flipped}>`，正反面同按钮内切换文本；左右"上一张/下一张"按钮（44px 触控目标，aria-label「上一张闪卡」「下一张闪卡」）；位置指示"2 / 5"。

`FigureBlockView.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import type { FigureBlock } from '../../types/learningBook'

export function FigureBlockView({ block }: { block: FigureBlock }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setFailed(false)
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        await mermaid.parse(block.mermaid)
        const { svg } = await mermaid.render(`fig-${block.id}`, block.mermaid)
        if (!cancelled && hostRef.current) hostRef.current.innerHTML = svg
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [block.id, block.mermaid])

  return (
    <figure className="book-figure">
      {failed ? (
        <div className="book-figure__fallback" role="status">
          <p>图示生成失败，可查看源码或重新生成本章。</p>
          <details><summary>查看图源码</summary><pre>{block.mermaid}</pre></details>
        </div>
      ) : (
        <div ref={hostRef} className="book-figure__canvas" aria-label={block.caption || block.title} />
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  )
}
```

`BookBlockRenderer.tsx`：switch 追加三 case 调用上述组件；`blockTypeLabel` 追加 `callout: '学习提示'`、`flash_cards: '记忆闪卡'`、`figure: '图解'`。

`index.css` 追加（对齐现有暖白/陶土/烟晶色板，具体色值沿用文件内既有 CSS 变量）：`.book-callout` 四种 kind 左边框+底色、`.book-flashcards`（卡片 44px 最小触控、翻转过渡）、`.book-figure`（`.book-figure__canvas { max-width: 100%; overflow-x: auto; }`，内部 `svg { max-width: 100%; height: auto; }`）、降级样式。320px 下不得横向溢出。

- [x] **Step 7: GREEN + 全量 + 懒加载验证**

Run: `cd admin && npx vitest run src/domain/learningBookApi.test.ts src/components/book/BookBlockRenderer.test.tsx && npm test && npm run build`
Expected: 全 PASS；构建产物中 mermaid 为独立 chunk（`dist/assets/` 下出现独立 mermaid chunk 文件，主 index chunk 不内联 mermaid）

- [x] **Step 8: Commit**

```bash
git add admin/src admin/package.json admin/package-lock.json
git commit -m "feat(admin): render callout/flash_cards/figure blocks with lazy-loaded mermaid"
```

---

### Task 4: 真实 DeepSeek E2E 验收

**Files:**
- Test: 复用 `.superpowers/real-book-generation/make-e2e-pdf.mjs` 生成的 8 页中文 PDF（脚本已存在；若 PDF 仍在 `server/data` 遗留可直接复用，否则重跑脚本生成）
- Evidence: `.superpowers/book-pedagogy/`（截图与 axe JSON，目录新建）

**Interfaces:**
- Consumes: Task 1–3 全部。

- [x] **Step 1: 新鲜基线**

Run: `cd server && npm test && npm run build`；`cd admin && npm test && npm run build`
Expected: 双端全绿后再启动服务。

- [x] **Step 2: 启动服务与隔离 Chrome**

后台启动 server（3456）与 admin（5173）；Chrome `--remote-debugging-port=9227 --no-proxy-server`，390×844。本地 curl/agent-browser 命令一律 `env -u HTTP_PROXY -u HTTPS_PROXY -u all_proxy NO_PROXY='*'`；agent-browser 用缓存路径 `.superpowers/sdd/2026-08-09-real-book-agent/npm-cache-final/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-win32-x64.exe --cdp 9227`。

- [x] **Step 3: 真实链路**

上传 8 页中文 PDF → 提案确认（不删章）→ 逐章生成完成。断言（浏览器实测，非 mock）：

1. 每章块数 6–10，且 ≥4 种块类型；至少一章含 figure、callout(pitfall)、flash_cards
2. figure 渲染为 SVG（容器内有 svg 节点）、无降级文案、无 Vite 错误层、控制台无错误
3. 闪卡点击翻转正常；callout 四种 kind 样式正常
4. citation 证据卡跳转、Agent 提问（复用已授权问题"为什么有标签才算监督学习？请指出你依据的原文。"）回归正常
5. 320×844 与 390×844 零横向溢出；axe 无 critical/serious
6. 旧书（E2E 前已生成的书或 mock 原型）打开渲染不回归

- [x] **Step 4: 缺陷处理**

任何 Critical/Important 缺陷：TDD 修复（先失败测试）→ 定向复跑 → 全量回归。Minor 记 HelpCC/book-pedagogy/tasks.md 延期清单。

- [x] **Step 5: 清理与报告**

停掉本任务启动的 server/admin/Chrome（先核对 PID 归属）；证据（截图 + axe JSON + 文字报告）落 `.superpowers/book-pedagogy/e2e-report.md`；确认端口 3456/5173/9227 释放、`git status` 干净。

---

## Self-Review 记录

- Spec 覆盖：§3 类型（T1）、§4.1 提示词+token（T2）、§4.2 校验与截断修复（T1）、§5.1–5.3 组件/守卫/上下文/依赖（T3）、§7 验收（T4）。Step 2 不在本计划（spec §8 约定单独计划）。
- 类型一致性：`CalloutBlock`/`FlashCardsBlock`/`FigureBlock` 字段在 T1 定义、T2 提示词字面量、T3 组件 props 三处一致；`FlashCard` 类型在双端类型文件中定义。
- 已知留白：E2E 的"至少一章含 figure/callout(pitfall)/flash_cards"依赖 LLM 实际产出——提示词已强制 + 服务端章级 ≥4 类型硬校验兜底；若真实产出反复缺型，属 T4 Step 4 的修复范畴（调提示词示例，不放宽校验）。
