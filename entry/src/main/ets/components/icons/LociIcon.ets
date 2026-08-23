export enum LociIconName {
  TODAY = 'today',
  LEARNING = 'learning',
  LIBRARY = 'library',
  DOCUMENT = 'document'
}
@ComponentV2
export struct LociIcon {
  @Param name: LociIconName = LociIconName.TODAY
  @Param iconSize: number = 20
  @Param color: string = '#28252A'
  @Param strokeWidth: number = 1.6

  @Builder
  private todayIcon() {
    Stack() {
      Circle().width(this.iconSize * 0.68).height(this.iconSize * 0.68).fill(Color.Transparent)
        .stroke(this.color).strokeWidth(this.strokeWidth)
      Circle().width(this.iconSize * 0.18).height(this.iconSize * 0.18).fill(this.color)
        .translate({ x: this.iconSize * 0.24, y: -this.iconSize * 0.24 })
    }
  }

  @Builder
  private learningIcon() {
    Stack() {
      Rect().width(this.iconSize * 0.56).height(this.iconSize * 0.56).radius(2)
        .fill(Color.Transparent).stroke(this.color).strokeWidth(this.strokeWidth).rotate({ angle: 45 })
      Circle().width(this.iconSize * 0.16).height(this.iconSize * 0.16).fill(this.color)
    }
  }

  @Builder
  private libraryIcon() {
    Stack() {
      Rect().width(this.iconSize * 0.70).height(this.iconSize * 0.74).radius(2)
        .fill(Color.Transparent).stroke(this.color).strokeWidth(this.strokeWidth)
      Line().width(this.iconSize * 0.44).height(1).startPoint([0, 0])
        .endPoint([this.iconSize * 0.44, 0]).stroke(this.color).strokeWidth(this.strokeWidth)
        .translate({ y: -this.iconSize * 0.15 })
      Line().width(this.iconSize * 0.44).height(1).startPoint([0, 0])
        .endPoint([this.iconSize * 0.44, 0]).stroke(this.color).strokeWidth(this.strokeWidth)
        .translate({ y: this.iconSize * 0.12 })
    }
  }

  @Builder
  private documentIcon() {
    Path({ width: 24, height: 24, commands: 'M6 3.5h8l4 4v13H6z M14 3.5v4h4 M9 12h6 M9 16h6' })
      .fill(Color.Transparent).stroke(this.color).strokeWidth(this.strokeWidth)
      .scale({ x: this.iconSize / 24, y: this.iconSize / 24 })
  }

  build() {
    Stack() {
      if (this.name === LociIconName.TODAY) {
        this.todayIcon()
      } else if (this.name === LociIconName.LEARNING) {
        this.learningIcon()
      } else if (this.name === LociIconName.LIBRARY) {
        this.libraryIcon()
      } else {
        this.documentIcon()
      }
    }
    .width(this.iconSize)
    .height(this.iconSize)
  }
}
