// HarmonyAgent LLM Proxy Server
// 职责：代理 LLM API 调用，保护 API Key 不泄露到客户端
// 安全模型：无状态（不记录用户内容），仅做转发 + 审计日志

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { llmRouter } from './routes/llm.js';
import { createBookAgentRouter } from './routes/bookAgent.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createBooksRouter } from './routes/books.js';
import { createDocumentStore } from './documents/documentStore.js';
import { createBookStore } from './books/bookStore.js';
import { AgentRuntime } from './agent/runtime/agentRuntime.js';
import { createBookAgentRunner } from './agent/runtime/bookAgentRunner.js';
import { createSingleUserBookAccess, LearningContextBuilder } from './agent/runtime/learningContext.js';
import { createTurnStore } from './agent/runtime/turnStore.js';
import { createAgentTurnsRouter } from './routes/agentTurns.js';
import path from 'node:path';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);

// Middleware
app.use(cors());
app.use('/api/agent', createBookAgentRouter());
const dataRoot = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const documentStore = createDocumentStore(dataRoot);
const bookStore = createBookStore(path.join(dataRoot, 'books'));
const turnStore = createTurnStore(path.join(dataRoot, 'agent-turns'));
const runtimeActor = {
  userId: process.env.RUNTIME_USER_ID?.trim() || 'local-user',
  workspaceId: process.env.RUNTIME_WORKSPACE_ID?.trim() || 'local-workspace',
};
const runtime = new AgentRuntime({
  turnStore,
  contextBuilder: new LearningContextBuilder({
    bookAccess: createSingleUserBookAccess(bookStore, runtimeActor),
  }),
  runner: createBookAgentRunner(),
});
app.use(
  '/api/agent',
  createAgentTurnsRouter({
    runtime,
    turnStore,
    actorProvider: () => runtimeActor,
  }),
);
app.use(
  '/api/documents',
  createDocumentsRouter({
    store: documentStore,
  }),
);
app.use(
  '/api/books',
  createBooksRouter({
    documentStore,
    bookStore,
  }),
);
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'harmony-agent-server' });
});

// LLM 代理路由（挂载在两个前缀下，兼容 admin 代理 /api 和 鸿蒙端 /v1）
app.use('/v1', llmRouter);
app.use('/api', llmRouter);

app.listen(PORT, () => {
  console.log(`[HarmonyAgent Server] running on http://localhost:${PORT}`);
  console.log(`[HarmonyAgent Server] provider: ${process.env.LLM_PROVIDER || 'not configured'}`);
  console.log(`[HarmonyAgent Server] audit log: ${process.env.AUDIT_LOG_ENABLED === 'true' ? 'enabled (no content)' : 'disabled'}`);
});
