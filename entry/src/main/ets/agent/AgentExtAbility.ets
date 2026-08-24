// AgentExtensionAbility —— 端A2A 通信实现类
// 生命周期：onCreate → onConnect → (onAuth) → onData → onDisconnect → onDestroy
// 协议基线：小艺开放平台端A2A V0.6 | SDK since API 24
// 对齐官方文档: developer.huawei.com/consumer/cn/doc/harmonyos-guides/agent-extension-ability

import { common, AgentExtensionAbility, Want } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { parseRequest, A2ARequest, buildError } from './A2AProtocol';
import { route } from './SkillRouter';

const TAG: string = 'HarmonyAgent';

export default class AgentExtAbility extends AgentExtensionAbility {
  private comProxy: common.AgentHostProxy | null = null;

  private sendDataSafely(proxy: common.AgentHostProxy, data: string): void {
    try {
      proxy.sendData(data);
    } catch (err) {
      console.error(TAG + ' sendData failed: ' + (err as BusinessError).message);
    }
  }

  onCreate(want: Want): void {
    console.info(TAG + ' onCreate');
  }

  onConnect(want: Want, proxy: common.AgentHostProxy): void {
    console.info(TAG + ' onConnect');
    this.comProxy = proxy;
  }

  onDisconnect(want: Want, proxy: common.AgentHostProxy): void {
    console.info(TAG + ' onDisconnect');
    this.comProxy = null;
  }

  onAuth(proxy: common.AgentHostProxy, handshakeData: string): void {
    // V1 跳过安全认证
    console.info(TAG + ' onAuth (skipped in V1)');
  }

  onData(proxy: common.AgentHostProxy, data: string): void {
    console.info(TAG + ' onData received: ' + data.substring(0, 200));

    let req: A2ARequest | null = parseRequest(data);
    if (req === null) {
      this.sendDataSafely(proxy, buildError('', -32600, 'Invalid JSON-RPC 2.0 request'));
      return;
    }

    // onData 签名是 void（非 async），用 then/catch 处理异步
    route(req).then((frames: string[]) => {
      for (let i: number = 0; i < frames.length; i++) {
        this.sendDataSafely(proxy, frames[i]);
      }
    }).catch((e: Error) => {
      console.error(TAG + ' handler error: ' + e.message);
    });
  }

  onDestroy(): void {
    console.info(TAG + ' onDestroy');
  }
}
