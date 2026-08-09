# Real Interactive-Book Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the interactive learning book's fixed demo answer with a real DeepSeek streaming conversation grounded in the selected chapter or block and rendered with verifiable source cards.

**Architecture:** Preserve the existing React drawer and Node proxy, but add a dedicated `/api/agent/book-chat` boundary. A pure frontend context builder serializes only the selected generated book content; the server validates and budgets it, builds the grounding prompt, translates DeepSeek's OpenAI-compatible stream into an internal SSE protocol, and never exposes provider credentials or raw provider errors.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Express 4, native `fetch`, SSE, Vitest 2, Supertest, DeepSeek V4 Flash.

## Global Constraints

- Work only on branch `codex/interactive-learning-book-mvp` in `E:\Tang_Project\HarmonyAgent-worktrees\interactive-learning-book-mvp`.
- Do not push unless the user explicitly approves it.
- Preserve unrelated teammate work and do not touch the original checkout.
- Use `deepseek-v4-flash`; API Key remains only in ignored `server/.env`.
- The first version uses existing generated book blocks and source anchors, not the original PDF or a vector database.
- Default context is the current chapter; whole-book context must stay explicit and visible.
- Free chat cannot create `LearningEvidence`; only quiz submission and completed deep-learning flows may write it.
- Send at most 2,000 characters per block, 8,000 per chapter, 24,000 total context characters, and six recent conversation messages.
- User notes may be labeled supplemental context but can never be rendered or cited as original-source evidence.
- Mobile acceptance viewport is 390 × 844px and must remain compatible with 320–480px widths.
- Use DeepTutor v1.5.10 commit `8865da7c6d51d579db66ad123fcf3f16a2eed0a4` only as an architectural reference; copy no code, branding, text, or visual assets.

---

## File Structure

- `admin/src/types/bookAgent.ts`: browser request, source, event, message, and session types.
- `admin/src/domain/bookAgentContext.ts`: pure `LearningBook` → budgeted Agent context conversion.
- `admin/src/services/bookAgentClient.ts`: internal SSE parser and cancellable HTTP client.
- `admin/src/hooks/useBookAgentSessions.ts`: chapter/scope session isolation, streaming reducer, stop, retry, and reset.
- `server/src/agent/bookAgentContract.ts`: server-side request normalization and hard limits.
- `server/src/agent/bookAgentPrompt.ts`: pure grounded system/user message builder.
- `server/src/agent/openAIStream.ts`: arbitrary-chunk OpenAI SSE parser.
- `server/src/routes/bookAgent.ts`: dependency-injected Express streaming route.
- Existing App, Drawer, BookContextBar, BookBlockRenderer, InteractiveBookPage, CSS, and environment example receive surgical integration changes only.

---

### Task 1: Server Test Harness and Safe DeepSeek Defaults

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/.env.example`
- Create: `server/tests/config.test.ts`

**Interfaces:**
- Produces: `npm test` for server-side Vitest tests.
- Establishes: `LLM_BASE_URL=https://api.deepseek.com`, `LLM_MODEL=deepseek-v4-flash`.

- [ ] **Step 1: Write the configuration test before changing dependencies**

Create `server/tests/config.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('server environment example', () => {
  it('uses current DeepSeek defaults without containing a real key', () => {
    const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    expect(env).toContain('LLM_PROVIDER=deepseek')
    expect(env).toContain('LLM_BASE_URL=https://api.deepseek.com')
    expect(env).toContain('LLM_MODEL=deepseek-v4-flash')
    expect(env).toContain('LLM_API_KEY=your-api-key-here')
    expect(env).not.toMatch(/LLM_API_KEY=sk-[A-Za-z0-9_-]{20,}/)
  })
})
```

- [ ] **Step 2: Install and wire the server test harness**

Run:

```powershell
npm install --save-dev vitest@^2.1.9 supertest@^7.0.0 @types/supertest@^6.0.2
```

Add scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Run the test and observe the expected default mismatch**

Run: `npm test -- tests/config.test.ts`  
Expected: FAIL because the restored `.env.example` still contains the temporary Kimi defaults.

- [ ] **Step 4: Restore the public example to safe DeepSeek values**

Keep the existing comments and safe example key, but set:

```env
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-api-key-here
LLM_MODEL=deepseek-v4-flash
```

- [ ] **Step 5: Verify the task**

Run: `npm test -- tests/config.test.ts && npm run build`  
Expected: one passing test and TypeScript build exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add server/package.json server/package-lock.json server/.env.example server/tests/config.test.ts
git status --short
git commit -m "test: add server agent harness"
```

### Task 2: Pure Book Context Builder

**Files:**
- Create: `admin/src/types/bookAgent.ts`
- Create: `admin/src/domain/bookAgentContext.ts`
- Create: `admin/src/domain/bookAgentContext.test.ts`

**Interfaces:**
- Produces: `buildBookAgentContext(book, options): BookAgentContext`.
- Produces: `BookAgentSource`, `BookAgentBlock`, `BookAgentChapter`, `BookAgentContext`, `BookAgentRequest`, `BookAgentStreamEvent`, `BookAgentMessage`, `BookAgentSession`.

- [ ] **Step 1: Define the browser contract types**

Create discriminated stream events and explicit source records:

```ts
export interface BookAgentSource {
  id: `S${number}`
  sourceId: string
  fileName: string
  pageRange: string
  excerpt: string
  chapterId: string
  blockId: string
}

export interface BookAgentBlock {
  id: string
  type: string
  title: string
  content: string
  sourceIds: string[]
  userAuthored: boolean
}

export interface BookAgentContext {
  bookId: string
  title: string
  scope: 'chapter' | 'book'
  label: string
  focusBlockId?: string
  chapters: Array<{ id: string; title: string; objective: string; blocks: BookAgentBlock[] }>
  sources: BookAgentSource[]
  warnings: string[]
}
```

Define stream events as `start | delta | sources | done | error` and session message status as `complete | streaming | error | cancelled`.

- [ ] **Step 2: Write failing context tests**

Cover these assertions in `bookAgentContext.test.ts` using a readable first chapter:

```ts
const readyBook = advanceGeneration(learningBookFixture)
const chapterContext = buildBookAgentContext(readyBook, { chapterId: 'ch-1', scope: 'chapter' })
expect(chapterContext.chapters).toHaveLength(1)
expect(buildBookAgentContext(readyBook, { chapterId: 'ch-1', scope: 'book' }).chapters.map(c => c.id)).toEqual(['ch-1'])
expect(context.chapters[0].blocks[0].id).toBe(focusBlockId)
expect(context.sources[0].id).toBe('S1')
expect(context.sources.every(source => source.blockId !== 'blk-note-1')).toBe(true)
expect(JSON.stringify(context).length).toBeLessThanOrEqual(24_000)
```

For whole-book scope, mark chapters 2–4 ready in the fixture before expecting all four. Also test missing chapter warnings, hidden/pending/error filtering, duplicate source-anchor de-duplication, 2,000-character block clipping, 8,000-character chapter clipping, and user-note labeling.

- [ ] **Step 3: Run the tests and observe the missing-module failure**

Run: `npm test -- src/domain/bookAgentContext.test.ts`  
Expected: FAIL because `bookAgentContext.ts` and `bookAgent.ts` do not exist.

- [ ] **Step 4: Implement deterministic serialization and budgeting**

Use exhaustive block serialization:

```ts
function blockText(block: BookBlock, noteBody: string): string {
  switch (block.type) {
    case 'explanation': return `${block.body}\n要点：${block.keyPoint}`
    case 'example': return `${block.scenario}\n结论：${block.takeaway}`
    case 'formula': return `${block.formula}\n${block.explanation}`
    case 'citation': return block.excerpt
    case 'concept': return block.concepts.map(item => `${item.label}：${item.description}`).join('\n')
    case 'quiz': return `${block.question}\n${block.options.map(item => `${item.marker}. ${item.text}`).join('\n')}`
    case 'user_note': return `用户笔记（非原文）：${noteBody}`
  }
}
```

Only ready/partial chapters and ready blocks enter context. Stable-sort the focused block first without changing the book. Assign sources after ordering, de-duplicate by `sourceId + pageRange + excerpt`, and clip with an explicit `…[已截断]` suffix while recording warnings.

- [ ] **Step 5: Verify the task**

Run: `npm test -- src/domain/bookAgentContext.test.ts && npm run build`  
Expected: all context tests pass and admin production build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add admin/src/types/bookAgent.ts admin/src/domain/bookAgentContext.ts admin/src/domain/bookAgentContext.test.ts
git status --short
git commit -m "feat: build bounded book agent context"
```

### Task 3: Server Contract and Grounding Prompt

**Files:**
- Create: `server/src/agent/bookAgentContract.ts`
- Create: `server/src/agent/bookAgentPrompt.ts`
- Create: `server/tests/bookAgentContract.test.ts`
- Create: `server/tests/bookAgentPrompt.test.ts`

**Interfaces:**
- Produces: `normalizeBookAgentRequest(value): NormalizedBookAgentRequest` throwing `BookAgentValidationError`.
- Produces: `buildBookAgentMessages(request): Array<{ role: 'system' | 'user' | 'assistant'; content: string }>`.

- [ ] **Step 1: Write failing validation tests**

Create a valid request with eight history entries and 21 numbered sources, then test exact rejection/normalization cases:

```ts
const validRequest = makeRequest({ historyCount: 8, sourceCount: 21 })
expect(() => normalizeBookAgentRequest({ question: '   ' })).toThrow('question_required')
expect(normalizeBookAgentRequest(validRequest).history).toHaveLength(6)
expect(normalizeBookAgentRequest(validRequest).context?.sources).toHaveLength(20)
expect(() => normalizeBookAgentRequest({ ...validRequest, question: '问'.repeat(2001) })).toThrow('question_too_long')
```

Reject invalid history roles, duplicate source IDs, blocks referencing unknown source IDs, more than eight chapters, or more than 40 blocks. Normalize text whitespace and cap question at 2,000 characters, each history entry at 4,000, sources at 20, and serialized context at 24,000.

- [ ] **Step 2: Run the contract test and observe failure**

Run: `npm test -- tests/bookAgentContract.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the contract as a pure dependency-free module**

Use manual runtime checks rather than adding a schema dependency. Define stable public error codes (`question_required`, `question_too_long`, `invalid_history`, `invalid_context`, `context_too_large`) and never include rejected input in error messages.

- [ ] **Step 4: Write failing prompt tests**

Assert that the built messages contain:

```ts
expect(system).toContain('只能依据下面提供的互动学习书上下文')
expect(system).toContain('当前学习书内容中没有足够依据')
expect(system).toContain('[S1]')
expect(system).toContain('用户笔记不是原文证据')
expect(messages.at(-1)).toEqual({ role: 'user', content: validRequest.question })
expect(JSON.stringify(messages)).not.toContain(process.env.LLM_API_KEY ?? 'never-present')
```

- [ ] **Step 5: Implement grounded message construction**

Order messages as system rules → serialized context → six recent user/assistant turns → current user question. Serialize sources separately from blocks, and tell the model to cite only IDs present in the source section. When `context` is null, explicitly state that no book evidence is attached and citations are unavailable.

- [ ] **Step 6: Verify the task**

Run: `npm test -- tests/bookAgentContract.test.ts tests/bookAgentPrompt.test.ts && npm run build`  
Expected: contract/prompt tests pass and server build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add server/src/agent/bookAgentContract.ts server/src/agent/bookAgentPrompt.ts server/tests/bookAgentContract.test.ts server/tests/bookAgentPrompt.test.ts
git status --short
git commit -m "feat: define grounded book agent prompt"
```

### Task 4: DeepSeek Stream Translation and Dedicated Route

**Files:**
- Create: `server/src/agent/openAIStream.ts`
- Create: `server/src/routes/bookAgent.ts`
- Create: `server/tests/openAIStream.test.ts`
- Create: `server/tests/bookAgentRoute.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `parseOpenAIStream(stream, onFrame): Promise<void>`.
- Produces: `createBookAgentRouter({ fetchImpl, env, createTurnId }): Router`.
- HTTP: `POST /api/agent/book-chat` returning internal SSE events.

- [ ] **Step 1: Write failing arbitrary-chunk parser tests**

Feed encoded upstream data split inside `data:`, inside JSON, and between UTF-8 bytes. Assert emitted deltas, usage, `[DONE]`, ignored blank/comment lines, malformed-frame error, and abort propagation.

```ts
const chunks = ['data: {"choices":[{"delta":{"con', 'tent":"监督"}}]}\n\n', 'data: [DONE]\n\n']
expect(events).toEqual([{ type: 'delta', text: '监督' }, { type: 'done' }])
```

- [ ] **Step 2: Run the parser test and observe failure**

Run: `npm test -- tests/openAIStream.test.ts`  
Expected: FAIL because `openAIStream.ts` does not exist.

- [ ] **Step 3: Implement incremental OpenAI SSE parsing**

Use one `TextDecoder`, retain an incomplete line buffer, parse only `data:` fields, and flush decoder/buffer at stream end. Never log full frames. Convert provider content into typed `delta`, capture usage if present, and stop at `[DONE]`.

- [ ] **Step 4: Write failing route tests with injected fetch**

Use Supertest and a fake `fetchImpl` to assert:

- 400 for invalid body;
- 503 when `LLM_API_KEY` is empty;
- upstream body uses configured `deepseek-v4-flash`, `stream: true`, and server-built messages;
- response emits `start`, `sources`, `delta`, `done` in order;
- upstream 401/429/5xx become safe `error` events without the provider body;
- request close aborts upstream;
- no response contains the API Key.

- [ ] **Step 5: Implement the dependency-injected route**

Call `${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions` with:

```ts
{
  model: env.LLM_MODEL || 'deepseek-v4-flash',
  messages: buildBookAgentMessages(request),
  stream: true,
  stream_options: { include_usage: true },
  max_completion_tokens: 1200,
  temperature: 0.2,
}
```

Write internal SSE using `event: <type>\ndata: <json>\n\n`. Use a 60-second abort timeout, clear it in `finally`, set `Cache-Control: no-cache, no-transform`, and send only stable Chinese error copy.

- [ ] **Step 6: Mount only the dedicated route**

In `server/src/index.ts`:

```ts
import { createBookAgentRouter } from './routes/bookAgent.js'

app.use('/api/agent', createBookAgentRouter())
```

Keep the legacy `/api/chat/completions` route for ArkTS compatibility, but the learning-book UI must not call it.

- [ ] **Step 7: Verify the task**

Run: `npm test -- tests/openAIStream.test.ts tests/bookAgentRoute.test.ts && npm run build`  
Expected: all stream/route tests pass and server build succeeds.

- [ ] **Step 8: Commit**

```powershell
git add server/src/agent/openAIStream.ts server/src/routes/bookAgent.ts server/src/index.ts server/tests/openAIStream.test.ts server/tests/bookAgentRoute.test.ts
git status --short
git commit -m "feat: stream grounded book agent answers"
```

### Task 5: Browser SSE Client and Session State

**Files:**
- Create: `admin/src/services/bookAgentClient.ts`
- Create: `admin/src/services/bookAgentClient.test.ts`
- Create: `admin/src/hooks/useBookAgentSessions.ts`
- Create: `admin/src/hooks/bookAgentSessionReducer.ts`
- Create: `admin/src/hooks/bookAgentSessionReducer.test.ts`

**Interfaces:**
- Produces: `streamBookAgent(request, { signal, onEvent }): Promise<void>`.
- Produces: `bookAgentSessionReducer(state, action)`.
- Produces: `useBookAgentSessions({ book, activeChapterId, scope })` returning `session`, `focusBlockId`, `setFocusBlockId`, `submit`, `stop`, `retry`, and `newConversation`.

- [ ] **Step 1: Write failing browser SSE parser/client tests**

Mock `fetch` with a `ReadableStream`. Test event names split across chunks, multiple events per chunk, JSON parse failure, HTTP 400 before streaming, AbortError, and a provider-safe error event. Assert the request URL is exactly `/api/agent/book-chat`.

- [ ] **Step 2: Run and observe the missing client failure**

Run: `npm test -- src/services/bookAgentClient.test.ts`  
Expected: FAIL because `bookAgentClient.ts` does not exist.

- [ ] **Step 3: Implement the cancellable internal SSE client**

Parse `event:` and `data:` fields independently, dispatch only recognized discriminated events, reject a stream that ends without `done` or `error`, and preserve `AbortError` so the hook can mark cancellation rather than failure.

- [ ] **Step 4: Write failing reducer tests**

Cover `submit → start → delta → sources → done`, `error`, `cancel`, `retry`, and isolation by session key. Use keys:

```ts
const chapterKey = `${bookId}:chapter:${chapterId}`
const bookKey = `${bookId}:book:all`
```

Assert delta accumulation does not create multiple assistant messages and retry reuses the last user question without duplicating older history.

- [ ] **Step 5: Implement reducer and hook**

The hook builds context at submit time, sends only the last six complete user/assistant messages, owns one `AbortController`, aborts on unmount, and never calls `setLearningBook`. Store sessions in React memory only; switching chapter/scope selects another map entry and restores it when returning.

- [ ] **Step 6: Verify the task**

Run: `npm test -- src/services/bookAgentClient.test.ts src/hooks/bookAgentSessionReducer.test.ts && npm run build`  
Expected: all client/session tests pass and admin build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add admin/src/services/bookAgentClient.ts admin/src/services/bookAgentClient.test.ts admin/src/hooks/useBookAgentSessions.ts admin/src/hooks/bookAgentSessionReducer.ts admin/src/hooks/bookAgentSessionReducer.test.ts
git status --short
git commit -m "feat: manage streaming book agent sessions"
```

### Task 6: Drawer, Chapter Context, and Block Focus Integration

**Files:**
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/components/AgentDrawer.tsx`
- Modify: `admin/src/components/book/BookBlockRenderer.tsx`
- Modify: `admin/src/components/book/BookContextBar.tsx`
- Modify: `admin/src/pages/InteractiveBookPage.tsx`
- Modify: `admin/src/index.css`
- Create: `admin/src/components/AgentDrawer.test.tsx`
- Modify: `admin/src/pages/InteractiveBookPage.test.tsx`

**Interfaces:**
- `AgentDrawer` gains optional controlled book-session props: `bookSession`, `onSubmitQuestion`, `onStop`, `onRetry`, `onNewConversation`, `onContextEnabledChange`, `onSourceOpen`.
- `onAskAgent(focusBlockId?: string)` flows from a block or context bar into App.
- Non-book destinations retain their existing prototype conversation; book mode always uses the real controlled session.

- [ ] **Step 1: Write failing Drawer rendering tests**

Server-render controlled states and assert:

```ts
expect(streamingHtml).toContain('停止生成')
expect(errorHtml).toContain('重新尝试')
expect(completedHtml).toContain('第 4–6 页')
expect(completedHtml).not.toContain('固定演示回答中的句子')
```

Also assert only sources referenced by `/\[S\d+\]/g` appear as cards, unknown `[S99]` is ignored, and cancelled messages show “已停止”.

- [ ] **Step 2: Write failing focus propagation tests**

Update `InteractiveBookPage.test.tsx` so the context-bar button calls `onAskAgent(undefined)` and a block-level “向 Agent 提问” button calls `onAskAgent('blk-explanation-1')`.

- [ ] **Step 3: Run and observe the expected prop/UI failures**

Run: `npm test -- src/components/AgentDrawer.test.tsx src/pages/InteractiveBookPage.test.tsx`  
Expected: FAIL because controlled session props and block focus actions do not exist.

- [ ] **Step 4: Add a distinct block-level Agent action**

Do not repurpose “深入学习这一段”. Add a second action:

```tsx
<button type="button" onClick={() => onAskAgent(block.id)}>
  向 Agent 提问 <Icon name="agent" size={15} />
</button>
```

The context bar continues to call `onAskAgent()` without a focus block.

- [ ] **Step 5: Integrate the real controlled session in App**

Instantiate `useBookAgentSessions` with the current book/chapter/scope. `askBookAgent(focusBlockId?)` records focus, preserves the existing workflow label, and opens the drawer. Pass `contextEnabled` so removing context sends `context: null`; re-adding it restores the current chapter context.

When a source card is clicked, call `changeBookChapter(source.chapterId)`, close the drawer so the cited content is visible, and schedule `document.getElementById(source.blockId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })` after navigation settles. Give each block article `id={block.id}`.

- [ ] **Step 6: Render controlled book messages and controls**

In real-book mode:

- remove the fixed answer path;
- show a live region for streaming text;
- disable submit while streaming;
- show “停止生成”, “重新尝试”, and “新建对话” only when applicable;
- render referenced source cards with file, page range, and excerpt;
- keep IME-safe Enter behavior and existing keyboard expansion behavior;
- keep the legacy mock only for Today/Map/old deep-learning prototype surfaces.

- [ ] **Step 7: Add focused, accessible CSS**

Reuse existing typography and smoke-crystal controls. Add no new glass content cards. Source cards use an opaque reader surface, controls keep 44px touch targets, streaming/cancel/error states use text in addition to color, and 320px width must not overflow.

- [ ] **Step 8: Verify the task**

Run: `npm test && npm run build` from `admin`.  
Expected: all admin tests pass and production build succeeds.

- [ ] **Step 9: Commit**

```powershell
git add admin/src/App.tsx admin/src/components/AgentDrawer.tsx admin/src/components/AgentDrawer.test.tsx admin/src/components/book/BookBlockRenderer.tsx admin/src/components/book/BookContextBar.tsx admin/src/pages/InteractiveBookPage.tsx admin/src/pages/InteractiveBookPage.test.tsx admin/src/index.css
git status --short
git commit -m "feat: connect real agent to learning book"
```

### Task 7: Live DeepSeek and Mobile End-to-End Verification

**Files:**
- Modify only if a verified defect requires it: files from Tasks 2–6
- Update locally only: `HelpCC/real-book-agent/{tasks,checklist}.md`

**Interfaces:**
- Acceptance URL: `http://localhost:5173/#book/ml-chapter-03/ch-1`.
- Server health: `http://localhost:3456/health`.

- [ ] **Step 1: Run all automated verification from the committed tree**

Run in `server`:

```powershell
npm test
npm run build
```

Run in `admin`:

```powershell
npm test
npm run build
```

Expected: every test and both TypeScript production builds exit 0.

- [ ] **Step 2: Start the server and admin dev processes without exposing `.env`**

Run server with `npm run dev` on port 3456 and admin with `npm run dev` on port 5173. Confirm `/health` returns `{ "status": "ok" }`. Do not print environment values.

- [ ] **Step 3: Exercise the real first-turn path at 390 × 844px**

Open chapter 1, finish its mock generation if needed, focus `blk-explanation-1`, open Agent, and ask:

```text
为什么有标签才算监督学习？请指出你依据的原文。
```

Expected: visible streaming begins, the final answer contains a valid `[S#]`, at least one card shows `机器学习 · 第三章.pdf` and `4–6`, no mock answer is injected, horizontal overflow is 0, and console errors are empty.

- [ ] **Step 4: Exercise continuity, stop, retry, and isolation**

Continue with “那没有标签时模型还能学什么？”, stop one response, retry it successfully, switch to chapter 2, verify chapter 1 messages are absent, then return to chapter 1 and verify the in-memory conversation returns.

- [ ] **Step 5: Verify the evidence boundary**

Record `learningBook.evidence.length`, ask and complete two chat turns, then verify the length is unchanged. Submit the chapter quiz and verify it increases exactly once.

- [ ] **Step 6: Inspect security and repository state**

Run:

```powershell
git diff --check
git status --short
git check-ignore -v server/.env HelpCC/real-book-agent/spec.md
git grep -n "sk-" -- ':!server/.env.example'
```

Expected: no secret-like tracked values; `.env` and HelpCC are ignored; only intentional task files appear; no uncommitted implementation changes remain after any defect-fix commit.

- [ ] **Step 7: Final local commit if verification required fixes**

Stage only verified defect fixes, inspect `git status --short`, and commit:

```powershell
git commit -m "fix: harden real book agent flow"
```

Do not push.
