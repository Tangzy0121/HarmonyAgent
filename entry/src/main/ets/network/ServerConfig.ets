export enum DataMode {
  FIXTURE = 'fixture',
  HTTP = 'http'
}

export class ServerConfig {
  // 真机调试时改为可访问的 HTTPS 地址；本机 HTTP 仅供受控调试环境使用。
  static readonly BASE_URL: string = 'http://127.0.0.1:3456'
  static readonly DATA_MODE: DataMode = DataMode.FIXTURE
  static readonly TIMEOUT_MS: number = 30000
}
