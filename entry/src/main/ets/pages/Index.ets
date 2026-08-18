import { AppRoot } from './AppRoot'

@Entry
@ComponentV2
struct Index {
  build() {
    Stack() {
      AppRoot()
    }
    .width('100%')
    .height('100%')
  }
}
