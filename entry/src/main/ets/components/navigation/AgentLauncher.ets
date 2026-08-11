import { BlossomMark } from '../brand/BlossomMark'
import { LociTheme } from '../../theme/LociTheme'

@ComponentV2
export struct AgentLauncher {
  @Event onLaunch: () => void = (): void => {}

  build() {
    Button({ type: ButtonType.Circle, stateEffect: true }) {
      BlossomMark({
        markSize: 27,
        petalColor: LociTheme.TEXT_PRIMARY,
        centerColor: LociTheme.PEACH
      })
    }
    .width(LociTheme.AGENT_SIZE)
    .height(LociTheme.AGENT_SIZE)
    .padding(0)
    .backgroundColor(LociTheme.PEACH_SURFACE_STRONG)
    .backgroundBlurStyle(BlurStyle.Thin)
    .border({ width: 1, color: LociTheme.HAIRLINE_BRIGHT })
    .shadow({ radius: 21, color: LociTheme.SHADOW, offsetY: 9 })
    .animation({ duration: 180, curve: Curve.EaseOut })
    .onClick(() => {
      this.onLaunch()
    })
  }
}
