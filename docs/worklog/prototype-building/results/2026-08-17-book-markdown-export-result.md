# 学习书导出 Markdown 结果

**日期：** 2026-08-17

**工作分支：** `codex/interactive-learning-book-mvp`

**背景：** DeepTutor v1.5.13 对照后用户选定的三个方向之一（另两个：长期学习者模型、多文件/多格式输入，先出设计规格待评审）。

## 交付物

| 交付物 | 位置 |
| --- | --- |
| Markdown 序列化器（纯函数，无 LLM） | `server/src/books/bookMarkdown.ts` |
| 导出路由 `GET /api/books/:id/export` | `server/src/routes/books.ts`（text/markdown + Content-Disposition attachment） |
| admin 导出入口 | `bookApi.bookExportUrl` + `InteractiveBookPage` 导航栏「导出 Markdown」（仅真实书） |

## 导出内容

书名/来源/学习目标/导出时间与 AI 免责声明 → 按章（不完整章带 ⚠️ 警告）→ 9 种内容块（引用带原文页码、quiz 带答案与反馈、figure 走 mermaid 围栏）→ 块级用户笔记（标注「用户笔记」）→ 学习记录摘要（答题/证据/笔记计数）。

## 验证

- server 388 全绿（bookMarkdown 9 例 + bookExport 2 例新增）
- admin 293 全绿 + tsc 无错（bookExportUrl 1 例新增）
- curl 真实导出：Content-Type `text/markdown; charset=utf-8`、Content-Disposition 带 UTF-8 文件名，正文含标题/页码引用/用户笔记/mermaid 围栏，人工抽查通过

## 后续

- Sprint B 长期学习者模型、Sprint C 多文件/多格式输入：设计规格评审后再实施。
