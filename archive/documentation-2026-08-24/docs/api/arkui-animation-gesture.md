# ArkUI 手势与动画参考

> 来源: HarmonyOS 官方开发指南 (Context7 MCP)
> 抓取日期: 2026-07-20

## 属性动画 (animateTo)

```typescript
import { curves } from '@kit.ArkUI';

@Entry
@Component
struct AnimateDemo {
  @State rotateValue: number = 0;
  @State opacityValue: number = 1;
  @State translateX: number = 0;
  @State animate: boolean = false;

  build() {
    Row() {
      Column()
        .rotate({ angle: this.rotateValue })
        .backgroundColor('#317AF7')
        .width(100).height(100)
        .borderRadius(30)
        .onClick(() => {
          this.getUIContext()?.animateTo({ curve: curves.springMotion() }, () => {
            this.animate = !this.animate;
            this.rotateValue = this.animate ? 90 : 0;
            this.opacityValue = this.animate ? 0.6 : 1;
            this.translateX = this.animate ? 50 : 0;
          });
        });

      Column()
        .width(100).height(100)
        .backgroundColor('#D94838')
        .borderRadius(30)
        .opacity(this.opacityValue)
        .translate({ x: this.translateX });
    }
  }
}
```

## 捏合手势 (PinchGesture)

```typescript
@State scaleValue: number = 1;
@State pinchValue: number = 1;

Column()
  .scale({ x: this.scaleValue, y: this.scaleValue, z: 1 })
  .gesture(
    PinchGesture({ fingers: 3 })
      .onActionStart((event: GestureEvent | undefined) => {
        console.info('Pinch start');
      })
      .onActionUpdate((event: GestureEvent | undefined) => {
        if (event) {
          this.scaleValue = this.pinchValue * event.scale;
        }
      })
      .onActionEnd(() => {
        this.pinchValue = this.scaleValue;
        console.info('Pinch end');
      })
  )
```

## 平移手势 (PanGesture)

```typescript
@State cardOffset: number = 0;
@State lastCardOffset: number = 0;
@State startTime: number = 0;

.gesture(
  GestureGroup(GestureMode.Parallel,
    PanGesture({ direction: PanDirection.Horizontal, distance: 5 })
      .onActionStart((event: GestureEvent | undefined) => {
        if (event) { this.startTime = event.timestamp; }
      })
      .onActionUpdate((event: GestureEvent | undefined) => {
        if (event) { this.cardOffset = this.lastCardOffset + event.offsetX; }
      })
      .onActionEnd((event: GestureEvent | undefined) => {
        // 处理惯性 + 边界回弹
        // 记录本次偏移量
        this.lastCardOffset = this.cardOffset;
      })
  ), GestureMask.IgnoreInternal
)
```

## 常用曲线

```typescript
import { curves } from '@kit.ArkUI';

// 弹簧曲线（推荐）
curves.springMotion()
// 传统曲线
Curve.Linear
Curve.Ease
Curve.EaseIn
Curve.EaseOut
Curve.EaseInOut
Curve.FastOutSlowIn
Curve.Smooth
```
