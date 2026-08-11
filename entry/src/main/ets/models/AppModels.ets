export enum AppDestination {
  TODAY = 'today',
  LEARNING = 'learning',
  LIBRARY = 'library'
}

export class TodayFocusItem {
  label: string
  status: string
  title: string
  summary: string
  tags: Array<string>
  source: string
  position: string
  actionLabel: string

  constructor(label: string, status: string, title: string, summary: string,
    tags: Array<string>, source: string, position: string, actionLabel: string) {
    this.label = label
    this.status = status
    this.title = title
    this.summary = summary
    this.tags = tags
    this.source = source
    this.position = position
    this.actionLabel = actionLabel
  }
}

export class TodayActionItem {
  id: string
  eyebrow: string
  title: string
  meta: string
  icon: string

  constructor(id: string, eyebrow: string, title: string, meta: string, icon: string) {
    this.id = id
    this.eyebrow = eyebrow
    this.title = title
    this.meta = meta
    this.icon = icon
  }
}
