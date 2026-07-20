// LLM 代理路由 —— 转发 /v1/chat/completions 到云端 LLM
// 安全原则：
//   1. API Key 只在服务端，不传给客户端
//   2. 不记录用户消息内容（仅记录时间戳/模型/token 数）
//   3. 支持流式 (SSE) 和非流式响应

import { Router, Request, Response } from 'express';

export const llmRouter = Router();

// 审计日志（不记录内容，只记录元数据）
function auditLog(model: string, timestamp: number, status: number): void {
  if (process.env.AUDIT_LOG_ENABLED !== 'true') return;
  console.log(`[audit] ${new Date(timestamp).toISOString()} | model=${model} | status=${status}`);
}

// POST /v1/chat/completions
llmRouter.post('/chat/completions', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const provider = process.env.LLM_PROVIDER || 'deepseek';
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
  const apiKey = process.env.LLM_API_KEY || '';

  if (!apiKey) {
    auditLog(req.body?.model || 'unknown', startTime, 500);
    res.status(500).json({ error: 'Server not configured: LLM_API_KEY is missing. Check .env file.' });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    auditLog(req.body?.model || 'unknown', startTime, response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[llm] upstream error ${response.status}: ${errText.substring(0, 200)}`);
      res.status(response.status).json({
        error: `Upstream LLM error: ${response.status}`,
        details: errText.substring(0, 500)
      });
      return;
    }

    // 处理流式响应
    if (req.body?.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body?.getReader();
      if (!reader) {
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (streamErr) {
        console.error('[llm] stream error:', streamErr);
      }
      res.end();
      return;
    }

    // 非流式响应
    const data = await response.json();
    res.json(data);
  } catch (err) {
    auditLog(req.body?.model || 'unknown', startTime, 502);
    console.error('[llm] proxy error:', err);
    res.status(502).json({ error: 'Failed to reach LLM provider' });
  }
});


// POST /embed — 批量 embedding 生成（占位，P0 用云端 embedding）
llmRouter.post('/embed', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Embedding endpoint not yet implemented.',
    plan: 'P0: cloud embedding via LLM proxy. P1: evaluate on-device embedding.'
  });
});

// POST /parse — PPT/PDF 文本提取（占位，P0 用云端解析后即焚）
llmRouter.post('/parse', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Document parse endpoint not yet implemented.',
    plan: 'P0: cloud one-shot parse (burn-after-read). Files: PPTX, PDF, DOCX, Markdown.'
  });
});
