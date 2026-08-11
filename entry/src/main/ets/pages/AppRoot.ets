import { AgentLauncher } from '../components/navigation/AgentLauncher'
import { BottomNavigation } from '../components/navigation/BottomNavigation'
import { AppIdentityBar } from '../components/shell/AppIdentityBar'
import { TodayPage } from '../components/today/TodayPage'
import { AppDestination } from '../models/AppModels'
import { LociTheme } from '../theme/LociTheme'

@ComponentV2
export struct AppRoot {
  @Local private activeDestination: AppDestination = AppDestination.TODAY
  @Local private statusMessage: string = ''

  @Builder
  private placeholderPage(title: string, description: string) {
    Column({ space: 12 }) {
      Text(title)
        .fontSize(38)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTheme.TEXT_DARK)
        .letterSpacing(-1.1)
      Text(description)
        .fontSize(LociTheme.BODY_SIZE)
        .fontColor(LociTheme.TEXT_DARK_MUTED)
        .lineHeight(24)
        .constraintSize({ maxWidth: 290 })
    }
    .width('100%')
    .height('100%')
    .padding({ left: LociTheme.PAGE_SIDE, right: LociTheme.PAGE_SIDE, top: 128, bottom: 132 })
    .alignItems(HorizontalAlign.Start)
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Stack() {
        TodayPage({
          onContinue: (): void => {
            this.statusMessage = '学习流程将在 M2 接入'
          }
        })
          .visibility(this.activeDestination === AppDestination.TODAY ? Visibility.Visible : Visibility.Hidden)

        Column() {
          this.placeholderPage('学习', 'M1 保留导航状态；学习闭环将在 M2 接入。')
        }
        .visibility(this.activeDestination === AppDestination.LEARNING ? Visibility.Visible : Visibility.Hidden)

        Column() {
          this.placeholderPage('知识库', 'M1 保留导航状态；文件导入与知识地图将在后续里程碑接入。')
        }
        .visibility(this.activeDestination === AppDestination.LIBRARY ? Visibility.Visible : Visibility.Hidden)
      }
      .width('100%')
      .height('100%')

      Column() {
        AppIdentityBar()
        Blank()
      }
      .width('100%')
      .height('100%')
      .padding({ top: 18 })
      .hitTestBehavior(HitTestMode.None)

      if (this.statusMessage.length > 0) {
        Text(this.statusMessage)
          .fontSize(12)
          .fontColor(LociTheme.TEXT_PRIMARY)
          .padding({ left: 14, right: 14, top: 9, bottom: 9 })
          .backgroundColor(LociTheme.SMOKE_LOW_FALLBACK)
          .backgroundBlurStyle(BlurStyle.Thin)
          .borderRadius(18)
          .border({ width: 1, color: LociTheme.SMOKE_INNER_EDGE })
          .margin({ bottom: 98 })
      }

      Row({ space: 10 }) {
        BottomNavigation({
          activeDestination: this.activeDestination,
          onSelect: (destination: AppDestination): void => {
            this.activeDestination = destination
            this.statusMessage = ''
          }
        })
          .layoutWeight(1)
        AgentLauncher({
          onLaunch: (): void => {
            this.statusMessage = 'Agent 将在 M2 接入'
          }
        })
      }
      .width('100%')
      .padding({ left: 18, right: 18, bottom: 16 })
      .alignItems(VerticalAlign.Bottom)
    }
    .width('100%')
    .height('100%')
    .linearGradient({
      angle: 180,
      colors: [
        [LociTheme.CANVAS_TOP, 0.0],
        [LociTheme.CANVAS_MIDDLE, 0.52],
        [LociTheme.CANVAS_BOTTOM, 1.0]
      ]
    })
    .backgroundImage($r('app.media.loci_background'), ImageRepeat.NoRepeat)
    .backgroundImageSize(ImageSize.Cover)
    .backgroundImagePosition(Alignment.Center)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
