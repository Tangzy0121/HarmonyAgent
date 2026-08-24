# 服务推送通知 API 参考

> 来源: HarmonyOS API Reference (Context7 MCP)
> 抓取日期: 2026-07-20

## serviceNotification (PushKit)

### requestSubscribeNotification (Promise)

```typescript
import { serviceNotification } from '@kit.PushKit';
import { BusinessError } from '@kit.BasicServicesKit';

const entityIds = ['entityId1', 'entityId2', 'entityId3'];
let type: serviceNotification.SubscribeNotificationType =
  serviceNotification.SubscribeNotificationType.SUBSCRIBE_WITH_HUAWEI_ID;

serviceNotification.requestSubscribeNotification(this.context, entityIds, type)
  .then((data) => {
    console.log('Subscription request succeeded:', JSON.stringify(data.entityResult));
  })
  .catch((err: BusinessError) => {
    console.error('Subscription request failed:', err.code, err.message);
  });
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| context | Context (UIAbilityContext) | 是 | 请求订阅上下文 |
| entityIds | Array\<string\> | 是 | 消息模板ID列表，最多3个 |
| type | SubscribeNotificationType | 否 | 订阅类型，默认 SUBSCRIBE_WITH_TOKEN |

### 常见错误码

| 错误码 | 含义 |
|--------|------|
| 1000900008 | 连接推送服务失败 |
| 1000900009 | 推送服务内部错误 |
| 1000900010 | 非法应用身份 |
| 1000900011 | 网络不可用 |
| 1000900017 | 设备不支持当前操作 |
| 1000900018 | 调用次数超过限制 |
| 1000900022 | 通知开关关闭 |
| 1000900030 | 用户未登录华为ID |

---

## @ohos.notificationManager (通知管理)

用于通知的发布、取消等管理操作。

## @ohos.reminderAgentManager (后台代理提醒)

用于后台定时提醒，不同于推送通知。后台任务场景适用。

---

## 通知策略选择 (HarmonyAgent 用)

根据技术实施计划 (2026-07-18)：
- **主动复习提醒**: 使用 `reminderAgentManager` (本地定时提醒，不依赖推送服务)
- **知识推送**: 使用 `notificationManager` 本地通知
- 防骚扰规则: 每日最多2次, 4小时间隔, 22:30-08:00 免打扰
