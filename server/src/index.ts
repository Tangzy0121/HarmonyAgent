// HarmonyAgent LLM Proxy Server
// 职责：代理 LLM API 调用，保护 API Key 不泄露到客户端
// 安全模型：无状态（不记录用户内容），仅做转发 + 审计日志

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { llmRouter } from './routes/llm.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'harmony-agent-server' });
});

// LLM 代理路由
app.use('/v1', llmRouter);

app.listen(PORT, () => {
  console.log(`[HarmonyAgent Server] running on http://localhost:${PORT}`);
  console.log(`[HarmonyAgent Server] provider: ${process.env.LLM_PROVIDER || 'not configured'}`);
  console.log(`[HarmonyAgent Server] audit log: ${process.env.AUDIT_LOG_ENABLED === 'true' ? 'enabled (no content)' : 'disabled'}`);
});
