// Index —— 应用首页（占位，队友写前端）
//
// 队友接手指南：
//   1. 这是 App 启动后的首页，对应 module.json5 的 mainElement
//   2. ArkUI 声明式范式：@Entry + @Component struct
//   3. 状态用 @State，导航用 router.pushUrl()
//   4. Agent 通信已由 AgentExtAbility 接管，这里做 UI 即可
//   5. 参考 docs/api/ 下的 API 文档

@Entry
@Component
struct Index {
  @State message: string = 'HarmonyAgent';

  build() {
    Column() {
      Row() {
        Text(this.message)
          .fontSize(50)
          .fontWeight(FontWeight.Bold)
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
  }
}
