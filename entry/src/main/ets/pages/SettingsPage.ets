/**
 * 一级设置页。原型态偏好只在页面生命周期内生效,离开页面后恢复默认值。
 * 控件只使用黑白灰;开关通过滑块位置与明度共同表达状态。
 */
import { LociTokens } from '../theme/LociTokens'

@ComponentV2
export struct SettingsPage {
  @Local private learningMode: string = '系统学习'
  @Local private reviewReminder: boolean = true
  @Local private sourceHints: boolean = true

  private nextLearningMode(): void {
    if (this.learningMode === '快速浏览') {
      this.learningMode = '系统学习'
    } else if (this.learningMode === '系统学习') {
      this.learningMode = '深度研读'
    } else {
      this.learningMode = '快速浏览'
    }
  }

  @Builder
  private switchControl(checked: boolean, label: string, onToggle: () => void) {
    Row() {
      if (!checked) {
        Circle().width(16).height(16).fill(LociTokens.INK_MUTED)
      }
      Blank()
      if (checked) {
        Circle().width(16).height(16).fill(LociTokens.SCREEN)
      }
    }
    .width(46)
    .height(26)
    .padding(4)
    .border({ width: 1, color: checked ? LociTokens.INK : LociTokens.LINE_STRONG })
    .borderRadius(13)
    .backgroundColor(checked ? LociTokens.INK : Color.Transparent)
    .accessibilityText(label)
    .accessibilityDescription(checked ? '已开启' : '已关闭')
    .accessibilityRole(AccessibilityRoleType.SWITCH)
    .onClick(onToggle)
  }

  @Builder
  private preferenceCopy(title: string, detail: string) {
    Column({ space: 6 }) {
      Text(title)
        .fontSize(LociTokens.FONT_SMALL)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
      Text(detail)
        .fontSize(LociTokens.FONT_CAPTION)
        .fontColor(LociTokens.INK_MUTED)
        .lineHeight(16)
    }
    .alignItems(HorizontalAlign.Start)
    .layoutWeight(1)
  }

  build() {
    Scroll() {
      Column() {
        Text('偏好')
          .fontSize(LociTokens.FONT_LABEL)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text('设置')
          .fontSize(LociTokens.FONT_DISPLAY)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .letterSpacing(-2)
          .width('100%')
          .margin({ top: 12 })
        Text('调整默认学习方式与阅读提醒。所有选项仅作用于这个原型。')
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK_SOFT)
          .lineHeight(21)
          .width('100%')
          .margin({ top: 18 })

        Text('学习')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
          .margin({ top: 60 })
        Text('默认方式')
          .fontSize(LociTokens.FONT_SECTION)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .letterSpacing(-1)
          .width('100%')
          .margin({ top: 8, bottom: 18 })

        Row({ space: 10 }) {
          this.preferenceCopy('学习深度', '新项目会优先使用这项设置')
          Text(this.learningMode)
            .fontSize(LociTokens.FONT_LABEL)
            .fontColor(LociTokens.INK_SOFT)
          Text('›')
            .fontSize(LociTokens.FONT_SUBTITLE)
            .fontColor(LociTokens.INK)
        }
        .width('100%')
        .height(82)
        .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })
        .accessibilityText(`学习深度,${this.learningMode}`)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.nextLearningMode())

        Row({ space: 10 }) {
          this.preferenceCopy('每日复习提醒', '到期复习时显示一次提醒')
          this.switchControl(this.reviewReminder, '每日复习提醒', (): void => {
            this.reviewReminder = !this.reviewReminder
          })
        }
        .width('100%')
        .height(82)
        .border({ width: { bottom: 1 }, color: LociTokens.LINE })

        Row({ space: 10 }) {
          this.preferenceCopy('来源提示', '在解释与判断旁保留资料定位')
          this.switchControl(this.sourceHints, '来源提示', (): void => {
            this.sourceHints = !this.sourceHints
          })
        }
        .width('100%')
        .height(82)
        .border({ width: { bottom: 1 }, color: LociTokens.LINE })

        Text('设置仅用于本次页面演示，离开页面或刷新后会恢复默认值。')
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .lineHeight(17)
          .width('100%')
          .margin({ top: 32 })
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 118, bottom: 100 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
    .scrollBar(BarState.Off)
  }
}
