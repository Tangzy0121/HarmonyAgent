// EntryAbility —— 应用主入口
// 负责初始化数据库、注册通知权限等
// 队友可以在这里加前端初始化逻辑

import { UIAbility, Want, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { initDatabase } from '../data/DatabaseHelper';

const TAG: string = 'EntryAbility';

export default class EntryAbility extends UIAbility {

  onCreate(want: Want, launchParam: object): void {
    hilog.info(0x0000, TAG, 'onCreate');
    // 跟随系统暗色模式
    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    } catch (err) {
      hilog.warn(0x0000, TAG, 'Failed to follow system color mode: ' + (err as BusinessError).message);
    }
    // 异步初始化 SQLite 数据库（不阻塞 UI 线程）
    initDatabase(this.context).then(() => {
      hilog.info(0x0000, TAG, 'Database initialized');
    }).catch((e: Error) => {
      hilog.error(0x0000, TAG, 'Database init failed: ' + e.message);
    });
  }

  onDestroy(): void {
    hilog.info(0x0000, TAG, 'onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, TAG, 'onWindowStageCreate');
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, TAG, 'Failed to load content: ' + JSON.stringify(err));
        return;
      }
      hilog.info(0x0000, TAG, 'Content loaded');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(0x0000, TAG, 'onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(0x0000, TAG, 'onForeground');
  }

  onBackground(): void {
    hilog.info(0x0000, TAG, 'onBackground');
  }
}
