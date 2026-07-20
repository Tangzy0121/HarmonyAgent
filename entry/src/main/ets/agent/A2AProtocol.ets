// A2A 协议层 —— JSON-RPC 2.0 消息解析 / 帧构造
// 基线：小艺开放平台端A2A V0.6（真机行为优先于文档）
// 从 CognitiveOS2 移植，适配 HarmonyAgent 个人知识管理场景
// ArkTS 严格模式 —— 所有 object literal 必须有显式类型

// ── 显式接口 ──

export interface A2APart {
  kind: string;
  text?: string;
  mimeType?: string;
}

export interface A2AMessage {
  parts: A2APart[];
}

export interface A2AParams {
  contextId?: string;
  taskId?: string;
  message?: A2AMessage;
}

export interface A2ARequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: A2AParams;
}

export interface A2AMetadata {
  traceId: string;
  agentId: string;
  agentVersion: string;
}

export interface A2ATaskPayload {
  contextId: string;
  taskId: string;
  status: string;
  metadata: A2AMetadata;
}

export interface A2AStatusMsg {
  parts: A2APart[];
}

export interface A2AStatusUpdatePayload {
  contextId: string;
  taskId: string;
  status: string;
  metadata: A2AMetadata;
  message?: A2AStatusMsg;
}

export interface A2AArtifactContainer {
  parts: A2APart[];
}

export interface A2AArtifactUpdatePayload {
  contextId: string;
  taskId: string;
  artifact: A2AArtifactContainer;
  metadata: A2AMetadata;
}

export interface A2AErrorPayload {
  code: number;
  message: string;
}

export enum TaskStatus {
  SUBMITTED = 'submitted',
  WORKING = 'working',
  INPUT_REQUIRED = 'input-required',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
  FAILED = 'failed'
}

// ── 常量 ──

const AGENT_ID: string = 'harmony-km-agent';
const AGENT_VERSION: string = '1.0.0';

// ── 工具函数 ──

function makeMetadata(): A2AMetadata {
  let m: A2AMetadata = {
    traceId: genTraceId(),
    agentId: AGENT_ID,
    agentVersion: AGENT_VERSION
  };
  return m;
}

function genTraceId(): string {
  let ts: number = Date.now();
  let rnd: number = Math.floor(Math.random() * 10000);
  return 'hkm-' + ts.toString() + '-' + rnd.toString();
}

function genId(prefix: string): string {
  let ts: number = Date.now();
  let rnd: number = Math.floor(Math.random() * 10000);
  return prefix + '-' + ts.toString() + '-' + rnd.toString();
}

// ── 帧响应专用 interface ──

interface TaskFrame { jsonrpc: string; id: string; result: TaskFrameResult; }
interface TaskFrameResult { task: A2ATaskPayload; }

interface StatusUpdateFrame { jsonrpc: string; id: string; result: StatusUpdateFrameResult; }
interface StatusUpdateFrameResult { statusUpdate: A2AStatusUpdatePayload; }

interface ArtifactUpdateFrame { jsonrpc: string; id: string; result: ArtifactUpdateFrameResult; }
interface ArtifactUpdateFrameResult { artifactUpdate: A2AArtifactUpdatePayload; }

interface ErrorFrame { jsonrpc: string; id: string; error: A2AErrorPayload; }

// ── 帧构造函数 ──

export function buildTaskSubmitted(reqId: string, contextId: string, taskId: string): string {
  let task: A2ATaskPayload = {
    contextId: contextId,
    taskId: taskId,
    status: TaskStatus.SUBMITTED,
    metadata: makeMetadata()
  };
  let frame: TaskFrame = {
    jsonrpc: '2.0',
    id: reqId,
    result: { task: task }
  };
  return JSON.stringify(frame);
}

export function buildStatusUpdate(
  reqId: string, contextId: string, taskId: string,
  status: TaskStatus, message?: string
): string {
  let st: A2AStatusUpdatePayload = {
    contextId: contextId,
    taskId: taskId,
    status: status,
    metadata: makeMetadata()
  };
  if (message !== undefined && message.length > 0) {
    let part: A2APart = { kind: 'text', text: message };
    st.message = { parts: [part] };
  }
  let frame: StatusUpdateFrame = {
    jsonrpc: '2.0',
    id: reqId,
    result: { statusUpdate: st }
  };
  return JSON.stringify(frame);
}

export function buildArtifactUpdate(
  reqId: string, contextId: string, taskId: string,
  parts: A2APart[]
): string {
  let au: A2AArtifactUpdatePayload = {
    contextId: contextId,
    taskId: taskId,
    artifact: { parts: parts },
    metadata: makeMetadata()
  };
  let frame: ArtifactUpdateFrame = {
    jsonrpc: '2.0',
    id: reqId,
    result: { artifactUpdate: au }
  };
  return JSON.stringify(frame);
}

export function buildError(reqId: string, code: number, message: string): string {
  let err: A2AErrorPayload = { code: code, message: message };
  let frame: ErrorFrame = { jsonrpc: '2.0', id: reqId, error: err };
  return JSON.stringify(frame);
}

// ── 请求解析 ──

export function parseRequest(data: string): A2ARequest | null {
  try {
    let obj: Object = JSON.parse(data) as Object;
    let rec: Record<string, Object> = obj as Record<string, Object>;
    let version: Object = rec['jsonrpc'];
    if (version === undefined || version !== '2.0') {
      return null;
    }
    return rec as Object as A2ARequest;
  } catch (e) {
    console.error('A2AProtocol parseRequest fail: ' + e);
    return null;
  }
}

// 从请求中提取用户文本（拼接所有 text parts）
export function extractText(req: A2ARequest): string {
  let params: A2AParams = req.params;
  let msg: A2AMessage | undefined = params.message;
  if (msg === undefined) {
    return '';
  }
  let parts: A2APart[] = msg.parts;
  let texts: string[] = [];
  for (let i: number = 0; i < parts.length; i++) {
    let p: A2APart = parts[i];
    if (p.kind === 'text' && p.text !== undefined) {
      texts.push(p.text);
    }
  }
  return texts.join('\n');
}

// ── ID 生成（导出供 SkillRouter 用）──

export function newContextId(): string { return genId('hkm-ctx'); }
export function newTaskId(): string { return genId('hkm-task'); }
