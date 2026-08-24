// EntryAbility —— 应用主入口
// 负责初始化数据库、注册通知权限等
// 队友可以在这里加前端初始化逻辑

import { AbilityConstant, UIAbility, Want, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { initDatabase } from '../data/DatabaseHelper';
import {
  ReviewDeepLinkParameters,
  ReviewDeepLinkTarget,
  parseReviewDeepLink
} from '../review/ReviewDeepLink';
import { publishReviewDeepLink } from '../review/ReviewDeepLinkMailbox';

const TAG: string = 'EntryAbility';

export default class EntryAbility extends UIAbility {

  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
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
    this.handleReviewWant(want);
  }

  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, TAG, 'onNewWant');
    this.handleReviewWant(want);
  }

  private handleReviewWant(want: Want): void {
    if (want.parameters === undefined) return;
    const parameters: Record<string, Object> = want.parameters;
    const keys: Array<string> = Object.keys(parameters);
    if (keys.length !== 4) {
      publishReviewDeepLink(null);
      return;
    }
    for (let index: number = 0; index < keys.length; index++) {
      const key: string = keys[index];
      if (key !== 'bookId' && key !== 'chapterId' && key !== 'blockId' && key !== 'action') {
        publishReviewDeepLink(null);
        return;
      }
    }
    const bookValue: Object | undefined = parameters['bookId'];
    const chapterValue: Object | undefined = parameters['chapterId'];
    const blockValue: Object | undefined = parameters['blockId'];
    const actionValue: Object | undefined = parameters['action'];
    if (typeof bookValue !== 'string' || typeof chapterValue !== 'string' ||
      typeof blockValue !== 'string' || typeof actionValue !== 'string') {
      publishReviewDeepLink(null);
      return;
    }
    const parsed: ReviewDeepLinkTarget | null = parseReviewDeepLink(new ReviewDeepLinkParameters(
      bookValue as string, chapterValue as string, blockValue as string, actionValue as string));
    publishReviewDeepLink(parsed);
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
