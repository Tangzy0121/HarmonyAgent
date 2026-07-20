// AgentExtensionAbility —— 端A2A 通信实现类
// 生命周期：onCreate → onConnect → (onAuth) → onData → onDisconnect → onDestroy
// 协议基线：小艺开放平台端A2A V0.6 | SDK since API 24
// 从 CognitiveOS2 移植，适配 HarmonyAgent 个人知识管理场景

import { AgentExtensionAbility, Want } from '@kit.AbilityKit';
import { parseRequest, A2ARequest, buildError } from './A2AProtocol';
import { route } from './SkillRouter';

const TAG: string = 'HarmonyAgent';

export default class AgentExtAbility extends AgentExtensionAbility {

  onCreate(want: Want): void {
    console.info(TAG + ' onCreate');
  }

  onConnect(want: Want, proxy: object): void {
    console.info(TAG + ' onConnect');
  }

  onAuth(proxy: object, handshakeData: string): void {
    // V1 跳过安全认证
    console.info(TAG + ' onAuth (skipped in V1)');
  }

  onData(proxy: object, data: string): void {
    console.info(TAG + ' onData received: ' + data.substring(0, 200));

    let req: A2ARequest | null = parseRequest(data);
    if (req === null) {
      let p: Record<string, Function> = proxy as Record<string, Function>;
      p['sendData'](buildError('', -32600, '无效的 JSON-RPC 2.0 请求'));
      return;
    }

    // onData 签名是 void（非 async），用 then/catch 处理异步
    route(req).then((frames: string[]) => {
      let p: Record<string, Function> = proxy as Record<string, Function>;
      for (let i: number = 0; i < frames.length; i++) {
        p['sendData'](frames[i]);
        console.info(TAG + ' sendData: ' + frames[i].substring(0, 120));
      }
    }).catch((e: Error) => {
      console.error(TAG + ' handler error: ' + e.message);
    });
  }

  onDisconnect(want: Want, proxy: object): void {
    console.info(TAG + ' onDisconnect');
  }

  onDestroy(): void {
    console.info(TAG + ' onDestroy');
  }
}
