# loci 后端开发者文档

> 状态：现行
>
> 创建日期：2026-09-03
>
> 代码基线：master `d4a41ea`（PR #10 + PR #11 合并后）

`docs/server/` 是 `server/` 的开发者文档目录，描述后端的实现架构、Agent 运行时、功能清单与实施路线。

## 权威关系

- **产品语义**（对象、流程、页面、验收）以 [`docs/product/`](../product/README.md) 为准，本目录不得反向定义产品口径；
- **实现架构与 API 现状**以本目录 + `server/` 代码和测试为准；
- 同一问题冲突时：用户最新确认的决定 → `docs/product/` 专项文档 → 本目录 → 代码与测试证明的实现状态。

文档中出现的能力若代码尚未实现，必须标注 `Planned`；禁止把规划写成现状。

## 阅读顺序

| 文档 | 回答的问题 |
| --- | --- |
| [agent-architecture.md](agent-architecture.md) | 学习 Agent 的运行时、能力、工具、合同和事件模型是什么 |
| [functions-and-roadmap.md](functions-and-roadmap.md) | 后端现在有什么功能、缺什么、按什么顺序补 |

## 模块地图

```text
server/src/
  index.ts                 # 组装：store → service → runtime → 路由
  routes/                  # HTTP 层：documents / books / learner / agent turns / llm 代理
  documents/               # 来源解析：pdf/docx/epub/md/txt → DocumentUnit 虚拟页
  books/                   # 学习书：提案/章节生成/校验/掌握度/调度/题库/导出/成本估算
  learning/                # 学习证据：HMAC 签发、投影 outbox、恢复 worker、学习者画像、建议
  agent/                   # LLM 流式客户端与 book-chat 合同
  agent/runtime/           # AgentRuntime：turn 生命周期、能力注册表、工具注册表、上下文
```

## 本地启动与校验

```bash
cd server
copy .env.example .env   # 填入 LLM_API_KEY
npm install
npm test                 # vitest，基线 55 文件 511 用例
npm run build            # tsc
npm run dev              # tsx watch，默认 :3456
```

## 运行事实

- 存储：`server/data/` 文件型 JSON（已 gitignore），单用户 `local-user` / `local-workspace`（可用 `RUNTIME_USER_ID` / `RUNTIME_WORKSPACE_ID` 覆盖）；
- 模型：OpenAI 兼容协议，默认 DeepSeek（`LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL`），密钥只在服务端；
- 审计：`AUDIT_LOG_ENABLED=true` 时只记录调用时间/模型/token 数，不记录内容；
- 定位：实验性本地服务（docs/product/05 §2.3），生产账户、数据库和部署属 `Deferred`。
