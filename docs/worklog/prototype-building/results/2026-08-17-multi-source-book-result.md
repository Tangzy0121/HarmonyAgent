# 多文件合书结果

**日期：** 2026-08-17

**工作分支：** `codex/multi-source-book`（叠于 `codex/input-and-entry-polish` `1db5356`，合并顺序 G→I）

**规格：** `docs/superpowers/specs/2026-08-17-multi-source-book-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 多源回退辅助 + sha256 指纹 | `server/src/books/bookSources.ts` |
| POST / 多源创建（documentIds 兼容、>5 → 409、合计 >90,000 → 422） | `server/src/routes/books.ts` |
| 提案多源 digest 分段 + sourceDoc 校验 | `proposalPrompt.ts` / `proposalValidation.ts` |
| 章生成按锚点 sourceId 解析文档；导出列全部来源；estimate 合计 | `books.ts` / `bookMarkdown.ts` / `estimate.ts` |
| sources + sourceFingerprints 落盘（双端镜像） | `bookTypes.ts` / `types/learningBook.ts` |
| 上传多选 1–5 逐份上传；提案页来源标注 | `UploadBookSheet.tsx` / `App.tsx` / `BookProposalPage.tsx` |

## 验证

- server 464 全绿 + tsc 零错误（新增 23：bookSources 5 + 多源路由 13 + sourceDoc 校验 5）
- admin 320 全绿 + tsc 零错误（新增 8：bookApi 4 + 上传 2 + 提案页 1 + App e2e 1）
- 验收 4 条全过：三格式混合合书与按文档 citation 校验、单源零回归（既有测试零改动）、6 份 409/超限 422/伪造 sourceDoc 重试、指纹与全文 sha256 一致

## 已知边界（如实）

- 单源书锚点保持 'S1'（既有测试锁定），多源用真实 doc id；章内块级锚点 sourceId 未多源化（fileName 已正确，阅读器引用卡显示无碍）。
- 成书后追加来源未做（创建时一次给定）；book health 检测 UI 另立阶段（指纹已落盘）。
- 「全文指纹」= pages 文本 \n 拼接的 sha256（documentStore 不存原始字节）。
- 各份 ≤45,000 字（上传期既有卡口）+ 合计 ≤90,000 字；上限为拍板值，可按演示材料再调。
- MVP 规格 §3.3 顺手去掉「Word」排除（与既有 DOCX 支持自相矛盾）。
