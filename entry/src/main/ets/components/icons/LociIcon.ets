export enum LociIconName {
  TODAY = 'today',
  LEARNING = 'learning',
  LIBRARY = 'library',
  DOCUMENT = 'document',
  ARROW = 'arrow',
  CLOCK = 'clock',
  LINK = 'link',
  CHEVRON_DOWN = 'chevron-down'
}

/**
 * Small native monochrome icons. Geometry is intentionally simple so the same
 * visual language remains crisp across HarmonyOS densities without glyph or
 * emoji fallback differences.
 */
@ComponentV2
export struct LociIcon {
  @Param name: LociIconName = LociIconName.TODAY
  @Param iconSize: number = 20
  @Param color: string = '#28252A'
  @Param strokeWidth: number = 1.6

  @Builder
  private todayIcon() {
    Stack() {
      Circle()
        .width(this.iconSize * 0.68)
        .height(this.iconSize * 0.68)
        .fill(Color.Transparent)
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
      Circle()
        .width(this.iconSize * 0.18)
        .height(this.iconSize * 0.18)
        .fill(this.color)
        .translate({ x: this.iconSize * 0.24, y: -this.iconSize * 0.24 })
    }
  }

  @Builder
  private learningIcon() {
    Stack() {
      Rect()
        .width(this.iconSize * 0.56)
        .height(this.iconSize * 0.56)
        .radius(2)
        .fill(Color.Transparent)
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
        .rotate({ angle: 45 })
      Circle()
        .width(this.iconSize * 0.16)
        .height(this.iconSize * 0.16)
        .fill(this.color)
    }
  }

  @Builder
  private libraryIcon() {
    Stack() {
      Rect()
        .width(this.iconSize * 0.70)
        .height(this.iconSize * 0.74)
        .radius(2)
        .fill(Color.Transparent)
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
      Line()
        .width(this.iconSize * 0.44)
        .height(1)
        .startPoint([0, 0])
        .endPoint([this.iconSize * 0.44, 0])
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
        .translate({ y: -this.iconSize * 0.15 })
      Line()
        .width(this.iconSize * 0.44)
        .height(1)
        .startPoint([0, 0])
        .endPoint([this.iconSize * 0.44, 0])
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
        .translate({ y: this.iconSize * 0.12 })
    }
  }

  @Builder
  private documentIcon() {
    Path({
      width: 24,
      height: 24,
      commands: 'M6 3.5h8l4 4v13H6z M14 3.5v4h4 M9 12h6 M9 16h6'
    })
      .fill(Color.Transparent)
      .stroke(this.color)
      .strokeWidth(this.strokeWidth)
      .scale({ x: this.iconSize / 24, y: this.iconSize / 24 })
  }

  @Builder
  private arrowIcon() {
    Path({ width: 24, height: 24, commands: 'M5 12h14 M14 7l5 5-5 5' })
      .fill(Color.Transparent)
      .stroke(this.color)
      .strokeWidth(this.strokeWidth)
      .scale({ x: this.iconSize / 24, y: this.iconSize / 24 })
  }

  @Builder
  private clockIcon() {
    Path({ width: 24, height: 24, commands: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17 M12 7.5V12l3.2 2' })
      .fill(Color.Transparent)
      .stroke(this.color)
      .strokeWidth(this.strokeWidth)
      .scale({ x: this.iconSize / 24, y: this.iconSize / 24 })
  }

  @Builder
  private linkIcon() {
    Path({
      width: 24,
      height: 24,
      commands: 'M10.5 13.5 13.5 10 M8.4 16.6 6.8 18.2a3.5 3.5 0 0 1-5-5l3.4-3.4a3.5 3.5 0 0 1 5 0 M15.6 7.4l1.6-1.6a3.5 3.5 0 1 1 5 5l-3.4 3.4a3.5 3.5 0 0 1-5 0'
    })
      .fill(Color.Transparent)
      .stroke(this.color)
      .strokeWidth(this.strokeWidth)
      .scale({ x: this.iconSize / 24, y: this.iconSize / 24 })
  }

  @Builder
  private chevronIcon() {
    Stack() {
      Line()
        .width(this.iconSize * 0.28)
        .height(this.iconSize * 0.20)
        .startPoint([0, 0])
        .endPoint([this.iconSize * 0.28, this.iconSize * 0.20])
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
        .translate({ x: -this.iconSize * 0.12 })
      Line()
        .width(this.iconSize * 0.28)
        .height(this.iconSize * 0.20)
        .startPoint([0, this.iconSize * 0.20])
        .endPoint([this.iconSize * 0.28, 0])
        .stroke(this.color)
        .strokeWidth(this.strokeWidth)
        .translate({ x: this.iconSize * 0.12 })
    }
  }

  build() {
    Stack() {
      if (this.name === LociIconName.TODAY) {
        this.todayIcon()
      } else if (this.name === LociIconName.LEARNING) {
        this.learningIcon()
      } else if (this.name === LociIconName.LIBRARY) {
        this.libraryIcon()
      } else if (this.name === LociIconName.DOCUMENT) {
        this.documentIcon()
      } else if (this.name === LociIconName.ARROW) {
        this.arrowIcon()
      } else if (this.name === LociIconName.CLOCK) {
        this.clockIcon()
      } else if (this.name === LociIconName.LINK) {
        this.linkIcon()
      } else {
        this.chevronIcon()
      }
    }
    .width(this.iconSize)
    .height(this.iconSize)
  }
}
