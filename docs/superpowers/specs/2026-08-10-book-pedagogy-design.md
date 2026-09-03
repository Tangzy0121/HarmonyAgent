# 互动学习书升级设计：内容形态多样化 + 学习闭环（仿 DeepTutor）

日期：2026-08-10
状态：已经用户方向性批准（两步走、Mermaid 静态图、SDD 执行），本文档为正式规格，评审后进入实施计划
工作区：`E:/Tang_Project/HarmonyAgent-worktrees/interactive-learning-book-mvp`，分支 `codex/interactive-learning-book-mvp`（只本地，不 push）

## 1. 背景与问题

用户验收真实生成的学习书后反馈：**全是文字、像在介绍、不像在帮助学习**。

对本地 DeepTutor（`deeptutor 1.5.10`，Apache-2.0）源码调研确认两层差距：

1. **内容形态**：DeepTutor 的书不是一篇 markdown，而是 19 种内容块（`book/models.py` BlockType）由"排版架构师"LLM 排块序列（`page_planner.yaml`：每页 5–10 块、强制类型多样、穿插排列、块间过渡句）。当前实现只有 explanation/example/formula/citation/concept/quiz 六种文字块（`server/src/books/chapterValidation.ts:32-39`）。
2. **学习闭环**：DeepTutor 有 diagnostic → explain → feynman_check → practice → error_diagnosis → review 掌握路径（`learning/models.py:61-72`），掌握度用近 5 次作答加权（权重 0.5/0.7/0.85/0.95/1.0）且 <3 次封顶（`learning/mastery.py`）。当前 quiz 答完即止，无摸底、无掌握度持久化、无复习。

只参考其架构与教学法设计，**不复制其代码**（Apache-2.0 兼容，但本次无复制需求）。

## 2. 范围

### 2.1 Step 1：内容形态多样化（本 spec 详述，先实施）

新增三种块类型，章节生成提示词升级为"排版架构师"模式，前端新增三个渲染组件。

### 2.2 Step 2：学习闭环 MVP（本 spec 只做范围约定，Step 1 完成后单独出实施计划）

摸底诊断、掌握度持久化与量化、错题重做、费曼检验、Agent 提示词苏格拉底化。详见 §8。

### 2.3 明确不做（YAGNI）

- 交互式 HTML 小部件、Manim 动画、Chart.js 图表（鸿蒙迁移成本高，后续单独评估）
- 跨天间隔重复调度、IRT/BKT 掌握模型
- 多人格伙伴系统、独立知识图谱页面
- 不改动既有 mock 原型页面（Today/Map/旧深度学习路径）与既有 book-chat Agent 契约
- 不增加 LLM 调用次数（Step 1 全部新块为文本产出，复用现有单章一次 SSE 生成）

## 3. Step 1 数据模型变更

双端类型同步扩展（`admin/src/types/learningBook.ts` 与服务端 `StoredBook` 镜像，`server/src/books/bookTypes.ts`）：

```ts
export interface CalloutBlock extends BaseBookBlock {
  type: 'callout'
  kind: 'key_idea' | 'pitfall' | 'tip' | 'insight'
  body: string            // ≤400 字符
}

export interface FlashCardsBlock extends BaseBookBlock {
  type: 'flash_cards'
  cards: { front: string; back: string; hint?: string }[]  // 3–8 张，front ≤120 字符，back ≤300 字符
}

export interface FigureBlock extends BaseBookBlock {
  type: 'figure'
  kind: 'flowchart' | 'mindmap' | 'timeline' | 'sequence'
  mermaid: string         // 非空，≤2000 字符
  caption: string         // ≤120 字符
}
```

`BookBlockType` 与 `BookBlock` 联合类型相应扩展。所有新块仍带 `sourceAnchors`（citation 摘录子串硬校验规则不变，适用于新块的 anchors）。

## 4. Step 1 服务端变更

### 4.1 提示词升级（`server/src/books/chapterPrompt.ts`）

章节生成提示词改为"排版架构师"规则：

- 每章产出 6–10 个内容块
- 至少 4 种不同块类型；同类型不得连续出现超过 2 个
- 块间用一句过渡衔接（写入下一块的开头或 title 语境）
- 概念关系/流程/演进类内容必须产出至少 1 个 figure；易混淆点必须产出 callout(kind=pitfall)；定义/术语密集内容必须产出 flash_cards
- 保留：quiz 每章 1–2 个；所有 citation 摘录必须是原文逐字子串；不可信原文包裹与伪造标签转义规则不变
- `max_completion_tokens` 由 4000 上调至 6000（块数增多，留截断余量；配合既有预算截断逻辑）

### 4.2 校验（`server/src/books/chapterValidation.ts`）

- `GENERATABLE_TYPES` 增加 callout / flash_cards / figure
- 新块 schema 校验：kind 枚举值、闪卡 3–8 张、字段长度上限（§3）；非法块丢弃并记 warning（与现有非 quiz 块策略一致）；quiz 结构非法仍判整章无效
- 章级硬要求调整：≥1 explanation、≥1 有效 citation、≥1 quiz（不变），另加 **≥4 种块类型**——不满足则带修正指令重试一次，再失败章翻 error
- mermaid 源码只做非空/长度/危险字符（`<script` 等）检查；语法正确性由前端 `mermaid.parse` 把关（服务端不引 mermaid 依赖）
- **顺带修复终审 Important#2**：预算截断优先裁非必备类型（example/figure/callout/flash_cards 先于 explanation/quiz/citation），截断后复检必备类型缺失则判 chapter_invalid

### 4.3 存储

`bookStore` 无需结构变更（块为不透明 JSON 落盘）；`SAFE_ID_PATTERN` 不变。

## 5. Step 1 前端变更

### 5.1 渲染组件（`admin/src/components/book/`，BookBlockRenderer 拆分）

- `CalloutCard`：四种 kind 配色/图标（key_idea=陶土、pitfall=警示、tip=烟晶、insight=高亮），沿用现有暖白视觉体系
- `FlashCards`：3D 翻转（纯 CSS transform），点击/回车/空格翻转，左右切换卡，`aria-pressed` 与可见文本状态
- `FigureBlock`：**懒加载 mermaid**（`await import('mermaid')`，仅首次遇 figure 块时加载）；`mermaid.parse` 失败时降级为"图示生成失败"占位 + 可折叠源码 + 块级"重生成"入口；SVG `max-width:100%`、可横向滚动容器兜底超宽图

### 5.2 兼容与守卫

- `parseLearningBook` 守卫放行并校验新类型必需字段（缺字段块丢弃，不误判整书）
- 旧书（无新类型）渲染路径不变
- Agent 上下文构建（`bookAgentContext.ts`）：新块纳入上下文文本（callout body、闪卡 front/back、figure caption+mermaid 源码均作为可读文本），预算规则不变

### 5.3 新依赖

admin 增加 `mermaid`（运行时渲染，懒加载）。这是本 Step 唯一新增依赖。

## 6. 测试策略

- 服务端：新块 schema 校验（合法/非法/边界）、章级 ≥4 类型硬要求与重试、截断保必备类型回归（终审 Important#2）、citation 子串校验对新块 anchors 生效、token 上调断言
- 前端：三组件渲染与交互（翻转/键盘/降级）、parseLearningBook 新类型守卫、Agent 上下文含新块文本、懒加载不进入主包（构建产物断言或 mock import 断言）
- 沿用既有 harness（vitest + Fake DOM），不新增测试依赖

## 7. Step 1 验收标准

1. server/admin 全量测试与构建通过
2. 真实 DeepSeek E2E：同一 8 页中文 PDF 重新生成，章节含 ≥4 种块类型、至少 1 个 figure 渲染为 SVG 无错误层、闪卡可翻转、callout 正常配色
3. 320×844 与 390×844 零横向溢出；axe 无 critical/serious；控制台无错误
4. 旧 mock 原型与既有 Agent 问答回归不破

## 8. Step 2 范围约定（学习闭环 MVP，后续单独实施计划）

1. **摸底诊断**：目录确认后可选"先摸底"，一次 LLM 调用出 5 道题（基于目录+来源摘录），答完标注建议起点章/可跳过章
2. **掌握度持久化与量化**：quizAttempts 持久化进服务端 book JSON（补上前一规格 §9 延后项）；掌握度 = 近 5 次作答加权正确率（0.5/0.7/0.85/0.95/1.0），作答 <3 次封顶（1 次 ≤0.5，2 次 ≤0.8）；展示在章节卡与概念 `learningState`
3. **错题重做**：答错题进复习队列，章末与书级各有"复习错题"入口，重做对移出
4. **费曼检验**：章末"用自己的话讲讲这一章"→ 一次 LLM 调用判 {passed, feedback, gap}，未过给缺口与回看建议
5. **Agent 提示词苏格拉底化**：先诊断、回复 ≤200 字、以追问结尾、先给提示再给答案

Step 2 验收：摸底→建议起点、答题→掌握度刷新后仍在、错题→重做移出、费曼未过给 gap，全部真实 DeepSeek E2E 走通。

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| LLM 不稳定遵守"≥4 种块类型" | 章级硬校验 + 带修正指令重试一次；再失败章翻 error 可重试，不落坏书 |
| mermaid 语法错误率高 | 前端 parse 降级（不炸页、可重生成）；提示词限定四种简单图型并给示例 |
| mermaid 包体积（~500KB gzip 部分） | 懒加载动态 import，不进主包 |
| token 上调后成本/时长上升 | 仅 4000→6000；24k 字符上下文预算不变 |
| 新块破坏旧书/旧客户端 | 类型扩展为纯增量；旧类型渲染与守卫路径不变 |

## 10. 执行纪律

- 四件套在 `HelpCC/book-pedagogy/`（spec/plan/tasks/checklist），`.git/info/exclude` 已含 HelpCC 与 .superpowers
- SDD 执行：每任务实现 + 独立复审，Step 1 结束后真实 E2E + 全分支终审
- 只本地提交不 push；不碰原工作区 `E:/Tang_Project/HarmonyAgent`；commit 前 `git status` 核对
- 协同纪律：外科手术式改动，不改既有 mock 页面与 Agent 契约
