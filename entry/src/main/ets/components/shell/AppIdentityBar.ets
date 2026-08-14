import { LociTheme } from '../../theme/LociTheme'
import { BlossomMark } from '../brand/BlossomMark'

@ComponentV2
export struct AppIdentityBar {
  build() {
    Row() {
      Row({ space: 9 }) {
        BlossomMark({ markSize: 18, petalColor: LociTheme.TEXT_PRIMARY, centerColor: LociTheme.PEACH })
        Text('loci').fontSize(16).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_PRIMARY)
      }
      Blank()
      Text('互动学习书').fontSize(11).fontColor(LociTheme.TEXT_PRIMARY)
        .padding({ left: 14, right: 14, top: 10, bottom: 10 })
        .backgroundColor(LociTheme.SMOKE_PROFILE).borderRadius(22)
        .border({ width: 1, color: LociTheme.SMOKE_INNER_EDGE })
    }
    .width('100%').height(44).padding({ left: LociTheme.PAGE_SIDE, right: LociTheme.PAGE_SIDE })
  }
}
