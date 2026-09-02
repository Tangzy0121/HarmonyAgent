/**
 * server 连接配置(M5a)。
 * BASE_URL 默认指向局域网地址:真机调试需与电脑连同一 Wi-Fi,并把 IP 改成本机局域网 IP;
 * 本机模拟器可改回 http://127.0.0.1:3456。本机 HTTP 仅供受控调试环境使用。
 * DATA_MODE:SERVER 只走 server(失败即错误页);FIXTURE 只走 rawfile fixture;
 * AUTO 先 health 探活(短超时),失败回退 fixture 并打 degraded 标记。
 */
export enum DataMode {
  FIXTURE = 'FIXTURE',
  SERVER = 'SERVER',
  AUTO = 'AUTO'
}

export class ServerConfig {
  static readonly BASE_URL: string = 'http://10.68.121.228:3456'
  static readonly DATA_MODE: DataMode = DataMode.AUTO
  static readonly TIMEOUT_MS: number = 30000
  /** M5b 上传超时:20MB raw body 放宽。 */
  static readonly UPLOAD_TIMEOUT_MS: number = 120000
  /** AUTO 探活超时:必须短,避免断网时今日页长时间转圈。 */
  static readonly HEALTH_TIMEOUT_MS: number = 3000
  /** M5c 章节生成读超时:上游整段生成最长 180s(server CHAPTER_UPSTREAM_TIMEOUT_MS),放宽到 240s。 */
  static readonly GENERATE_TIMEOUT_MS: number = 240000
  /** M5e agentTurns SSE 读超时:订阅上限 120s(server subscriptionMaxMs)+ 15s 心跳保活,放宽到 130s。 */
  static readonly AGENT_STREAM_TIMEOUT_MS: number = 130000
}
