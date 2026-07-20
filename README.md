# HarmonyAgent —— 知识学伴

> 鸿蒙高校创新赛 · 赛题2：Agent 创新  
> 个人知识管理 Agent —— 摄入、理解、复习三位一体，知识不出端

**仓库地址**: https://github.com/Tangzy0121/HarmonyAgent

## 获取代码

> ⚠️ 仓库是 **Private** 的。队友需先把 GitHub 用户名发给仓库 owner，添加为 Collaborator 后才能 clone。

```bash
git clone https://github.com/Tangzy0121/HarmonyAgent.git
cd HarmonyAgent
```

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
- [Git](https://git-scm.com/)（Windows 推荐 Git Bash）
- 鸿蒙手机（真机调试需要 AGC 签名）

### 1. 打开鸿蒙工程

用 DevEco Studio 打开本目录，连接真机或启动模拟器，点击 Run。

> ⚠️ **真机调试注意**：`entry/src/main/ets/services/LLMGateway.ets` 中的 `PROXY_URL` 默认为 `http://localhost:3456`。  
> 在真机上 `localhost` 指向手机自身，需要改为 PC 的局域网 IP（如 `http://192.168.1.x:3456`）。模拟器无需改。

### 2. 启动 LLM 代理服务

```bash
cd server
# 复制配置文件并填入 API Key（Windows 用 copy，Mac/Linux/Git Bash 用 cp）
copy .env.example .env      # Windows CMD / PowerShell
# cp .env.example .env      # Mac / Linux / Git Bash
npm ci                       # 用 lockfile 精确安装
npm run dev                  # 启动在 localhost:3456
```

### 3. 启动 Web 管理后台

```bash
cd admin
npm ci                       # 用 lockfile 精确安装
npm run dev                  # 启动在 localhost:5173
```

> Web 后台对 `/api/*` 的请求通过 Vite 代理自动转发到 `localhost:3456`（LLM 代理服务）。

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

## 技术选型

- **接入层**：小艺开放平台 端A2A V0.6（AgentExtensionAbility + AgentUIExtensionAbility）
- **智能层**：ArkTS 自建轻量 Orchestrator（意图分发 + Tool Calling）+ Node.js LLM 代理
- **数据层**：全端侧 RelationalStore SQLite（Float32 BLOB 向量，暴力余弦相似度）
- **学习模型**：SM-2 风格掌握度 + 艾宾浩斯衰减（规则引擎，LLM 仅输出等级评分）
- **隐私**：知识不出端，云端 LLM 经无状态代理转发，不保留内容
