# 输入与入口打磨（EPUB / 成本估算 / starter 建议）结果

**日期：** 2026-08-17

**工作分支：** `codex/input-and-entry-polish`（从主线拉，独立于 D/E/F）

**规格：** `docs/superpowers/specs/2026-08-17-input-and-entry-polish-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| EPUB 解析（container.xml→OPF→spine 顺序→去标签→虚拟分页管线） | `server/src/documents/epubParser.ts` |
| 路由分发 + format 'EPUB' 落盘（jszip 升为运行时依赖） | `documents.ts` / `documentStore.ts` / `bookTypes.ts` |
| spine 成本估算（章页数×800+6000，纯算术） + GET /:id/estimate | `server/src/books/estimate.ts` / `books.ts` |
| starter 建议派生（悬崖>薄弱>继续读，≤3 条） + GET /api/learner/suggestions | `server/src/learning/suggestions.ts` / `learner.ts` |
| 上传接受 .epub + 提案页逐章估算与合计 + 今日页「学习建议」区 | `UploadBookSheet.tsx` / `BookProposalPage.tsx` / `TodayPage.tsx` / `App.tsx` |

## 验证

- server 441 全绿（EPUB 9 + estimate 5 + suggestions 5 新增）
- admin 312 全绿 + tsc 无错（bookApi 73；estimate/suggestions 校验 7 例新增）
- 验收 4 条全过：epub 全链路与损坏报错、估算合计=各章之和且只读、悬崖优先建议、无数据无建议 UI

## 已知边界（如实）

- EPUB 内嵌图片/表格样式按规格丢弃； spine 缺失时退回 manifest 顺序。
- 成本估算为经验常数参考值（800 tokens/页 + 6000 生成预算），不参与计费，与真实消耗可能有数倍偏差。
- 建议位在今日页「学习证据」行下方（主线无学习数据卡片——那是 E 分支内容，合并后两区共存）。
- 建议文案模板化；「继续读」取 updatedAt 最近的书，不含章锚点。
