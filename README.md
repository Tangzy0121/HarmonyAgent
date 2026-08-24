# loci

> 个人学习 Agent：把资料转化为可阅读、可验证、可追溯的学习项目，并持续给出下一步。

当前仓库同时包含产品原型、HarmonyOS 正式客户端和服务端。三者用途不同，不共享运行依赖，也不互相替代。

## 工程组成

| 目录 | 定位 |
| --- | --- |
| `prototype/` | 当前可运行的移动端产品原型；使用 React、TypeScript 和 Vite，只读取本地 Mock 数据 |
| `admin/` | 旧原型代码；仅供梳理历史视觉与交互，不再承接新原型开发 |
| `entry/` | 唯一正式产品客户端，使用 ArkTS、ArkUI 实现 |
| `server/` | 正式产品的唯一业务后端和事实来源 |
| `docs/product/` | 现行产品文档，定义产品流程、页面、领域边界和验收要求 |
| `archive/documentation-2026-08-24/` | 已封存的旧文档，只供历史追溯 |

`prototype/` 是移动端纯前端原型，不是 Web 产品端，也不接入 `server/`。它通过本地 Mock 数据覆盖主要页面和状态，用于评审信息架构、文案、排版和交互。正式业务能力只由 `entry + server` 实现和验收。

## 启动原型

需要 Node.js 20+。原型可以独立运行，不需要先启动服务端：

```bash
cd prototype
pnpm install
pnpm dev
```

Vite 会在终端显示本地访问地址。宽屏只居中展示最大 480px 的移动画布，不提供桌面版布局。

## 正式端开发与校验

服务端：

```bash
cd server
copy .env.example .env
npm install
npm test
npm run build
```

HarmonyOS 客户端请使用 DevEco Studio 打开仓库根工程并运行 `entry` 模块。正式端联调和端到端验收只针对 `entry + server`，不得用原型 Mock 结果替代。

## 文档真源

- 产品定义、流程、页面语义、领域模型和验收：[`docs/product/`](docs/product/README.md)
- 当前原型的目标与边界：[`prototype/PRODUCT.md`](prototype/PRODUCT.md)
- 当前原型的视觉与组件规范：[`prototype/DESIGN.md`](prototype/DESIGN.md)
- 旧方案和旧 QA：仅供追溯，不构成现行依据

同一问题发生冲突时，依次采用用户最新确认的决定、`docs/product/` 对应专项文档、`prototype/` 中的现行原型规范，以及代码和测试所证明的实现状态。正式 API 和业务事实始终以 `entry + server` 为准。
