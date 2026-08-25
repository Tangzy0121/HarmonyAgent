/**
 * LociAppState(@ObservedV2):M1 全局数据状态。
 * 真源:plan.md「LociAppState:加载 lociFixtures.json,提供 projects/recommendations」。
 * 从 resources/rawfile/lociFixtures.json 同步读取并解析,供今日页/学习库消费。
 */
import { util } from '@kit.ArkTS'
import { common } from '@kit.AbilityKit'
import { LociFixtureData, LociProjectSummary, LociRecommendation } from './LociFixtures'

export type LociLoadPhase = 'loading' | 'ready' | 'error'

@ObservedV2
export class LociAppState {
  @Trace phase: LociLoadPhase = 'loading'
  @Trace errorMessage: string = ''
  @Trace projects: LociProjectSummary[] = []
  @Trace recommendations: LociRecommendation[] = []

  load(context: common.UIAbilityContext): void {
    try {
      const bytes: Uint8Array = context.resourceManager.getRawFileContentSync('lociFixtures.json')
      const text: string = util.TextDecoder.create('utf-8').decodeToString(bytes)
      const data: LociFixtureData = JSON.parse(text) as LociFixtureData
      this.projects = data.projects ?? []
      this.recommendations = data.recommendations ?? []
      this.errorMessage = ''
      this.phase = 'ready'
    } catch (error) {
      this.phase = 'error'
      this.errorMessage = error instanceof Error ? error.message : 'lociFixtures.json 读取失败'
    }
  }

  /** confirm_plan 落地:已有项目原位更新,新项目插到最前(按最近学习时间)。 */
  upsertProject(project: LociProjectSummary): void {
    const index: number = this.projects.findIndex((entry: LociProjectSummary): boolean =>
      entry.id === project.id)
    if (index >= 0) {
      const next: LociProjectSummary[] = this.projects.slice()
      next[index] = project
      this.projects = next
    } else {
      this.projects = [project, ...this.projects]
    }
  }
}
