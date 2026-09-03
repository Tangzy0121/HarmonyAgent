# 多文件合书 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1–5 份混合来源（PDF/MD/DOCX/EPUB）合成一本书，锚点精确到「哪份文件哪几页」，单源零回归。

**Spec:** `docs/superpowers/specs/2026-08-17-multi-source-book-design.md`（已获用户批准 2026-08-17）

**分支：** `codex/multi-source-book`（叠于 G `1db5356`，合并顺序 G→I）。实施：coder 子 agent，主 agent 复核。

---

### Task 1: server 多源创建（TDD）

- [x] `bookSources.ts`（回退辅助 + sha256 指纹）→ 5 例
- [x] POST / 支持 documentIds（兼容 documentId、>5 → 409、合计 >90,000 → 422、缺失 404）→ 13 例含双源创建/伪造 sourceDoc 重试/越界 502
- [x] 提案多源化：`buildMultiDocumentDigest` 分段 + sourceDoc 校验（normalize 第三参，不传零变化）→ +5 例

### Task 2: server 下游多源化

- [x] 章生成按章首锚点 sourceId 解析文档（'S1'/找不到回退主来源）；多源 citation 子串按对应文档校验
- [x] 导出列全部来源（单源逐字不变）；estimate 页数合计
- [x] sources/sourceFingerprints 落盘；单源不写新字段、锚点保持 'S1'

### Task 3: admin（TDD）

- [x] bookApi documentIds 兼容 + 守卫放行 → +4 例
- [x] UploadBookSheet 多选 1–5 逐份上传 + App 多源创建 → +2 例 + App e2e 1 例
- [x] 提案页多源章标「来源：fileName」（单源不显示）→ +1 例

### Task 4: 验证

- [x] server 464 全绿 + tsc 零错误；admin 320 全绿 + tsc 零错误
- [x] MVP 规格 §3.1/§3.3 修订（多文件移出排除项；顺手去掉与 DOCX 支持矛盾的「Word」排除）
