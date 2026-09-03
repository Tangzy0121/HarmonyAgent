# 多文件合书 设计规格

**状态：** 已获用户批准（DeepTutor 追赶总计划 Sprint I，2026-08-17）
**日期：** 2026-08-17
**分支：** `codex/multi-source-book`（叠于 `codex/input-and-entry-polish` `1db5356`，用其三格式输入；合并顺序 G→I）
**对标：** DeepTutor Living Book（多来源合成一本书）

## 1. 目标

创建学习书支持 1–5 份来源文档（PDF/Markdown/DOCX/EPUB 任意混合），提案与章节生成跨来源组织，引用锚点精确到「哪份文件的哪几页」。单来源书行为零回归。

## 2. 数据模型

```ts
interface StoredBook {
  source: SourceDocument              // 既有：主来源（= sources[0]），向后兼容不动
  sources?: SourceDocument[]          // 新增：全部来源（单源书可缺省，读取回退 [source]）
  sourceFingerprints?: Record<string, string>  // 新增：docId → 全文 sha256（book health 留口）
}
```

- 章 `sourceAnchors[].sourceId` 从硬编码 `'S1'` 改为**真实 document id**（存量书 'S1' 回退主来源）。
- 解析辅助：`bookSources(book) = book.sources?.length ? book.sources : [book.source]`。

## 3. 创建流程（server）

- `POST /api/books` 接受 `{ documentIds: string[], goal, learnerLevel }`；兼容旧字段 `documentId`（单串等价单元素数组）。
- 校验：1–5 份（`too_many_sources` 409）；每份已上传存在（404 document_not_found）；各份 ≤45,000 字（上传期已卡）且**合计 ≤90,000 字**（`sources_too_long` 422）；零 LLM key → 503 同既有。
- 提案 prompt：digest 改为多段拼接，每段标「【资料 N：fileName】（共 X 页）」；LLM 章输出增 `sourceDoc`（1 基资料序号）；normalize 校验 sourceDoc 在界内、pageStart/pageEnd 不超该资料页数；锚点 sourceId = documents[sourceDoc-1].id。
- 落 sourceFingerprints（每份全文 sha256）。

## 4. 章节生成与下游（server）

- 章生成：`parseAnchorPageRange` 不变；文档解析改为「按章首锚点 sourceId 找 documentStore.get(sourceId)，'S1'/找不到回退 book.source.id」；citation 子串校验天然按该文档页文执行，零改动。
- 导出 Markdown：书头列全部来源（多源时逐条 fileName）；estimate：pageCount 取 bookSources 合计。
- 既有单源书：sources 缺省 → 全部走回退路径，行为不变。

## 5. admin

- UploadBookSheet：文件多选（1–5），逐份上传后 createBook({ documentIds })；超 5 份前端即拦。
- bookApi：`createBook` 输入增 documentIds（保留 documentId 兼容）；`createBookDocumentIds(input)` 归一。
- 提案页：多源书每章 small 行加「来源：fileName」（单源不显示，避免噪音）。
- 阅读器引用卡：fileName 已在 SourceAnchor，零改动。

## 6. 规格修订

修订 `docs/superpowers/specs/2026-08-09-interactive-learning-book-mvp-design.md` §3.1/§3.3：多文件合书从排除项移入（1–5 份、合计 ≤90,000 字、PPT/扫描件/加密仍排除）。

## 7. 验收

1. pdf+md+epub 三份混合 → 提案章带正确 sourceDoc → 各章生成引用子串校验通过 → 阅读器引用卡显示对应文件名。
2. 单源书创建/生成/导出/estimate 零回归（既有测试全绿）。
3. 6 份 → 409；合计超限 → 422；伪造 sourceDoc → normalize 拒绝重试。
4. 指纹落盘且与全文 sha256 一致。
