# 小艺开放平台 · 端A2A 开发文档摘要（喂给本地 Agent 用）

> **定位：可选连接器的技术参考，不是产品需求。** 独立 App 的产品结构、数据关系和核心流程以 [PRD](../PRD.md) 为准；只有在实现小艺/端 A2A 连接器时才以本文和官方文档为参考。文中关于“本项目采用端 A2A”“端侧自建知识库”等历史项目判断不构成当前约束。

> 本文摘录自华为开发者联盟官方文档（小艺开放平台 → Agent → A2A协议接入方案，文档版本 V0.6，页面更新时间 2026-06 ~ 2026-07）。
> 用途：为无法访问外网的本地开发 Agent 提供端A2A接入所需的全部关键协议与接口信息。
> 注意：协议较新，若文档与真机行为不一致，以真机表现为准。

---

## 1. 平台与编排模式

小艺开放平台是 Agent 与 Skill 生态的统一开放平台，兼容端/云/MCP、意图框架，提供开发、调试、评测、分发、运营一站式服务。Agent 编排模式包括：单Agent（LLM模式）、云工作流、多Agents、云A2A、**端A2A**、OpenClaw。

**端A2A模式**：应用内 Agent 与小艺 Client Agent 通信，基于端A2A协议实现端到端轻量化对接。智能体部署于本地设备，利用端侧算力与系统级API，低延迟、高隐私。适用于已有鸿蒙端应用的开发者。

> 区分：控制台的「A2A基础配置」要求填 API URL、AK/SK/OAuth——那是**云A2A**的配置项。端A2A不需要服务器地址，绑定关系靠应用包名 + AgentCard 建立。

## 2. 核心概念（协议四要素）

| 概念 | 说明 |
|---|---|
| **Context（会话）** | 由 Agent 管理并分配 contextId，相同 contextId 标识同一会话。首次请求小艺不带 contextId，Agent 在首帧响应中生成返回，之后小艺每次请求携带。Agent 主动令会话失效时返回**错误码 99911222**，小艺收到后不带 contextId 重放请求。 |
| **Task（任务）** | 一件事从发起到完成的全过程，可含多次消息往返。taskId 由 Agent 分配。任务终止后不可重启。 |
| **Artifact（产出物）** | Task 的产出单元，artifactId 唯一标识。同一 Artifact 内内容组合呈现（如：思考过程+正文+卡片）；需独立处理的内容各为一个 Artifact（如长时任务中的接管通知、胶囊状态更新）。 |
| **Part** | Artifact 的组成分片，承载具体内容：文本、卡片、长时任务指令等。 |

任务状态（status.state）常见值：`TASK_STATE_SUBMITTED`（首帧）、`TASK_STATE_WORKING`（执行中）、`TASK_STATE_INPUT_REQUIRED`（需要用户补充输入，即澄清）、`TASK_STATE_COMPLETED`（完成）。

## 3. 应用内 Agent 开发接入（三件套）

接入端A2A需实现两类 Ability：

- **AgentExtensionAbility**（必须）：与小艺进行 A2A 协议通信。
- **AgentUIExtensionAbility**（按需）：向小艺返回自定义 UI 卡片内容。

在 DevEco Studio 中通过【New】→【Extension Ability】→【Agent】创建，自动生成三个文件：

1. `module.json5`：注册 AgentExtensionAbility，通过 metadata 指向 agent_config.json。
2. `agent_config.json`：AgentCard 配置，声明 Agent 能力、技能与元信息，小艺据此识别和路由。
3. AgentExtensionAbility 实现类：A2A 通信逻辑。

官方样例代码：`https://gitcode.com/openharmony/applications_app_samples/tree/master/code/DocsSample/Ability/AgentExtensionAbility`

### 3.1 AgentCard 示例（agent_config.json）

```json
{
  "agentCards": [
    {
      "agentId": "flight-agent",
      "name": "机票助手",
      "description": "提供航班搜索与预订服务",
      "iconUrl": "https://example.com/icon.png",
      "version": "1.2.0",
      "capabilities": {
        "streaming": true,
        "pushNotifications": true,
        "stateTransitionHistory": false
      },
      "defaultInputModes": ["text/plain", "application/json"],
      "defaultOutputModes": ["text/plain", "application/json"],
      "skills": [
        {
          "id": "flight-search",
          "name": "航班搜索",
          "description": "根据出发地、目的地、日期搜索最优航班",
          "tags": ["flight", "search"],
          "examples": ["帮我查下周三从北京到上海的上午航班"]
        }
      ]
    }
  ]
}
```

关键字段：
- `agentId`（必填）：Agent 唯一标识，需与客户端调用 `connectAgentExtensionAbility` 时传入的 agentId 一致。
- `name`（必填）：显示名称。
- `description`（必填）：功能描述，**小艺通过此字段进行意图匹配和技能路由**。

### 3.2 AgentExtensionAbility 生命周期方法（按触发顺序）

| 顺序 | 方法 | 触发时机 |
|---|---|---|
| 1 | `onCreate(want: Want): void` | Ability 初始化，连接建立前。want.parameters 含小艺传入的上下文。 |
| 2 | `onConnect(want: Want, proxy: AgentHostProxy): void` | 建立连接。**proxy 必须保存**，后续 sendData/authorize 都靠它。 |
| 3 | `onAuth(proxy: AgentHostProxy, data: string): void` | 密钥协商（可选流程），完成后通过 `proxy.authorize` 回传结果。 |
| 4 | `onData(proxy: AgentHostProxy, data: string): void` | 收到小艺消息（JSON 字符串，结构因场景而异），处理后通过 `proxy.sendData` 返回。 |
| 5 | `onDisconnect(...)` | 连接断开。 |
| 6 | `onDestroy()` | Ability 销毁。 |

AgentHostProxy 两个关键方法：
- `sendData(data: string): void`——向小艺发送处理结果（Task、TaskStatusUpdateEvent、TaskArtifactUpdateEvent 等各类响应）。
- `authorize(data: string): void`——密钥协商回传。

### 3.3 AgentUIExtensionAbility（卡片）

生命周期：`onCreate → onSessionCreate → onForeground → onBackground → onSessionDestroy → onDestroy`。

核心方法：
```
onSessionCreate(want: Want, session: UIExtensionContentSession): void
```
在此将卡片页面与 session 绑定，通过 `session.loadContent('pages/CardPage', storage)` 加载 ArkTS 页面。

**参数传递**：Agent 通过 A2A 返回 `uiExtensionCard` 指令时，`payload` 字段由小艺透传至 AgentUIExtensionAbility，在 onSessionCreate 中读取：

```ts
onSessionCreate(want: Want, session: UIExtensionContentSession) {
  const payload = want.parameters?.['ability.want.params.payload'] as string;
}
```

注意：A2A 约定传参固定通过 `ability.want.params.payload` 传递。卡片实现与标准 UIExtensionAbility 一致。

## 4. 消息协议格式（对话交互）

传输格式为 **JSON-RPC 2.0**。小艺→Agent 的请求 method 为 `message/stream`；Agent→小艺的响应放在 `result` 中，有三种载体：`result.task`（一次性结果）、`result.statusUpdate`（状态更新）、`result.artifactUpdate`（产出物更新）。

### 4.1 用户请求（小艺 → Agent）

```json
{
  "jsonrpc": "2.0",
  "id": "req-002",
  "method": "message/stream",
  "params": {
    "message": {
      "messageId": "msg-abc-002",
      "role": "ROLE_USER",
      "contextId": "ctx-session-xyz",
      "parts": [{ "text": "请介绍一下量子计算的基本原理", "mediaType": "text/plain" }]
    },
    "metadata": { "traceId": "trace-7f8a2b3c-0001", "agentId": "agent-example-001", "appVersion": "12.0.1" }
  }
}
```

### 4.2 单轮问答（Agent 一次性返回）

```json
{
  "jsonrpc": "2.0", "id": "req-001",
  "result": {
    "task": {
      "id": "task-7f8a2b3c-0001",
      "contextId": "ctx-session-xyz",
      "status": { "state": "TASK_STATE_COMPLETED", "timestamp": "2026-03-04T10:24:02.500Z" },
      "artifacts": [ { "artifactId": "artifact-001", "parts": [ { "text": "……", "mediaType": "text/plain" } ] } ]
    },
    "metadata": { "traceId": "trace-7f8a2b3c-0001", "agentId": "agent-example-001" }
  }
}
```

TTS 播报：part 的 `data.ttsText` 为播报内容。同一 artifact 内只要任意 part 含 data.ttsText，则该 artifact 内所有 text part 只展示不发声；播报与文本一致时可不传。

### 4.3 流式分批回复（帧序列）

1. **首帧**：`result.task`，status.state = `TASK_STATE_SUBMITTED`。
2. **中间帧-过程信息**：`result.statusUpdate`，state = `TASK_STATE_WORKING`，`status.message.parts[].text` 对用户展示（如"正在思考"）。
3. **中间帧-思考内容**：`result.artifactUpdate`，artifact.parts[].data = `{"thinking": "用户问的是量子计算……"}`，向用户展示思考过程。
4. **中间帧-正文/推荐**：`result.artifactUpdate`（带 `append`、`lastChunk` 字段；`lastChunk: true` 表示该 artifact 结束）。
5. **末帧**：`result.statusUpdate`，state = `TASK_STATE_COMPLETED`。

每帧 metadata 携带 traceId、agentId、agentVersion。

### 4.4 Agent 对话澄清

Agent 发送 `result.statusUpdate`，state = `TASK_STATE_INPUT_REQUIRED`，message 为追问内容（如"请问您要去哪个城市？"）。小艺将用户回答以新的 `message/stream` 请求发回 Agent。

### 4.5 文件传递

在线文件通过 Part 的 `<url>` 类型扩展双向传递，字段：

| 字段 | 说明 |
|---|---|
| url | 文件地址 |
| filename | 文件名（含扩展名） |
| mediaType | MIME 类型 |

支持的 mediaType：`image/jpeg`、`image/png`、`image/gif`、`image/webp`、`image/bmp`、`application/pdf`、`text/csv`；其他文档用 `application/octet-stream` 配合 filename 扩展名识别（如 doc、ppt）。

### 4.6 对话返回卡片（uiExtensionCard 指令）

Agent 通过 `result.artifactUpdate` 返回：

```json
{
  "jsonrpc": "2.0", "id": "req-001",
  "result": {
    "artifactUpdate": {
      "taskId": "task-001",
      "contextId": "ctx-001",
      "artifact": {
        "artifactId": "art-card-001",
        "parts": [
          {
            "data": {
              "uiExtensionCard": {
                "cardId": "卡片id",
                "bundleName": "com.example.agentapp",
                "moduleName": "entry",
                "abilityName": "AgentUIExtensionAbility",
                "payload": "卡片参数",
                "dimension": "2x4",
                "encrypted": false,
                "summary": "卡片摘要，用于上下文存储和风控"
              }
            }
          }
        ]
      },
      "append": false,
      "lastChunk": true
    },
    "metadata": { "traceId": "trace-7f8a2b3c-0001", "agentId": "agent-example-001", "agentVersion": "1.2.0" }
  }
}
```

小艺收到后拉起对应 bundleName/abilityName 的 AgentUIExtensionAbility 渲染卡片，payload 透传（见 3.3）。

## 5. 长时任务伴随（复习会话/文件摄入进度场景要用）

整体时序：小艺发起 query → Agent 返回 `uiSession CREATE` → 小艺 UI 就绪后发送 `uiSession READY` → Agent 进入 `TASK_STATE_WORKING` 执行任务。期间通过对话胶囊、状态胶囊、对话面板展示过程，用户可干预/关闭。

小艺确认就绪（小艺 → Agent）：

```json
{
  "jsonrpc": "2.0", "id": "req-002", "method": "message/stream",
  "params": {
    "message": {
      "messageId": "msg-002", "taskId": "task-001", "contextId": "ctx-001", "role": "ROLE_USER",
      "parts": [ { "data": { "uiSession": { "action": "READY", "uiSessionState": "WORKING" } } } ]
    },
    "metadata": { "traceId": "trace-7f8a2b3c-0002", "agentId": "agent-example-001", "appVersion": "12.0.1" }
  }
}
```

Agent 确认开始任务（Agent → 小艺）：`result.statusUpdate`，state = `TASK_STATE_WORKING`，message.parts 携带文本如"正在执行"。

**播报与澄清**：Agent 通过 `result.artifactUpdate` 推送文本（显示在对话胶囊）；需要用户参与时用 `TASK_STATE_INPUT_REQUIRED` 澄清。任务进展更新、任务完成退出、用户点击关闭任务均为同套机制（statusUpdate/artifactUpdate 不同状态与 part 指令）。

## 6. chips（话题）推荐（主动服务的官方入口）

机制：小艺通过系统级感知获取当前 App 上下文、设备上下文，向 Agent 请求 chips 话题推荐，Agent 返回最适合当前场景的话题建议。该场景为一次性任务，contextId 与会话保持一致，连续请求复用同一 contextId。

小艺发起推荐请求（小艺 → Agent），method = `perception/suggest`：

```json
{
  "jsonrpc": "2.0", "id": "req-001", "method": "perception/suggest",
  "params": {
    "message": {
      "messageId": "msg-001", "contextId": "ctx-001", "role": "ROLE_USER",
      "parts": [
        {
          "data": {
            "perceptionContext": {
              "foregroundApp": "com.example.app",
              "browserContexts": [],
              "currentScreenContent": {},
              "intentLabels": []
            }
          }
        }
      ]
    },
    "metadata": { }
  }
}
```

Agent 返回建议（`result.artifactUpdate`，parts 内为推荐操作列表），单条建议结构示例：

```json
{
  "text": "联系客服",
  "jump": {
    "deepLink": {
      "url": "example://service",
      "appName": "示例应用",
      "appPackage": "com.example.app"
    }
  }
}
```

随后补一帧 `result.statusUpdate`（state = `TASK_STATE_COMPLETED`）收尾。

## 7. Part 结构定义（data 互斥字段）

`part.data` 是协议扩展核心载体。**互斥规则：同一个 Part 的 data 内每次仅携带下列字段之一；不同 Part 可携带不同 data 字段，并列存在于同一 Artifact 中**。

| 字段 | 类型 | 方向 | 说明 |
|---|---|---|---|
| thinking | string | Agent→小艺 | 思考过程增量文本 |
| suggestions | array | Agent→小艺 | 推荐操作列表 |
| uiExtensionCard | object | Agent→小艺 | 动态卡片渲染指令 |
| uiSession | object | 双向 | UI 会话生命周期管理指令 |
| tts | object | 双向 | TTS 播报控制指令 |
| ttsText | string | Agent→小艺 | TTS 播报文本（与同 artifact 内 text part 关联） |

## 8. 设备上下文变量（云A2A/平台侧机制，供参考）

Agent Server 端可获取受控系统上下文，需先在小艺开放平台变量配置项中打开对应开关。请求中 data 结构：

```json
{
  "variables": {
    "clientVariables": [{}],
    "systemVariables": [
      { "app_ver": "{{小艺APP版本号，开关打开后生效}}", "foreground_apps": "{{前台应用列表，开关打开后生效}}" }
    ],
    "memoryVariables": [{}]
  }
}
```

分三类：clientVariables / systemVariables / memoryVariables。端A2A 场景下，App 在端上可直接用系统 API 获取同类信息。

## 9. 平台侧流程与合规（上架前置）

「关联应用」前提条件（官方原文）：

1. 开发者已在 **AppGallery Connect** 创建鸿蒙应用；
2. 已为鸿蒙应用**配置签名**：使用真机设备调试前需要对 HAP 进行签名，否则无法调试；
3. 开发者在小艺开放平台已创建智能体，并**关联应用**；
4. 应用 App 端已集成 **AgentKit** 能力。

调试工具：**小艺罗盘**（平台提供）+ 真机调试。上架需过审核；知识库若勾选「授权用于小艺知识问答」，审核周期 1-3 个工作日。

## 10. 平台知识库能力（对照参考）

小艺智能体平台【资源库】→【知识库】→【新建知识库】，支持四种导入方式：

- **文档**：文档形式导入，可配置引用源信息；
- **图片**：图片形式导入，可配置引用源，可选智能标注；
- **数据源**：配置接口形式导入；
- **爬虫**：填写爬取地址、配置爬取周期自动爬取。

创建后在智能体的知识库位置点击添加即可挂载。
（注：本摘要对应的项目采用端A2A + 端侧自建知识库，平台知识库仅作对照。）

## 11. 关键参考链接

| 内容 | 链接 |
|---|---|
| 端A2A协议技术规范 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-device-0000002624952279 |
| 应用内Agent开发接入 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-inapp-0000002630346158 |
| 对话交互报文 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-chat-0000002660585429 |
| 长时任务伴随报文 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-longtask-0000002660465489 |
| chips推荐报文 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-chips-0000002660585431 |
| Part结构定义 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-exp-part-0000002630186260 |
| 异常处理与任务取消 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-exp-0000002660465491 |
| 错误码总览 | https://developer.huawei.com/consumer/cn/doc/service/agent2agent-errorcode-0000002660465493 |
| 智能体分类（编排模式） | https://developer.huawei.com/consumer/cn/doc/service/differences-in-arrangement-modes-0000002471344117 |
| 关联应用 | https://developer.huawei.com/consumer/cn/doc/service/related-applications-0000002437785706 |
| 创建知识库 | https://developer.huawei.com/consumer/cn/doc/service/create-a-knowledge-base-0000002471344153 |
| AgentExtensionAbility样例 | https://gitcode.com/openharmony/applications_app_samples/tree/master/code/DocsSample/Ability/AgentExtensionAbility |
| 端侧A2A框架概述 | https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/agent-overview |
| @ohos.app.agent.AgentExtensionAbility API | https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-app-agent-agentextensionability |
| @ohos.app.ability.AgentUIExtensionAbility API | https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-agent-agentuiextensionability |

## 12. 尚未摘录、需在线查阅的部分

- 「异常处理与任务取消」「错误码总览」全文（本摘要仅含错误码 99911222 会话失效机制）；
- 「其他结构定义」（agent2agent-exp-other）中的完整字段表；
- uiSession CREATE/EXIT 指令的完整字段枚举（长时任务伴随页后半部分）；
- HarmonyOS 侧 API 参考（AgentExtensionContext、AgentCard 完整字段）。
