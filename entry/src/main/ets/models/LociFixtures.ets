/** Fixture 文件的根数据结构。正式页面模型位于 LociModels.ets。 */
import { LociProjectSummary, LociRecommendation } from './LociModels'

export interface LociFixtureData {
  projects: LociProjectSummary[]
  recommendations: LociRecommendation[]
}
