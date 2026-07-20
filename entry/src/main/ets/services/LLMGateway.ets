// LLMGateway —— 云端 LLM 调用代理骨架
// 职责：向自建 Node.js 代理服务发请求（非直连大模型 API）
// 安全模型：密钥存代理端（Node.js），不落地到 ArkTS 代码
// 无状态：代理端不记录用户内容，仅做转发+审计
//
// TODO: 队友/后端实现以下功能
//   1. 完善 HTTP 请求（用 @ohos.net.http）
//   2. 实现代理 URL 配置化（不硬编码）
//   3. 错误重试 + 超时控制
//   4. 流式响应处理 (SSE → callback)

// ── 类型定义 ──

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface LLMMessage {
  role: string;  // 'system' | 'user' | 'assistant'
  content: string;
}

export interface LLMResponse {
  id: string;
  model: string;
  choices: LLMChoice[];
}

export interface LLMChoice {
  index: number;
  message: LLMMessage;
  finish_reason: string;
}

// ── 配置（占位）──
// 真 key 不提交到 git；队友开发时用自己的 .env / DevEco Studio Run Configuration
// ⚠️ 真机调试：localhost 指向手机自身，需改为 PC 的局域网 IP（如 http://192.168.1.x:3456/v1/chat/completions）
// ⚠️ 模拟器：localhost 通常可用（模拟器和 PC 共享网络栈）

const PROXY_URL: string = 'http://localhost:3456/v1/chat/completions';

// ── 调用 ──

export async function chat(req: LLMRequest): Promise<LLMResponse | null> {
  // TODO: 使用 @ohos.net.http 发 POST 请求到 PROXY_URL
  // 当前占位，返回 mock 结果
  console.info('LLMGateway chat called with model: ' + req.model);
  console.info('LLMGateway messages count: ' + req.messages.length);

  let mockResp: LLMResponse = {
    id: 'mock-' + Date.now().toString(),
    model: req.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'LLM 代理服务尚未接入，这是占位响应。请在 server/ 目录启动代理服务。' },
      finish_reason: 'stop'
    }]
  };
  return mockResp;
}
