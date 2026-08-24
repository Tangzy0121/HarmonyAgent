# AgentExtensionAbility 开发参考

> 来源: HarmonyOS 官方开发指南 (Context7 MCP)
> 抓取日期: 2026-07-20

## 生命周期

```
onCreate → onConnect → (onAuth) → onData → ... → onDisconnect → onDestroy
```

## 完整实现

```typescript
import { common, AgentExtensionAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

export default class AgentExtAbility extends AgentExtensionAbility {
  private comProxy: common.AgentHostProxy | null = null;

  onCreate(want: Want) {
    hilog.info(0x0000, 'testTag', '%{public}s', 'Ability onCreate');
  }

  onConnect(want: Want, proxy: common.AgentHostProxy) {
    hilog.info(0x0000, 'testTag', '%{public}s', 'Ability onConnect');
    this.comProxy = proxy;
  }

  onDisconnect(want: Want, proxy: common.AgentHostProxy) {
    hilog.info(0x0000, 'testTag', '%{public}s', 'Ability onDisconnect');
    this.comProxy = null;
  }

  onData(proxy: common.AgentHostProxy, data: string) {
    hilog.info(0x0000, 'testTag', '%{public}s', 'Ability onData');
    try {
      let replyData = 'reply message';
      proxy.sendData(replyData);
    } catch (err) {
      let code = (err as BusinessError).code;
      let msg = (err as BusinessError).message;
      console.error(`sendData failed, err code: ${code}, err msg: ${msg}.`);
    }
  }

  onAuth(proxy: common.AgentHostProxy, handshakeData: string) {
    hilog.info(0x0000, 'testTag', '%{public}s', 'Ability onAuth');
    try {
      let authResult = 'auth success';
      proxy.authorize(authResult);
    } catch (err) {
      let code = (err as BusinessError).code;
      let msg = (err as BusinessError).message;
      console.error(`authorize failed, err code: ${code}, err msg: ${msg}.`);
    }
  }

  onDestroy() {
    hilog.info(0x0000, 'testTag', '%{public}s', 'Ability onDestroy');
  }
}
```

## agent_config.json 配置

```json
{
  "agentCards": [
    {
      "agentName": "MyAgent",
      "description": "A sample agent for demonstration purposes.",
      "icon": "resources/base/media/agent_icon.png",
      "actions": [
        {
          "name": "performAction",
          "description": "Performs a specific action.",
          "intent": "com.example.intent.PERFORM_ACTION"
        }
      ]
    }
  ],
  "provider": "com.example.agent.provider",
  "capabilities": ["capability1", "capability2"],
  "skills": [
    {
      "name": "skill1",
      "description": "Description of skill1"
    }
  ],
  "appInfo": {
    "appName": "MyApp",
    "version": "1.0"
  }
}
```

## module.json5 注册

```json
{
  "module": {
    "extensionAbilities": [
      {
        "name": "AgentExtAbility",
        "icon": "$media:icon",
        "description": "agent",
        "type": "agent",
        "exported": true,
        "srcEntry": "./ets/agentextability/AgentExtAbility.ets",
        "metadata": [
          {
            "name": "ohos.extension.agent",
            "resource": "$profile:agent_config"
          }
        ]
      }
    ]
  }
}
```

## A2A 协议概述

- **架构**: 客户端-服务端，基于A2A协议通过Agent管理服务进行通信
- **注册**: 开发者在 agent_config.json 中配置 AgentCard 进行能力注册
- **通信**: 系统应用连接目标 AgentExtensionAbility，通过标准化接口双向数据通信
- **认证**: 支持可选的双向安全认证 (onAuth)
- **UI**: 服务端可通过 AgentUIExtensionAbility 在客户端展示UI界面
- **生命周期**: 任务完成后断开连接
