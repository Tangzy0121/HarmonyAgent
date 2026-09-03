# 真实文档生成互动学习书 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 上传单个文本型 PDF，服务端解析后由 DeepSeek 生成目录提案与渐进章节内容（真实页码引用），前端完成上传、提案确认、渐进生成与刷新恢复。

**Architecture:** 服务端新增 documents/books 两组窄契约路由（校验 + 服务端持有提示词 + 脱敏日志，沿用 bookAgent 模式），JSON 文件仓持久化于 `server/data/`；LLM 结构化输出走 `response_format: json_object` + 运行时校验/钳制；前端新增 `bookApi` 客户端，App 按 `#proposal/{bookId}`、`#book/{bookId}/{chapterId}` 参数化路由，mock 演示书保留并存。

**Tech Stack:** Express 4 + TypeScript（ESM, bundler resolution）、pdfjs-dist（legacy ESM）、pdf-lib（仅 dev，程序生成测试 fixture）、DeepSeek `deepseek-v4-flash`、React + Vite（admin）、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-10-real-book-generation-design.md`（已获用户批准）

## Global Constraints

- 单文件文本型 PDF；>20MB → `pdf_too_large`；>30 页 → `pdf_too_many_pages`；加密 → `pdf_encrypted`；全文档可提取字符 <200 → `pdf_no_text`；其他解析异常 → `pdf_unreadable`。
- 目录 3–6 章；标题非空且 ≤40 字符；`1 ≤ pageStart ≤ pageEnd ≤ pageCount`；全书 AI 内容块 ≤30；每章 ≥1 explanation + ≥1 有效 citation + 1–2 个 quiz。
- citation 块 `excerpt` 去空白后必须是该章页码范围内某页解析文本的子串，`pageRange` 落在该页，否则丢弃并记 warning。
- LLM 输入预算 24,000 字符；提案 `max_completion_tokens` 1500、章节 4000、`temperature` 0.2；提案/章节各至多一次修正重试。
- 错误只暴露稳定 code + 固定中文文案；日志白名单脱敏（id/状态/耗时/token）；API Key 仅 `server/.env`。
- `server/data/`、`HelpCC/`、`.superpowers/`、`.env` 永不入暂存；每个任务本地提交，**不 push**。
- 不改 `/api/agent/book-chat` 契约；mock 演示书（`ml-chapter-03`）行为不变；真实书隐藏块级"重生成"按钮。
- E2E 命令须 `env -u HTTP_PROXY -u HTTPS_PROXY`，Chrome 加 `--no-proxy-server`。

---

### Task 1: PDF 上传、解析与 documentStore

**Files:**
- Create: `server/src/documents/pdfParser.ts`
- Create: `server/src/documents/pdfParser.test.ts`
- Create: `server/src/documents/documentStore.ts`
- Create: `server/src/documents/documentStore.test.ts`
- Create: `server/src/routes/documents.ts`
- Create: `server/src/routes/documents.test.ts`
- Modify: `server/src/index.ts`（挂载路由）
- Modify: `server/package.json`（deps: `pdfjs-dist`；devDeps: `pdf-lib`）
- Modify: `.git/info/exclude`（追加 `server/data/`）

**Interfaces:**
- Produces（后续任务依赖）:
  - `parsePdf(buffer: Buffer, limits?: { maxPages?: number }): Promise<ParsedDocument>`；`ParsedDocument = { pageCount: number; pages: { page: number; text: string }[] }`（1 基页码）。
  - `class PdfParseError extends Error { readonly code: 'pdf_too_many_pages'|'pdf_encrypted'|'pdf_no_text'|'pdf_unreadable' }`。
  - `createDocumentStore(rootDir: string): DocumentStore`；`DocumentStore = { save(input: { fileName: string; pdf: Buffer; parsed: ParsedDocument }): Promise<StoredDocumentMeta>; get(id: string): Promise<StoredDocument|null>; list(): Promise<StoredDocumentMeta[]>; remove(id: string): Promise<boolean> }`。
  - `StoredDocumentMeta = { id: string; fileName: string; sizeBytes: number; pageCount: number; createdAt: string }`；`StoredDocument = StoredDocumentMeta & { pages: ParsedPage[] }`；id 形如 `doc_<crypto.randomUUID()>`。
  - 路由：`POST /api/documents`、`GET /api/documents`、`DELETE /api/documents/:id`。

- [x] **Step 1: 选型 spike（先做，决定 pdfjs-dist vs pdf-parse）**

安装 `npm i pdfjs-dist` 与 `npm i -D pdf-lib`，写最小脚本：pdf-lib 生成 2 页含文本 PDF → `pdfjs-dist/legacy/build/pdf.mjs` 的 `getDocument({ data: new Uint8Array(buf), isEvalSupported: false })` 提取文本。成功则用 pdfjs-dist；Node 兼容失败则换装 `pdf-parse` 并把下列 import 换成对应 API，接口签名不变。

- [x] **Step 2: 写失败测试 pdfParser.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parsePdf, PdfParseError } from './pdfParser.js'

async function makePdf(pageTexts: string[]): Buffer {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792])
    page.drawText(text, { x: 40, y: 700, size: 12, font })
  }
  return Buffer.from(await doc.save())
}

describe('parsePdf', () => {
  it('extracts per-page text with 1-based page numbers', async () => {
    const buf = await makePdf(['hello page one', 'hello page two'])
    const parsed = await parsePdf(buf)
    expect(parsed.pageCount).toBe(2)
    expect(parsed.pages[0].page).toBe(1)
    expect(parsed.pages[0].text).toContain('hello page one')
    expect(parsed.pages[1].text).toContain('hello page two')
  })

  it('rejects documents over the page limit', async () => {
    const buf = await makePdf(Array.from({ length: 31 }, (_, i) => `page ${i}`))
    await expect(parsePdf(buf)).rejects.toMatchObject({ code: 'pdf_too_many_pages' })
  })

  it('rejects textless documents', async () => {
    const buf = await makePdf(['', ''])
    await expect(parsePdf(buf)).rejects.toMatchObject({ code: 'pdf_no_text' })
  })

  it('maps password errors to pdf_encrypted and other failures to pdf_unreadable', async () => {
    await expect(parsePdf(Buffer.from('not a pdf'))).rejects.toMatchObject({ code: 'pdf_unreadable' })
    // encrypted：用假的 getDocument 单测覆盖 PasswordException → pdf_encrypted 的映射
  })
})
```

加密映射用依赖注入或 vi.mock 覆盖（pdf-lib 不能生成加密 PDF）。

- [x] **Step 3: 跑测试确认 RED**（`npm test -- pdfParser`，模块不存在而失败）
- [x] **Step 4: 实现 pdfParser.ts**：逐页 `getTextContent`，按 item 换行拼接；`maxPages` 默认 30；总字符 <200 → `pdf_no_text`；`PasswordException`（name 匹配）→ `pdf_encrypted`；其余异常 → `pdf_unreadable`。GREEN。
- [x] **Step 5: 写失败测试 documentStore.test.ts**：save→get 往返（含 pages 与 pdf 文件落盘）、list 按 createdAt 排序、remove 删除 json+pdf 返回 true/不存在返回 false、并发 save 不产生半成品（tmp+rename）。
- [x] **Step 6: RED → 实现 documentStore.ts（原子写）→ GREEN**
- [x] **Step 7: 写失败测试 documents.test.ts**（supertest + 内存临时目录 store）：

```ts
// POST /api/documents 合法 PDF → 200 { id, fileName, pageCount, sizeBytes, createdAt }
// Content-Type 非 application/pdf → 400 { error: 'invalid_content_type' }
// 31 页 PDF → 422 { error: 'pdf_too_many_pages' }
// GET /api/documents → 列表不含 pages 字段
// DELETE /api/documents/:id → 200 { deleted: true, note: '原始文件与解析结果已删除' }；再 GET → null
```

- [x] **Step 8: RED → 实现 routes/documents.ts → GREEN**

路由工厂 `createDocumentsRouter({ store, logger })`；路由内 `express.raw({ type: 'application/pdf', limit: '20mb' })`；超限由 raw 的 413 经路由级错误处理器映射 `{ error: 'pdf_too_large' }`；文件名取 `x-file-name` 头（缺省 `未命名.pdf`，截 120 字符，去控制字符）。

- [x] **Step 9: index.ts 挂载** `app.use('/api/documents', createDocumentsRouter({ store: createDocumentStore(process.env.DATA_DIR ?? path.join(process.cwd(), 'data')) }))`，注意挂在全局 `express.json()` 之前（raw 与 json 不冲突，但保持与 bookAgent 相同的"专用路由先行"顺序）。`.git/info/exclude` 追加 `server/data/`。
- [x] **Step 10: 全量** `npm test && npm run build` 通过；`git status` 核对暂存区；提交 `feat: add pdf upload and parsing`

---

### Task 2: bookStore 与目录提案生成

**Files:**
- Create: `server/src/books/bookTypes.ts`
- Create: `server/src/books/bookStore.ts` + 测试
- Create: `server/src/books/proposalPrompt.ts` + 测试
- Create: `server/src/books/proposalValidation.ts` + 测试
- Create: `server/src/routes/books.ts` + 测试（本任务只含 create/list/get/delete；edit/confirm 在 Task 3）
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: Task 1 的 `DocumentStore`、`ParsedPage`。
- Produces:
  - `StoredBook`（bookTypes.ts）：镜像 admin `LearningBook` 全字段 + `createdAt/updatedAt/generationJobs`；`GenerationJob = { chapterId: string; status: 'pending'|'generating'|'ready'|'error'; attempts: number; lastError: string|null; updatedAt: string }`。章节 id `ch-1..ch-n`；块 id `blk-{type}-{序号}`。
  - `createBookStore(rootDir: string): { save(book: StoredBook): Promise<void>; get(id): Promise<StoredBook|null>; list(): Promise<StoredBook[]>; remove(id): Promise<boolean> }`（原子写；books 存 `server/data/books/{id}.json`）。
  - `buildDocumentDigest(pages: ParsedPage[], budget = 24000): string`（每页 `【第N页】` + 开头片段，超预算从末尾页截断）。
  - `buildProposalMessages(input: { digest: string; goal: string; learnerLevel: string; pageCount: number }): BookAgentPromptMessage[]`（复用 `BookAgentPromptMessage` 类型；system 规则含：只输出 JSON、3–6 章、中文字段定义；文档摘要用不可信数据包裹）。
  - `normalizeProposal(value: unknown, pageCount: number): NormalizedProposal`；`NormalizedProposal = { title: string; description: string; rationale: string; estimatedMinutes: number; chapters: { title: string; objective: string; coreConcept: string; estimatedMinutes: number; pageStart: number; pageEnd: number }[] }`；抛 `ProposalValidationError('proposal_invalid')`。
  - 路由：`POST /api/books`、`GET /api/books`、`GET /api/books/:id`、`DELETE /api/books/:id`。

- [x] **Step 1: bookTypes + bookStore 失败测试**：save/get 往返、remove、list；写 Read→RED→实现→GREEN（模式同 documentStore）。
- [x] **Step 2: proposalValidation 失败测试**（核心，逐条 RED）：

```ts
// 4 章合法输入 → 通过，页码/标题原样保留
// 7 章 → 截断为 6 章；2 章 → 抛 proposal_invalid
// pageEnd > pageCount 或 pageStart < 1 → 抛 proposal_invalid
// 空标题 / 标题 41 字 → 抛；恰好 40 字 → 通过
// chapters 缺 objective/coreConcept/estimatedMinutes → 抛
// LLM 返回数组而非对象 → 归一为 { chapters: [...] } 再校验（借鉴 _llm_writer 形状归一）
// 文本前带思考前序 → 从最后一个 { 起解析成功（借鉴 _strip_thinking_preamble）
```

- [x] **Step 3: RED → 实现 proposalValidation.ts（含 `extractJsonObject(text)` 末尾定位 + 形状归一 + clamp/截断）→ GREEN**
- [x] **Step 4: proposalPrompt 失败测试**：消息含 goal/learnerLevel/章数约束；digest 超 24k 被截断；digest 中伪造的 `</document_data>` 被转义；system 不含密钥字样。
- [x] **Step 5: RED → 实现 proposalPrompt.ts + buildDocumentDigest → GREEN**
- [x] **Step 6: 路由失败测试**（注入 fake `fetchImpl` 返回 json_object 流）：

```ts
// POST /api/books 合法 → 201 { book }：status 'proposal'，章壳 ch-1..N（pending、blocks: []、
//   sourceAnchors 由 pageStart/pageEnd 生成），generationJobs 每章 pending
// documentId 不存在 → 404 { error: 'document_not_found' }
// goal/learnerLevel 非法 → 400 { error: 'invalid_request' }
// 上游 401 → 502 { error: 'proposal_generation_failed' }，不落书、日志无密钥
// 首次返回非法 JSON、重试后合法 → 201（重试带修正指令）
// GET /api/books/:id → 完整 book；GET /api/books → 列表；DELETE → 200 且 get 为 null
```

- [x] **Step 7: RED → 实现 routes/books.ts → GREEN**：上游走非流式 `chat/completions`（`stream:false` 或流式收集均可，选流式收集复用 `parseOpenAIStream`）；失败分类借鉴 `_classify_failure`；重试一次（messages 追加“上次输出未通过校验：{原因}，请只输出合法 JSON”）。
- [x] **Step 8: index.ts 挂载 `/api/books`；全量测试 + 构建；提交** `feat: add book proposal generation`

---

### Task 3: 目录编辑保存与确认路由

**Files:**
- Modify: `server/src/routes/books.ts` + 测试
- Create: `server/src/books/proposalEdits.ts` + 测试

**Interfaces:**
- Consumes: Task 2 的 `StoredBook`、bookStore。
- Produces:
  - `applyProposalEdits(book: StoredBook, edits: ProposalEdits): StoredBook`；`ProposalEdits = { title?: string; description?: string; chapters: { id: string; title: string; order: number; objective: string; estimatedMinutes: number }[] }`（整体替换可编辑字段；章节 id 必须与原壳一一对应；3–6 章；标题非空 ≤40）。抛 `ProposalEditError('invalid_proposal_edit'|'book_not_editable')`。
  - 路由：`PUT /api/books/:id/proposal`、`POST /api/books/:id/confirm`。

- [x] **Step 1: applyProposalEdits 失败测试**：合法改名/重排序通过；章节 id 集合不匹配 → invalid_proposal_edit；2 章 → 拒绝；7 章 → 拒绝；book.status ≠ 'proposal' → book_not_editable；order 重排后归一化为 1..N。
- [x] **Step 2: RED → 实现 → GREEN**
- [x] **Step 3: 路由失败测试**：PUT 合法 → 200 且 updatedAt 变化；confirm 后 PUT → 409 `book_not_editable`；POST confirm（proposal 态）→ 200，book.status 'generating'、activeChapterId 第一章、章状态不变（pending 等客户端触发）；非 proposal 态 confirm → 409。
- [x] **Step 4: RED → 实现路由 → GREEN；全量 + 构建；提交** `feat: add proposal edit and confirm routes`

---

### Task 4: 章节生成 SSE

**Files:**
- Create: `server/src/books/chapterPrompt.ts` + 测试
- Create: `server/src/books/chapterValidation.ts` + 测试
- Modify: `server/src/routes/books.ts` + 测试（追加 generate 端点）

**Interfaces:**
- Consumes: Task 2/3 全部；`parseOpenAIStream`；bookAgent 路由的 SSE/超时/中止/脱敏日志模式（`server/src/routes/bookAgent.ts:81-91, 251-309`）。
- Produces:
  - `buildChapterMessages(input: { bookTitle: string; proposalDigest: string; chapter: { title: string; objective: string }; pagesText: string; }): BookAgentPromptMessage[]`（pagesText 预算 24,000）。
  - `normalizeChapterBlocks(value: unknown, ctx: { pages: ParsedPage[]; pageStart: number; pageEnd: number; fileName: string; remainingBookBudget: number }): { blocks: StoredBlock[]; warnings: string[] }`；抛 `ChapterValidationError('chapter_invalid')`。
  - SSE 事件：`chapter_start { chapterId }` → `block { index, block }` × N → `chapter_done { blockCount, warnings }`；失败 `error { code, message }`，code ∈ `chapter_not_generatable|chapter_generation_failed|upstream_unavailable|upstream_timeout`。
  - 端点：`POST /api/books/:id/chapters/:cid/generate`。

- [x] **Step 1: chapterValidation 失败测试**（逐条 RED）：

```ts
// 合法 6 块（explanation/example/citation/concept/quiz/formula）→ 通过，块 id 按 blk-{type}-{n}
// citation excerpt 是范围内第 4 页文本子串、pageRange '4' → 保留并生成 sourceAnchors
// citation excerpt 不在任何页文本中 → 丢弃 + warnings 含该块
// citation pageRange '99' 越界 → 丢弃 + warning
// 无 explanation / 无有效 citation / 无 quiz → 抛 chapter_invalid
// quiz 选项 1 个或 5 个、correctAnswerId 不存在 → 抛
// 未知块类型 'animation' → 丢弃 + warning
// remainingBookBudget=2 时 5 块输入 → 只留 2 块 + warning
// concept 块 relation type '因果' → 丢弃该 relation + warning（白名单：前置/包含/相似/对比/应用）
```

- [x] **Step 2: RED → 实现 chapterValidation.ts → GREEN**（去空白子串比对：`text.replace(/\s+/g,'')`）。
- [x] **Step 3: chapterPrompt 失败测试**：含书概述/章目标/页文本/块类型白名单/JSON-only 约束；页文本超预算截断；伪造标签转义；无密钥。
- [x] **Step 4: RED → 实现 → GREEN**
- [x] **Step 5: 端点失败测试**（fake fetchImpl 流式返回块 JSON）：

```ts
// pending 章 → SSE 事件序 chapter_start → block×N → chapter_done；store 中章 ready、块落盘、job ready
// generating/ready 章重复调用 → 409 chapter_not_generatable（SSE error 帧或前置 409，取前置 409）
// book.status 'proposal'（未 confirm）→ 409
// 上游首次非法 JSON → 重试一次 → 成功；两次都非法 → error chapter_generation_failed，章 error，job.attempts=2
// citation 全被丢弃导致无有效引用 → 重试一次 → 仍失败 → chapter error，其他章状态不变
// 客户端断连 → 上游 abort，章翻 error 落盘
// 全部章 ready 后 book.status → 'ready'；有 error 章 → 'partial'
```

- [x] **Step 6: RED → 实现端点 → GREEN**：SSE 写出、60s 超时、`req aborted/res close` 联动中止、白名单脱敏日志全部仿照 bookAgent.ts；LLM 非流式收集后逐块 emit 并逐块落盘（借鉴 `persist_after_each_block`）。
- [x] **Step 7: 全量 + 构建；提交** `feat: add chapter generation stream`

---

### Task 5: 前端 bookApi 客户端与上传入口

**Files:**
- Create: `admin/src/services/sseFrames.ts`（从 bookAgentClient 抽取共享帧解析）
- Modify: `admin/src/services/bookAgentClient.ts`（改引用共享模块，行为不变，现有测试兜底）
- Create: `admin/src/services/bookApi.ts` + 测试
- Create: `admin/src/domain/learningBookApi.ts`（parseLearningBook 守卫）+ 测试
- Create: `admin/src/components/book/UploadBookSheet.tsx` + 测试
- Modify: `admin/src/pages/KnowledgeLibraryPage.tsx` + `admin/src/data/libraryPage.ts`

**Interfaces:**
- Consumes: Task 1–4 的 REST/SSE 契约；admin `types/learningBook.ts`。
- Produces:
  - `parseSseFrames(chunk: string, state): { events: { event: string; data: string }[]; state }`（CRLF 归一、跨 chunk、`\n\n` 分帧——从 bookAgentClient.ts:36-107 抽取）。
  - `uploadDocument(file: File): Promise<StoredDocumentMeta>`；`listBooks(): Promise<StoredBook[]>`；`createBook(input: { documentId: string; goal: LearningGoal; learnerLevel: LearnerLevel }): Promise<LearningBook>`；`getBook(id): Promise<LearningBook>`；`updateProposal(id, edits): Promise<LearningBook>`；`confirmBook(id): Promise<LearningBook>`；`streamChapterGeneration(bookId, chapterId, { signal, onEvent }): Promise<void>`（事件 `chapter_start|block|chapter_done|error`）；统一 `BookApiError(code, message)`。
  - `parseLearningBook(value: unknown): LearningBook`（运行时守卫，字段/类型不符抛 `BookApiError('invalid_book_payload')`）。
  - `<UploadBookSheet onSubmit({ file, goal, learnerLevel }) onClose />`：文件信息、目标/基础选择、云端处理与删除说明文案。

- [x] **Step 1: 抽取 sseFrames**：先把 bookAgentClient 的帧解析原样移入共享模块并改 import，跑现有 81 项测试确认零回归（这一步不改行为，单独提交 `refactor: share sse frame parser`）。
- [x] **Step 2: parseLearningBook 失败测试**：合法 fixture 通过；缺 chapters/非数组/块类型未知/章缺 status → 抛 invalid_book_payload。
- [x] **Step 3: RED → 实现 → GREEN**
- [x] **Step 4: bookApi 失败测试**（mock fetch）：upload 以 raw body + `x-file-name` 头发送；错误码映射（413→pdf_too_large 等）；streamChapterGeneration 事件序与 AbortError 保真；HTTP 400/409 预流错误映射。
- [x] **Step 5: RED → 实现 → GREEN**
- [x] **Step 6: UploadBookSheet 失败测试**：渲染文件信息/两个选择组/说明文案；>20MB 文件 onSubmit 不调并显示 `pdf_too_large` 文案；缺目标或基础时提交禁用。
- [x] **Step 7: RED → 实现 → GREEN**（样式沿用 index.css 既有 sheet/card 模式，320px 零溢出）。
- [x] **Step 8: 知识库接线**：顶部加"上传学习资料"入口；API 返回的真实书合并进列表（状态列：目录待确认/生成中 n/N/可阅读/部分可读/生成失败）；点击真实书 → `onOpenRealBook(bookId)`（App 接线在 Task 6，本任务只传 prop 并测渲染）。
- [x] **Step 9: 全量 + 构建；提交** `feat: add book api client and upload entry`

---

### Task 6: App 接线——参数化路由、渐进编排与刷新恢复

**Files:**
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/pages/BookProposalPage.tsx`
- Modify: `admin/src/pages/InteractiveBookPage.tsx`
- Create: `admin/src/hooks/useBookGeneration.ts` + 测试
- Create: `admin/src/App.realBook.test.tsx`

**Interfaces:**
- Consumes: Task 5 全部；现有 domain 函数（`startBookGeneration` 等仅 mock 书继续使用）。
- Produces:
  - `useBookGeneration({ bookId, onEvent }): { start(): void; retryChapter(chapterId): void; progress: { chapterId: string; blocksReceived: number } | null }`——确认后顺序生成各章：同时至多一章；章 error 记入书后继续下一章；离开页面（unmount/切 hash）abort 当前请求。
  - hash 约定：真实书提案 `#proposal/{bookId}`；阅读 `#book/{bookId}/{chapterId}`；mock 仍走 `#library/ml-chapter-03`。
  - `InteractiveBookPage` 新 props：`isRealBook: boolean`、`chapterProgress: { blocksReceived: number } | null`；真实书 generating 视图显示"已生成 N 块"且无"完成本章生成"按钮；`allowBlockRegenerate={!isRealBook}` 控制块级重生成按钮显隐。

- [x] **Step 1: App.realBook.test 失败测试**（mock bookApi）：

```ts
// #proposal/book_x 初始渲染 → 调 getBook('book_x') 并显示提案页
// 确认目录 → updateProposal + confirmBook 被调 → 跳 #book/book_x/ch-1
// 确认后 useBookGeneration 顺序发起 ch-1 生成；chapter_done 后自动 ch-2
// 章 error → 书内该章 error、继续下一章；点重试 → 对该章重新发起
// 刷新（直接以 #book/book_x/ch-2 挂载）→ getBook 恢复，不重走提案
// 真实书块级"重生成"按钮不渲染；mock 书仍渲染且"完成本章生成"行为不变
```

- [x] **Step 2: RED → 实现 useBookGeneration → 该 hook 单测 GREEN**
- [x] **Step 3: App.tsx 改造**：`activeRealBookId` 状态；`syncHistoryState` 识别 `#proposal/` 与 `#book/{id}/`；真实书经 getBook 载入 `learningBook` 状态（与 mock 共用同一状态位，bookId 区分来源）；`openRealBook` 从知识库 prop 接入；移除 `openDocument` 之外路径对 `ml-chapter-03` 的硬编码判断。
- [x] **Step 4: BookProposalPage/InteractiveBookPage 最小改动**（props 透传与条件渲染，样式沿用）。
- [x] **Step 5: 全量 + 构建；提交** `feat: wire real book flow into app`

---

### Task 7: 真实 E2E 验收与独立复审

**Files:**
- Create: `.superpowers/real-book-generation/make-e2e-pdf.mjs`（本地工具，不入库）
- Create: `.superpowers/real-book-generation/`（证据目录：截图、axe JSON、日志）

- [x] **Step 1: 生成 E2E 用 PDF**（2026-08-17 完成：pdf-lib 生成 20 页英文文本 PDF，走降级路径；见 2026-08-17 worklog）：pdf-lib + `@pdf-lib/fontkit` + `C:/Windows/Fonts/msyh.ttc` 生成约 8 页中文"机器学习第三章"文本 PDF（含小节标题与关键句，便于校验引用子串）；字体嵌入失败则降级英文内容并在报告中注明。
- [ ] **Step 2: 新鲜基线**：server/admin 全量测试 + 构建；端口 3456/5173/9227 空闲确认。
- [ ] **Step 3: 真实链路**（`env -u HTTP_PROXY -u HTTPS_PROXY`；Chrome `--no-proxy-server`；390×844）：上传 PDF → 解析成功 → 提案 3–6 章 → 改名+删一章 → 确认 → ch-1 先可读（块逐出）→ 等全部章完成 → citation 跳转锚点正确 → 章节追问真实回答带来源卡 → 答题生成证据 → 刷新恢复书与进度。
- [ ] **Step 4: 320×844 零溢出 + axe**（agent-browser a11y，目标无 critical/serious；moderate 记录）。
- [ ] **Step 5: 负路径**：>30 页 PDF 上传被拒文案正确；生成中断章可重试。
- [ ] **Step 6: 独立复审**（review diff 全链路）+ 修复轮；清理进程端口；提交 `test: verify real book generation e2e`（仅测试/文档类变更入库，证据留 .superpowers）。

---

## Self-Review 记录

- 规格覆盖：§4.1→T1，§4.2/§5.2→T2/T4，§4.3→T2/T4，§4.4→T1–T4，§6.1→T5，§6.2→T6，§7→各任务约束+T7，§8→各任务测试+T7。§6.3 两处偏差在 T6 落地（无模拟按钮、隐藏块级重生成）。
- 类型一致性：`StoredBook`/`GenerationJob`（T2）被 T3/T4 消费；`parseSseFrames`（T5）签名供 bookApi 内部使用；`useBookGeneration`（T6）签名与 T5 的 `streamChapterGeneration` 对齐。
- 已知风险：pdfjs-dist Node 兼容性（T1 spike 先行）；CJK 字体嵌入（T7 有降级路径）；DeepSeek JSON 稳定性（重试+钳制，不降级透传）。
