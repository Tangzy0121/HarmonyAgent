// A2A 技能路由 —— 意图分类 + 分发到技能处理器
// 参考：HarmonyAgent Orchestrator 技术实施计划 §1.2
// V1 简化：规则优先，占位技能处理（队友写具体实现）
//
// 三个 A2A skill（对应 agent_config.json）：
//   ingest_note     —— 摄入笔记/文件 → 解析 + 分块 + 向量化 + 知识点抽取
//   ask_knowledge   —— 知识问答 → 检索 + LLM 生成回答
//   get_review      —— 主动复习 → 学习模型驱动 + Chips 推荐

import { A2ARequest, A2APart, TaskStatus, extractText, newContextId, newTaskId,
         buildTaskSubmitted, buildStatusUpdate, buildArtifactUpdate, buildError } from './A2AProtocol';

// ── 显式类型 ──

enum Intent {
  INGEST_NOTE = 'ingest_note',
  ASK_KNOWLEDGE = 'ask_knowledge',
  GET_REVIEW = 'get_review',
  UNKNOWN = 'unknown'
}

interface ClassifyResult {
  intent: Intent;
  extras: Record<string, string>;  // 额外参数（概念名、文件名等）
}

// ── 意图分类（规则优先）──

function classifyIntent(text: string): ClassifyResult {
  let t: string = text.trim();
  let tLower: string = t.toLowerCase();
  let empty: ClassifyResult = { intent: Intent.UNKNOWN, extras: {} };

  // 复习/进度/掌握 → get_review
  let reviewRegex: RegExp = /复习|温习|回顾|掌握|进度|学了|薄弱|知识库|今天学|推荐/;
  if (reviewRegex.test(tLower)) {
    let r: ClassifyResult = { intent: Intent.GET_REVIEW, extras: {} };
    return r;
  }

  // 摄入/记录/保存 → ingest_note
  let ingestRegex: RegExp = /记录|保存|记下|摘录|摄入|导入|剪藏|收藏/;
  if (ingestRegex.test(tLower)) {
    let r: ClassifyResult = { intent: Intent.INGEST_NOTE, extras: {} };
    return r;
  }

  // 提问/查询/解释/什么是 → ask_knowledge
  let askRegex: RegExp = /什么是|解释|为什么|怎么|如何|讲讲|介绍|查询|搜索|找/;
  if (askRegex.test(tLower)) {
    let r: ClassifyResult = { intent: Intent.ASK_KNOWLEDGE, extras: {} };
    return r;
  }

  // 默认 → ask_knowledge（大多数自然语言输入都是问答）
  return { intent: Intent.ASK_KNOWLEDGE, extras: {} };
}

// ── 占位技能处理器（队友实现具体逻辑）──

function handleIngestNote(text: string): string {
  // TODO: 实现文件解析 → 分块 → 向量化 → 知识点抽取
  return '📥 笔记摄入功能开发中。将支持：\n'
    + '• 文本/文件解析\n'
    + '• 自动分块与向量化\n'
    + '• 知识点抽取与关联\n'
    + '• 复习计划自动更新';
}

function handleAskKnowledge(text: string): string {
  // TODO: 实现检索 + LLM 生成回答
  return '🔍 知识问答功能开发中。将支持：\n'
    + '• 语义检索知识库\n'
    + '• 多轮对话上下文\n'
    + '• LLM 生成答案\n'
    + '• 相关概念推荐';
}

function handleGetReview(): string {
  // TODO: 实现学习模型驱动的复习推荐
  return '📚 主动复习功能开发中。将支持：\n'
    + '• SM-2 风格知识掌握建模\n'
    + '• 艾宾浩斯遗忘曲线调度\n'
    + '• Chips 推荐卡片\n'
    + '• 复习历史追踪\n'
    + '• 防骚扰推送（每日≤2次, 22:30-08:00免打扰）';
}

// ── 路由分发 ──

export async function route(req: A2ARequest): Promise<string[]> {
  let frames: string[] = [];
  let reqId: string = req.id;
  let params_contextId: string | undefined = req.params.contextId;
  let contextId: string = params_contextId !== undefined ? params_contextId : newContextId();
  let taskId: string = newTaskId();
  let text: string = extractText(req);

  // 处理控制类 method
  if (req.method === 'context/clear') {
    frames.push(buildStatusUpdate(reqId, contextId, taskId, TaskStatus.COMPLETED, '会话已清除'));
    return frames;
  }
  if (req.method === 'tasks/cancel') {
    frames.push(buildStatusUpdate(reqId, contextId, taskId, TaskStatus.CANCELED, '任务已取消'));
    return frames;
  }

  // 1. 任务已提交
  frames.push(buildTaskSubmitted(reqId, contextId, taskId));

  try {
    let cr: ClassifyResult = classifyIntent(text);
    let intent: Intent = cr.intent;

    let body: string = '';
    let workingMsg: string = '';

    if (intent === Intent.GET_REVIEW) {
      workingMsg = '正在分析你的学习情况…';
      body = handleGetReview();
    } else if (intent === Intent.INGEST_NOTE) {
      workingMsg = '正在处理你保存的内容…';
      body = handleIngestNote(text);
    } else {
      // ASK_KNOWLEDGE 或 UNKNOWN 兜底
      workingMsg = '正在检索知识库…';
      body = handleAskKnowledge(text);
    }

    frames.push(buildStatusUpdate(reqId, contextId, taskId, TaskStatus.WORKING, workingMsg));
    let part: A2APart = { kind: 'text', text: body };
    let artifact: string = buildArtifactUpdate(reqId, contextId, taskId, [part]);
    frames.push(artifact);

    // 完成
    frames.push(buildStatusUpdate(reqId, contextId, taskId, TaskStatus.COMPLETED));
  } catch (e) {
    console.error('SkillRouter fail: ' + e);
    frames.push(buildError(reqId, -32000, '处理请求时出错：' + e));
    frames.push(buildStatusUpdate(reqId, contextId, taskId, TaskStatus.FAILED, '处理失败：' + e));
  }

  return frames;
}
