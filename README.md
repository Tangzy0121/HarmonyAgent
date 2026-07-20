# HarmonyAgent —— 知识学伴

> 鸿蒙高校创新赛 · 赛题2：Agent 创新  
> 个人知识管理 Agent —— 摄入、理解、复习三位一体，知识不出端

## 项目结构

```
HarmonyAgent/
├── entry/                    # 鸿蒙 App（DevEco Studio 工程）
│   └── src/main/ets/
│       ├── agent/            # AgentExtensionAbility + A2A 协议
│       ├── entryability/     # 应用主入口
│       ├── pages/            # ArkUI 页面（← 队友写前端）
│       ├── services/         # LLM 代理、学习模型等
│       └── data/             # SQLite 数据库
├── admin/                    # Web 管理后台（React + Vite + Tailwind）
│   └── src/
├── server/                   # LLM 代理服务（Node.js + Express）
│   └── src/
└── docs/
    ├── api/                  # 鸿蒙 API 参考文档（MCP抓取）
    └── 2026-07-18-端A2A技术实施计划.md
```

## 快速开始

### 前置条件

- [DevEco Studio](https://developer.huawei.com/consumer/cn/download/) 6.1.1+
- [Node.js](https://nodejs.org/) 20+
- 鸿蒙手机（真机调试需要 AGC 签名）

### 1. 打开鸿蒙工程

用 DevEco Studio 打开本目录，连接真机或启动模拟器，点击 Run。

### 2. 启动 LLM 代理服务

```bash
cd server
cp .env.example .env        # 编辑 .env 填入你的 API Key
npm install
npm run dev                  # 启动在 localhost:3456
```

### 3. 启动 Web 管理后台

```bash
cd admin
npm install
npm run dev                  # 启动在 localhost:5173
```

## 开发路线

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M0 | AGC 签名 + 小艺平台关联 + 样例跑通 | 🔲 |
| M1 | 端A2A 通信 + 基础 Skill 路由 | ✅ 骨架完成 |
| M2 | 摄入笔记 → 分块 → 向量化 | 🔲 |
| M3 | 知识问答 + LLM 集成 | 🔲 |
| M4 | 学习模型 + 主动复习 Chips | 🔲 |
| M5 | Web 管理后台 | 🔲 队友 |
| M6 | 联调 + 演示脚本 | 🔲 |

## API 参考文档

`docs/api/` 目录下是通过 MCP（Context7）从华为官方文档抓取的参考：
- `agent-extension-ability.md` —— AgentExtensionAbility 生命周期
- `relational-store.md` —— @ohos.data.relationalStore SQLite 操作
- `notification.md` —— 推送通知 API
- `arkui-animation-gesture.md` —— ArkUI 手势与动画
- 更多见 `docs/api/`

## 技术选型

- **接入层**：小艺开放平台 端A2A V0.6（AgentExtensionAbility + AgentUIExtensionAbility）
- **智能层**：ArkTS 自建轻量 Orchestrator（意图分发 + Tool Calling）+ Node.js LLM 代理
- **数据层**：全端侧 RelationalStore SQLite（Float32 BLOB 向量，暴力余弦相似度）
- **学习模型**：SM-2 风格掌握度 + 艾宾浩斯衰减（规则引擎，LLM 仅输出等级评分）
- **隐私**：知识不出端，云端 LLM 经无状态代理转发，不保留内容
