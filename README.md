# loci

> 个人学习 Agent：把资料转化为可阅读、可验证、可追溯的学习项目，并持续给出下一步。

当前仓库基于已合并的 PR #7，处于可继续开发、构建和测试的原型阶段，不代表生产级产品已经完成。

## 工程组成

| 目录 | 定位 |
| --- | --- |
| `admin/` | React、TypeScript、Vite 可运行产品原型；不是正式客户端 |
| `entry/` | 唯一正式产品客户端，使用 ArkTS、ArkUI 实现 |
| `server/` | 正式产品的唯一业务后端和事实来源 |
| `docs/product/` | 唯一现行文档目录，定义产品流程、页面、领域和验收要求 |
| `archive/documentation-2026-08-24/docs/` | 2026-08-24 封存的其余旧文档，仅供追溯 |

`admin/` 用于确认流程、页面和交互，可以使用明确标注的模拟数据，也可以在需要时连接 `server/` 联调。正式 API 以 `entry + server` 的实现与验收为准，不能由 Web 原型反向定义。

## 启动开发环境

需要 Node.js 20+。先启动后端：

```bash
cd server
copy .env.example .env
npm ci
npm run dev
```

后端默认监听 `http://localhost:3456`，健康检查地址为 `http://localhost:3456/health`。

需要查看或评审可运行原型时，再启动 `admin/`：

```bash
cd admin
npm ci
npm run dev
```

前端默认运行在 `http://localhost:5173`。HarmonyOS 客户端请使用 DevEco Studio 打开仓库根工程并运行 `entry` 模块。

## 校验

```bash
cd server
npm test
npm run build

cd ../admin
npm test
npm run build
```

## 文档状态

根目录原有的 `PRODUCT.md`、`DESIGN.md` 已删除。`docs/` 只保留 [现行产品文档](docs/product/README.md)；其他旧文档已移入 [文档归档](archive/documentation-2026-08-24/README.md)。

归档内容只供历史追溯，不构成现行产品、设计、架构、接口或实施依据。同一问题发生冲突时，以用户最新确认的决定和 `docs/product/` 中对应文档为准。
