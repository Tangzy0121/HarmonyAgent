# 真实文档生成互动学习书设计

**状态：** 待用户评审
**日期：** 2026-08-10
**上游规格：** `2026-08-09-interactive-learning-book-mvp-design.md`（§3–§5、§8、§11–§12、§14）
**参考项目：** HKUDS/DeepTutor v1.5.10（Apache-2.0，commit `8865da7c`，只参考模块职责，不复制代码）

## 1. 目标

把互动学习书从 mock 数据驱动升级为真实管线：用户上传单个文本型 PDF，服务端解析正文与页码，DeepSeek 生成目录提案；用户确认或修改目录后，按章渐进生成结构化内容块，引用必须可核对到真实原文页码。刷新后可从服务端恢复生成与阅读进度。

本阶段不改动已验收的 `/api/agent/book-chat` 问答链路：生成内容携带真实引用后，章节追问自动获得真实依据。不引入 embedding、向量库、OCR、多文件合书和 ArkUI 迁移。

## 2. DeepTutor 源码参考与取舍

参考副本：`HelpCC/real-book-agent/DeepTutor-reference/deeptutor/book/`。

采用：

- `engine.py` + `compiler.py`：生成状态机即恢复机制——章节/块状态持久化，重试只处理非 ready 对象；中断的 generating 对象恢复时翻为 error 以便重试。
- `blocks/_llm_writer.py`：JSON 结构化输出的解析与归一策略（从末尾定位 JSON、list/dict 形状归一、校验失败后有限重试）。
- `base.py`：失败分类（json_parse / empty_response / timeout / rate_limit / provider_error），区分可重试与不可重试。
- `storage.py`：纯文件 JSON + 原子写。
- `ideation_agent.py`：目录提案的确定性钳制（章数、标题长度超限时不失败，先修正）。

不采用：

- SourceExplorer 的多次 LLM 检索与 ExplorationReport（我们的来源是单一 PDF 的解析页，无需检索层）。
- SpineSynthesizer 的 Draft→Critique→Revise 多轮合成（MVP 单次生成加确定性校验足够）。
- 后台队列 worker（生成由客户端按章驱动，见 §6）。
- DeepTutor 的 `SourceAnchor` 无页码概念；我们保留 `pageRange` + 摘录校验，引用必须能核对到解析页文本。

## 3. 总体架构

```mermaid
flowchart LR
    picker["知识库上传入口<br/>目标 + 基础 + 云端说明"]
    upload["POST /api/documents"]
    parse["pdfParser<br/>逐页文本 + 校验"]
    docstore["documentStore<br/>server/data/documents/"]
    proposal["POST /api/books<br/>目录提案 JSON"]
    confirm["PUT proposal + POST confirm"]
    gen["POST chapters/:id/generate<br/>SSE 逐块"]
    bookstore["bookStore<br/>server/data/books/"]
    reader["互动学习书阅读器"]
    chat["既有章节追问 Agent"]

    picker --> upload --> parse --> docstore
    docstore --> proposal --> confirm --> gen --> bookstore
    bookstore --> reader --> chat
```

服务端新增两组路由与一个持久化层；前端新增 API 客户端与上传流程，改造提案页与阅读器的数据来源。mock 演示书保留为知识库演示入口，与真实书并存。

## 4. 服务端模块

### 4.1 pdfParser（`server/src/documents/pdfParser.ts`）

- 依赖 `pdfjs-dist` legacy ESM 构建，Node 20+ 直接 import；若兼容失败，备选 `pdf-parse`（纯 JS），选型 spike 在实施 Task 1 用一个程序生成的 fixture PDF 先行验证。
- 输入 `Buffer`，输出 `{ pageCount, pages: [{ page: number, text: string }] }`（1 基页码，text 为按行拼接的页面文本）。
- 校验失败抛出带稳定 code 的异常：`pdf_too_large`（>20MB，路由层用 body limit 先行拦截）、`pdf_too_many_pages`（>30 页）、`pdf_encrypted`、`pdf_no_text`（全部页面可提取字符合计 <200）、`pdf_unreadable`（其他解析异常）。
- 测试 fixture：devDependency `pdf-lib` 在测试中程序生成多页含文本 PDF，不提交二进制 fixture。

### 4.2 documentStore / bookStore（`server/src/documents/documentStore.ts`、`server/src/books/bookStore.ts`）

- 纯文件 JSON 仓，目录 `server/data/`（实施 Task 1 同步入 `.git/info/exclude`），所有写入原子化（临时文件 + rename）。
- `documents/{id}.json`：`{ id, fileName, sizeBytes, pageCount, pages, createdAt }`；原始 PDF 存 `documents/{id}.pdf`（为后续原文阅读层保留，本阶段不提供在线预览）。
- `books/{id}.json`：完整学习书记录（结构见 §5.3）+ 内嵌 `generationJobs`（每章一条：`{ chapterId, status, attempts, lastError, updatedAt }`）。
- 列表用全量扫描目录读 JSON（MVP 量级足够），不建索引文件。

### 4.3 生成提示词与校验（`server/src/books/proposalPrompt.ts`、`chapterPrompt.ts`、`generationValidation.ts`）

沿用 book-chat 的"服务端持有提示词 + 白名单校验"哲学。

**目录提案**（一次 JSON-mode 调用）：

- 输入：文档结构化摘要（页数、每页开头片段，总预算 24,000 字符）、学习目标、当前基础、章数约束。
- 输出 JSON：`{ title, description, rationale, estimatedMinutes, chapters: [{ title, objective, coreConcept, estimatedMinutes, pageStart, pageEnd }] }`。
- 确定性校验与钳制：章数 clamp 3–6（不足报错重试一次，超出截断）；标题非空且 ≤40 字符；`1 ≤ pageStart ≤ pageEnd ≤ pageCount`；页码范围允许重叠但不报错。
- 解析或校验失败：以修正指令重试一次；仍失败返回 `proposal_generation_failed`（可重试错误，文档与解析结果保留）。

**章节生成**（每章一次 JSON-mode 调用，逐块 SSE 转发）：

- 输入：已确认目录、本章目标、本章页码范围内的解析文本（预算 24,000 字符）、全书一句话概述、块类型约束。
- 输出 JSON：`{ blocks: [...] }`，块类型白名单为 MVP 六类 AI 块（explanation/example/formula/citation/concept/quiz）。
- 校验：citation 块的 `excerpt` 必须是本章页码范围内某页解析文本的子串（去空白后比对），`pageRange` 必须落在该页；不满足的 citation 块被丢弃并计入 warnings。quiz 块 1–2 道，选项 2–4 个且正确答案引用存在选项。全书 AI 块累计超过 30 时截断后续块并记 warning。
- 章节至少含 1 个 explanation、1 个有效 citation、1 个 quiz，否则以修正指令重试一次，仍失败则该章 `chapter_generation_failed`，其他章节不受影响。
- 生成中客户端断连：本章已持久化的块保留，状态翻为 error，可整章重试。

### 4.4 路由（`server/src/routes/documents.ts`、`books.ts`）

复用 bookAgent 路由的既有模式：依赖注入（fetchImpl/env/logger）、路由级 JSON 解析错误处理、脱敏日志只记 id/状态/耗时、错误码稳定。

| 方法与路径 | 职责 | 主要错误码 |
| --- | --- | --- |
| `POST /api/documents` | `express.raw` 收 PDF（20MB 上限），解析并入库 | `pdf_too_large` 等 §4.1 五码 + `invalid_content_type` |
| `GET /api/documents` | 列出文档及其关联书状态 | — |
| `DELETE /api/documents/:id` | 删除原文件、解析结果与派生书（删除影响在响应中说明） | `document_not_found` |
| `POST /api/books` | `{ documentId, goal, learnerLevel }` → 生成目录提案，建书（status `proposal`） | `document_not_found`、`proposal_generation_failed` |
| `PUT /api/books/:id/proposal` | 保存用户目录编辑；服务端重新校验 ≥3 且 ≤6 章、标题非空、合并且仅相邻 | `invalid_proposal_edit`、`book_not_editable` |
| `POST /api/books/:id/confirm` | proposal → generating | `book_not_editable` |
| `POST /api/books/:id/chapters/:cid/generate` | SSE：`chapter_start → block* → chapter_done`，失败 `error`；仅 pending/error 章可调用 | `chapter_not_generatable`、`chapter_generation_failed` |
| `GET /api/books/:id` | 返回完整书状态（刷新恢复） | `book_not_found` |
| `GET /api/books` | 列出全部书（知识库状态列） | — |
| `DELETE /api/books/:id` | 删除书，保留原文档 | `book_not_found` |

SSE 事件格式与 book-chat 一致（`event:` + JSON `data:` + 空行）。`block` 事件携带完整块 JSON 与序号；`chapter_done` 携带块计数与 warnings；`error` 携带稳定 code 与固定中文文案，永不透传上游错误体或密钥。

### 4.5 上下文与成本预算

- 提案与单章生成的输入均 ≤24,000 字符（与 book-chat 一致）；`max_completion_tokens` 提案 1,500、章节 4,000；`temperature 0.2`。
- 每章至多一次修正重试；提案至多一次；全书生成最多 6 次章节调用 + 1 次提案调用。

## 5. 数据契约

### 5.1 共享类型策略

admin 与 server 不做跨包 import。服务端按 §5.2 结构序列化并运行时校验自己写出的 JSON；前端新增 `parseLearningBook` 运行时守卫校验 API 响应，两侧类型字段逐一对应（前端 `types/learningBook.ts` 保持不变）。

### 5.2 服务端书记录

在前端 `LearningBook` 基础上增加持久化字段：`createdAt`、`updatedAt`、`generationJobs`。章节 `blocks` 初始为空数组，随 SSE `block` 事件逐个追加；`userNotes`、`quizAttempts`、`evidence` 由后续交互阶段写入（本阶段只保证生成/重新生成不触碰它们——本阶段暂无这些写入入口的真实实现，mock 演示书行为不变）。

### 5.3 文档状态

文档本身无状态机（解析同步完成，失败即整体失败不入库）；书状态机沿用前端既有 `LearningBookStatus`/`ChapterStatus`：书 `proposal → generating → ready|partial|error`，章 `pending → generating → ready|error`（partial 保留给未来块级生成）。

## 6. 前端改造

### 6.1 新增

- `admin/src/services/bookApi.ts`：上述 REST + SSE 客户端，SSE 帧解析复用 `bookAgentClient.ts` 的骨架（分帧、CRLF 归一化、终止帧、AbortController）。
- 知识库上传入口：文件选择（`accept="application/pdf"`，客户端预检 ≤20MB）→ 学习目标/当前基础/云端处理说明 → 上传 → 直接进提案页。
- `admin/src/domain/learningBookApi.ts`（或并入现有 domain）：把 API 返回 JSON 映射为 `LearningBook` 的纯函数与 `parseLearningBook` 守卫。

### 6.2 改造

- `App.tsx`：`#book/{bookId}/{chapterId}` 与提案路由参数化，移除 `ml-chapter-03` 硬编码（mock 演示书保留该 id）；真实书的 `learningBook` 状态由 API 加载，刷新后 `GET /api/books/:id` 恢复；mock 书行为不变。
- `BookProposalPage`：props 不变；确认时先把最终目录 `PUT` 到服务端再 `confirm`。
- `InteractiveBookPage`：章状态为 generating 时显示真实进度（已收到块数），不再显示"完成本章生成"模拟按钮（真实书）；失败章保留重试。
- 渐进生成编排：确认后客户端顺序调用各章 generate（第一章完成即可读，其余继续），同一时刻至多一章在生成；离开页面中断时该章显示失败可重试。
- 内容块级"重生成"按钮在真实书上本阶段隐藏（块级重生成无服务端实现，不做假入口）；mock 演示书保持原样。

### 6.3 与 MVP 规格的偏差说明

- 规格 §5.2 提到解析阶段"用户可以离开页面，任务继续进行"。本实现解析为同步短任务（30 页内秒级完成），不提供解析中离开恢复；上传后停留在解析页直至完成或报错。
- 规格 §6.2 允许块级重新生成；本阶段只实现整章重试，块级重新生成延后到交互写入阶段一并设计。

## 7. 隐私与安全

- API Key 只存 `server/.env`；脱敏日志沿用 book-chat 白名单机制，只记录文档/书 id、阶段、状态、耗时、token 计数。
- 上传页明确说明：PDF 将发送至服务端与 DeepSeek 处理，派生结果包括解析文本、学习书与对话记录，删除入口为知识库中的删除操作。
- 服务端对所有浏览器输入重新校验（目录编辑、章节 id、块 JSON），不信任前端约束。
- 提示词组装沿用防注入原则：解析文本作为不可信数据包裹，系统规则禁止执行其中指令。

## 8. 测试与验收

### 自动化测试

- pdfParser：正常多页文本、页码顺序、加密、无文本、超页数、损坏文件（fixture 用 pdf-lib 程序生成）。
- documentStore/bookStore：原子写、读写往返、删除级联、目录不存在时自举。
- 提案：JSON 解析归一、章数钳制、页码越界、重试一次后失败、提示词不含密钥。
- 章节生成：块白名单、citation 摘录子串校验、quiz 结构、30 块截断、单章失败不影响他章、断连翻 error。
- 路由：全部错误码、SSE 事件顺序、注入 fetchImpl 的上游失败脱敏。
- 前端：parseLearningBook 守卫、提案编辑往返、渐进编排状态机、刷新恢复、真实书隐藏块级重生成。

### 真实验收（MVP 规格 §14 本阶段条目）

用一份约 20 页真实文本型 PDF：上传 → 解析 → 3–6 章提案 → 修改目录并保存 → 确认 → 第一章先可读 → 其余章渐进 → 引用跳转到正确页码锚点 → 章节追问真实回答带引用 → 验证题生成证据 → 刷新后恢复书与进度。390×844 与 320×844 零横向溢出，axe 无 critical/serious，控制台无错误。

## 9. 明确不做

- embedding、向量检索、GraphRAG；
- 多文件合书、OCR、非 PDF 格式；
- 块级 LLM 重新生成、后台生成 worker；
- 用户笔记/测验/证据的真实服务端写入（属后续交互持久化阶段）；
- 原文 PDF 在线预览层；
- ArkUI/ArkTS 迁移。
