# Interactive Learning Book Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a mobile-first, high-fidelity interactive learning-book vertical slice that turns the existing file-understanding screen into an editable proposal, progressively generated reader, chapter-scoped Agent entry, quiz evidence, and downstream map/today updates.

**Architecture:** Keep the existing React/Vite prototype and hash-based navigation. Add a pure domain module that owns immutable proposal edits, generation progress, context labels, quiz evidence, and user-note preservation; pages consume that module through typed mock state in `App.tsx`. Mirror DeepTutor's `Book → Spine → Chapter/Page → Block → Progress` boundaries while reducing the block taxonomy and pipeline to the approved HarmonyAgent MVP.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest, existing CSS design system.

## Global Constraints

- Work only on branch `codex/interactive-learning-book-mvp` in `E:\Tang_Project\HarmonyAgent-worktrees\interactive-learning-book-mvp`.
- Do not push unless the user explicitly approves it.
- Preserve unrelated user and teammate changes in the original checkout.
- Use one text-PDF fixture represented by mock data; real upload/parsing is a later server phase.
- One source creates one book with 3–6 chapters and no more than 30 AI blocks.
- Default Agent context is the current chapter; expanding to the whole book must be explicit and visible.
- Free chat cannot create learning evidence. Only submitted quiz/deep-learning interactions can do so.
- User notes and submitted quiz attempts survive regeneration.
- Reference DeepTutor commit `8865da7c6d51d579db66ad123fcf3f16a2eed0a4` (v1.5.10), especially `deeptutor/book/models.py`, `deeptutor/book/context.py`, `web/lib/book-types.ts`, `web/lib/book-progress.ts`, and Book reader components.
- Reuse no DeepTutor branding or visual assets.

---

### Task 1: Test Harness and Learning-Book Domain

**Files:**
- Modify: `admin/package.json`
- Modify: `admin/package-lock.json`
- Create: `admin/src/types/learningBook.ts`
- Create: `admin/src/domain/learningBook.ts`
- Create: `admin/src/domain/learningBook.test.ts`
- Create: `admin/src/data/learningBook.ts`

**Interfaces:**
- Produces: `LearningBook`, `BookChapter`, `BookBlock`, `BookProposal`, `BookGenerationState`, `AgentContextScope`, `LearningEvidence`.
- Produces: `removeChapter(book, chapterId)`, `moveChapter(book, chapterId, direction)`, `mergeChapterWithNext(book, chapterId)`, `advanceGeneration(book)`, `resolveAgentContext(book, chapterId, scope)`, `submitQuizAttempt(book, blockId, answerId)`, `regenerateBlock(book, blockId)`.

- [x] **Step 1: Add Vitest and a deterministic test command**

Add `"test": "vitest run"` and `"test:watch": "vitest"` to scripts, and add a Vitest version compatible with Node 24 to `devDependencies` using `npm install -D vitest` so the lockfile is generated mechanically.

- [x] **Step 2: Write failing domain tests**

```ts
import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import {
  advanceGeneration,
  mergeChapterWithNext,
  regenerateBlock,
  removeChapter,
  resolveAgentContext,
  submitQuizAttempt,
} from './learningBook'

describe('learning book domain', () => {
  it('never removes the proposal below three chapters', () => {
    let book = learningBookFixture
    book = removeChapter(book, 'ch-4')
    book = removeChapter(book, 'ch-3')
    expect(removeChapter(book, 'ch-2')).toBe(book)
  })

  it('merges adjacent chapters and keeps their source anchors', () => {
    const merged = mergeChapterWithNext(learningBookFixture, 'ch-1')
    expect(merged.chapters[0].sourceAnchors).toHaveLength(2)
  })

  it('makes the first chapter readable before the whole book', () => {
    const next = advanceGeneration(learningBookFixture)
    expect(next.chapters[0].status).toBe('ready')
    expect(next.status).toBe('generating')
  })

  it('defaults Agent context to the current chapter', () => {
    const context = resolveAgentContext(learningBookFixture, 'ch-1', 'chapter')
    expect(context.label).toContain('第 1 章')
    expect(context.chapterIds).toEqual(['ch-1'])
  })

  it('creates evidence only after a quiz answer is submitted', () => {
    const result = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')
    expect(result.evidence).toHaveLength(1)
  })

  it('preserves user notes and submitted attempts during regeneration', () => {
    const result = regenerateBlock(learningBookFixture, 'blk-explanation-1')
    expect(result.userNotes).toEqual(learningBookFixture.userNotes)
    expect(result.quizAttempts).toEqual(learningBookFixture.quizAttempts)
  })
})
```

- [x] **Step 3: Run tests and verify the missing-module failure**

Run: `npm test`  
Expected: FAIL because the learning-book fixture/domain modules do not exist.

- [x] **Step 4: Implement typed immutable domain operations**

Use discriminated unions for chapter, block, and generation states. Keep user-authored and generated records in separate arrays. Return the original object when an invalid edit is rejected so UI code can detect the no-op.

- [x] **Step 5: Run unit tests**

Run: `npm test`  
Expected: all domain tests PASS.

- [x] **Step 6: Verify TypeScript production build**

Run: `npm run build`  
Expected: TypeScript and Vite complete with exit code 0.

### Task 2: Proposal and Outline Confirmation

**Files:**
- Create: `admin/src/pages/BookProposalPage.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/index.css`
- Retire after replacement: `admin/src/pages/FileUnderstandingPage.tsx`

**Interfaces:**
- Consumes: `LearningBook` and proposal edit functions from Task 1.
- Produces: `BookProposalPage({ book, onBookChange, onConfirm, onBack })`.
- Navigation: `#library/ml-chapter-03/proposal` → `#book/ml-chapter-03/chapter/ch-1`.

- [x] **Step 1: Create the approved single-PDF fixture**

Model one 24-page machine-learning PDF, three learning goals, three learner levels, a four-chapter proposal, source page ranges, estimated minutes, concept candidates, block payloads, quiz answers, citations, and one user note.

- [x] **Step 2: Render upload context and proposal summary**

Show PDF metadata, learning goal, learner level, recommended title, one-sentence description, total estimate, source coverage, and a clear “目录待确认” state.

- [x] **Step 3: Add chapter editing controls**

Each chapter row supports rename, move up/down, merge with next, and delete. Disable invalid actions at the first/last row and when deletion would leave fewer than three chapters. Announce rejected edits with visible inline text instead of a transient toast.

- [x] **Step 4: Confirm the outline**

The primary action persists the confirmed spine in App state, changes the book to `generating`, marks chapter 1 as `generating`, and navigates to the reader.

- [x] **Step 5: Run tests and build**

Run: `npm test && npm run build`  
Expected: all unit tests pass and production build succeeds.

### Task 3: Progressive Reader and Typed Blocks

**Files:**
- Create: `admin/src/components/book/BookGenerationRail.tsx`
- Create: `admin/src/components/book/BookBlockRenderer.tsx`
- Create: `admin/src/components/book/BookContextBar.tsx`
- Create: `admin/src/pages/InteractiveBookPage.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/index.css`

**Interfaces:**
- Consumes: confirmed `LearningBook`, `advanceGeneration`, `regenerateBlock`, `submitQuizAttempt`, and `resolveAgentContext`.
- Produces: `InteractiveBookPage({ book, activeChapterId, contextScope, onBookChange, onChapterChange, onContextScopeChange, onAskAgent, onBack, onStartDeepLearning })`.

- [x] **Step 1: Render the book shell**

Add a compact title/header, horizontally scrollable chapter navigator, chapter status, estimated time, learning objective, source range, and original-source action. Keep the body editorial and flat; reserve glass treatment for navigation and controls.

- [x] **Step 2: Render seven MVP block types**

Implement exhaustive rendering for `explanation`, `example`, `formula`, `citation`, `concept`, `quiz`, and `user_note`. Unknown types must render an accessible unsupported-block message, never a blank area.

- [x] **Step 3: Add progressive generation states**

Show pending, generating, ready, partial, and error chapter states. The first “继续生成” action makes chapter 1 readable while the book remains generating; later actions progress one chapter at a time. Failed chapters expose a local retry action.

- [x] **Step 4: Add block regeneration and quiz evidence**

Generated blocks expose a regenerate action. User notes do not. Submitting the quiz locks the selected attempt, shows cited feedback, and creates one `LearningEvidence` record. Regeneration preserves notes and attempts.

- [x] **Step 5: Add chapter/whole-book context control**

The visible context bar defaults to current chapter, supports an explicit whole-book choice, and sends its resolved label to the shared Agent drawer.

- [x] **Step 6: Run tests and build**

Run: `npm test && npm run build`  
Expected: all tests pass and production build succeeds.

### Task 4: Agent Context and Navigation Continuity

**Files:**
- Modify: `admin/src/components/AgentDrawer.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/data/prototype.ts`
- Modify: `admin/src/index.css`

**Interfaces:**
- Consumes: resolved `AgentContext` from Task 3.
- Produces: visible removable context chip and book-scoped conversation copy.

- [x] **Step 1: Make book context explicit**

Pass the current book/chapter label into `AgentDrawer`, keep the existing removable context behavior, and add copy that distinguishes “优先参考当前章节” from “允许检索整本学习书”.

- [x] **Step 2: Preserve overlay and back behavior**

Opening Agent from the reader uses the existing 75% drawer and history state. Closing returns to the same chapter and scroll context. Expanding the drawer to full screen retains the selected context scope.

- [x] **Step 3: Add safe book follow-up actions**

Mock responses may expose “加入本章笔记” and “进入深入学习”. Neither action silently updates mastery; the latter routes to the existing explanation flow with the selected concept.

- [x] **Step 4: Run tests and build**

Run: `npm test && npm run build`  
Expected: all tests pass and production build succeeds.

### Task 5: Library, Map, Today, and Evidence Integration

**Files:**
- Modify: `admin/src/data/libraryPage.ts`
- Modify: `admin/src/pages/KnowledgeLibraryPage.tsx`
- Modify: `admin/src/data/learningMap.ts`
- Modify: `admin/src/pages/LearningMapPage.tsx`
- Modify: `admin/src/data/todayPage.ts`
- Modify: `admin/src/pages/TodayPage.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/index.css`

**Interfaces:**
- Consumes: `LearningBook.status`, ready chapter count, concept candidates, confirmed relations, and `LearningEvidence`.
- Produces: consistent downstream status on Library, Learning Map, and Today.

- [x] **Step 1: Reflect book lifecycle in Knowledge Library**

Replace “已理解” with book-specific states such as “目录待确认”, “生成中 1/4”, “部分可读”, and “可阅读”. Opening the PDF routes to the proposal before confirmation and to the last-read chapter afterward.

- [x] **Step 2: Project chapters and concepts into the map**

Use book chapters as theme clusters and concept candidates as nodes. Keep source files out of the main graph. New nodes start at “暂无学习记录”; only quiz evidence changes the relevant node to “已学习”.

- [x] **Step 3: Add one justified Today action**

Before completion, Today shows “继续生成/继续阅读”. After evidence exists, it shows one next step with book title, chapter, estimated minutes, and reason.

- [x] **Step 4: Verify the complete hash flow**

Manually exercise: Library → Proposal → Confirm → Chapter 1 generation → Read → Ask Agent → Quiz → Map → Today → Back to book.

- [x] **Step 5: Run tests and build**

Run: `npm test && npm run build`  
Expected: all tests pass and production build succeeds.

### Task 6: Accessibility and Visual Verification

**Files:**
- Modify: `admin/src/pages/BookProposalPage.tsx`
- Modify: `admin/src/pages/InteractiveBookPage.tsx`
- Modify: `admin/src/components/book/BookGenerationRail.tsx`
- Modify: `admin/src/components/book/BookBlockRenderer.tsx`
- Modify: `admin/src/components/book/BookContextBar.tsx`
- Modify: `admin/src/index.css`
- Create: `docs/worklog/prototype-building/results/2026-08-09-interactive-learning-book-result.md`

**Interfaces:**
- Consumes: completed prototype flow.
- Produces: verified responsive UI and an evidence record with commands, screenshots, and remaining limitations.

- [x] **Step 1: Run automated verification**

Run: `npm test && npm run build`  
Expected: zero test or build failures.

- [x] **Step 2: Start the Vite development server**

Run: `npm run dev -- --host 127.0.0.1`  
Expected: Vite reports a local URL without compile errors.

- [x] **Step 3: Verify in a 393 × 852 mobile viewport**

Check proposal editing, focus order, disabled controls, chapter navigation, context scope, block actions, quiz feedback, drawer/back behavior, and no horizontal overflow.

- [x] **Step 4: Verify reduced motion and keyboard access**

Confirm all icon buttons have accessible names, context changes are visible in text, focus remains visible, and `prefers-reduced-motion` removes nonessential transitions.

- [x] **Step 5: Record evidence and limitations**

Document the fixed DeepTutor commit, tests/build results, screenshots, mock-only boundaries, and the next real-service phase. Do not describe mock parsing or generation as a real backend capability.

- [x] **Step 6: Review Git status before any commit**

Run: `git status --short`  
Expected: only files directly related to the learning-book prototype and its design/plan/evidence are present. `HelpCC/`, upstream DeepTutor, `node_modules/`, and build output must be absent.
