# 多格式输入（Markdown / DOCX）结果

**日期：** 2026-08-17

**工作分支：** `codex/multi-format-input`

**规格：** `docs/superpowers/specs/2026-08-17-multi-format-input-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 虚拟分页（1500 字符/页、段落边界 ±10%） | `server/src/documents/virtualPages.ts` |
| 文本解析（frontmatter 剥离、200 字下限、45,000 字上限） | `server/src/documents/textDocument.ts` |
| DOCX 解析（mammoth 纯文本，图片/样式不保留） | `server/src/documents/docxParser.ts` |
| 路由分发（扩展名优先、Content-Type 兜底、octet-stream 兼容） | `server/src/routes/documents.ts` |
| format 落盘与透传（存量默认 PDF） | `documentStore.ts` / `bookTypes.ts` / `books.ts` |
| admin 上传三格式 + 专项错误文案 | `UploadBookSheet.tsx` / `bookApi.ts` / `App.tsx` |

## 验证

- server 409 全绿（virtualPages 5 + textDocument 4 + docxParser 3 + documentsFormats 8 新增；PDF 链路回归无损）
- admin 293 全绿 + tsc 无错（类型镜像 format 三值，测试夹具同步）
- 虚拟页码对上层透明：citation 子串硬校验、prompt 预算、导出、学习者模型零改动

## 已知边界（如实）

- docx 内嵌图片/表格样式按规格丢弃，上传 Sheet 已加说明文案。
- 字符上限服务端校验（45,000 字 → `doc_too_long` 专项文案）；客户端只做 20MB 预检。
- 原始文件仍以 `${id}.pdf` 文件名落盘（documentStore 既有行为，内容无损，仅文件名不反映格式，未扩散改动）。
- 新引入依赖：mammoth（MIT，运行时）、jszip（dev）。npm audit 报告 5 个传递依赖漏洞（3 moderate/1 high/1 critical），未处理，建议单独评估。
- 多文件合书仍排除，另立阶段。
