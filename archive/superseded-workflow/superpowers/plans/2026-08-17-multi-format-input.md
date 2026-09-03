# 多格式输入（Markdown / DOCX）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学习书输入从仅 PDF 扩展到 Markdown 与 DOCX（一份文件一本书），经服务端虚拟分页复用现有生成管线。

**Architecture:** server 新增 `virtualPages.ts`（1500 字符/页、段落边界 ±10% 截断）+ `textDocument.ts`（frontmatter 剥离/上下限校验）+ `docxParser.ts`（mammoth 纯文本）；documents 路由按扩展名优先、Content-Type 兜底分发；格式随 StoredDocumentMeta 落盘并流入书 SourceDocument。

**Tech Stack:** Express 4 + TS、mammoth（MIT）、jszip（dev，程序生成 docx fixture）、React + Vite、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-17-multi-format-input-design.md`（已获用户批准 2026-08-17）

## Global Constraints

- 一份文件一本书；多文件合书仍排除；PPT/扫描件/加密文件仍排除。
- 上限：文件 ≤20MB；md/docx 解析后 ≤45,000 字符（=30 虚拟页）；正文 <200 非空白字符拒绝。
- 虚拟页码对上层透明：citation 子串硬校验、prompt 预算、导出、学习者模型零改动。
- 稳定错误码：`doc_no_text` / `doc_too_long` / `docx_unreadable`；既有 `pdf_*` 码不变。

---

### Task 1: 虚拟分页 + 文本解析

**Files:** Create `server/src/documents/virtualPages.ts`、`textDocument.ts`（+ 两测试文件）

- [x] 失败测试 9 例（空文本/短文本单页/段落边界截断/硬切/整页无尾页/frontmatter/200 字下限/45,000 上限/正常分页）
- [x] 实现 → 9/9 通过

### Task 2: docx 解析

**Files:** Create `server/src/documents/docxParser.ts` + `.test.ts`；`npm i mammoth`、`npm i -D jszip`

- [x] 失败测试 3 例（合法 docx 抽取/非 zip → docx_unreadable/文本不足 → doc_no_text；jszip 程序生成 fixture 不提交二进制）
- [x] 实现 → 3/3 通过

### Task 3: 路由分发 + format 落盘

**Files:** Modify `server/src/routes/documents.ts`、`server/src/documents/documentStore.ts`、`server/src/routes/books.ts`、`server/src/books/bookTypes.ts`；Create `server/src/routes/documentsFormats.test.ts`

- [x] 失败测试 8 例（md 200+虚拟页+format/frontmatter/doc_no_text/doc_too_long/docx 200/docx_unreadable/octet-stream 按扩展名/json 仍 400）
- [x] 实现：扩展名优先 Content-Type 兜底；StoredDocumentMeta.format（存量默认 PDF）；书 SourceDocument.format 透传
- [x] 8/8 + documents 回归全过

### Task 4: admin 上传与类型镜像

**Files:** Modify `admin/src/types/learningBook.ts`、`admin/src/services/bookApi.ts`、`admin/src/domain/learningBookApi.ts`、`admin/src/components/book/UploadBookSheet.tsx`、`admin/src/App.tsx`（错误文案）、测试夹具两处

- [x] format 三值镜像与载荷校验；uploadDocument 按扩展名发 Content-Type；上传 Sheet 接受三格式 + 文案；doc_* 错误码专项文案
- [x] tsc + admin 293 全绿；server 409 全绿

### Task 5: 收口

- [x] 双端全量测试
- [x] worklog + 记忆更新
