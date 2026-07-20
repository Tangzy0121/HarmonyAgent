// EntryAbility —— 应用主入口
// 负责初始化数据库、注册通知权限等
// 队友可以在这里加前端初始化逻辑

import { UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { initDatabase } from '../data/DatabaseHelper';

const TAG: string = 'EntryAbility';

export default class EntryAbility extends UIAbility {

  onCreate(want: Want, launchParam: object): void {
    hilog.info(0x0000, TAG, 'onCreate');
    // 初始化 SQLite 数据库
    try {
      initDatabase(this.context);
      hilog.info(0x0000, TAG, 'Database initialized');
    } catch (e) {
      hilog.error(0x0000, TAG, 'Database init failed: ' + e);
    }
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
