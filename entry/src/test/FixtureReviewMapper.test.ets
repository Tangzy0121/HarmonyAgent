import { describe, expect, it } from '@ohos/hypium'
import {
  LociChapter,
  LociConcept,
  LociLearningBlock,
  LociProjectSummary,
  LociSourceAnchor
} from '../main/ets/models/LociModels'
import { createFixtureReviewItem } from '../main/ets/review/FixtureReviewMapper'

export default function fixtureReviewMapperTest(): void {
  describe('FixtureReviewMapper', () => {
    it('reuses_the_matching_quiz_and_source_anchor', 0, () => {
      const concept: LociConcept = {
        id: 'concept-1',
        label: '经验风险',
        definition: '样本损失的平均值',
        state: 'review',
        chapterIds: ['chapter-1'],
        sourceIds: ['anchor-1']
      } as LociConcept
      const quiz: LociLearningBlock = {
        id: 'quiz-1',
        type: 'quiz',
        title: '小测',
        conceptId: 'concept-1',
        question: '经验风险是什么？',
        options: [{ id: 'a', label: '样本损失的平均值' }],
        correctOptionId: 'a',
        explanation: '它由训练样本估计。',
        sourceIds: ['anchor-1']
      } as LociLearningBlock
      const chapter: LociChapter = {
        id: 'chapter-1',
        order: 0,
        title: '基础',
        estimatedMinutes: 10,
        taskState: 'ready',
        read: true,
        blocks: [quiz]
      } as LociChapter
      const anchor: LociSourceAnchor = {
        id: 'anchor-1',
        documentId: 'source-1',
        location: '第 3 页',
        excerpt: '经验风险是样本损失的平均值。',
        precision: 'exact'
      } as LociSourceAnchor
      const project: LociProjectSummary = {
        id: 'book-1',
        title: '监督学习',
        goal: '理解核心概念',
        level: '入门',
        depth: '标准',
        source: { id: 'source-1', name: 'ml.pdf', format: 'PDF', size: '1 MB' },
        status: 'active',
        lastStudiedLabel: '今天',
        chapters: [chapter],
        concepts: [concept],
        anchors: [anchor]
      } as LociProjectSummary

      const item = createFixtureReviewItem(project, concept)

      expect(item.key).assertEqual('concept-1')
      expect(item.quiz?.question).assertEqual('经验风险是什么？')
      expect(item.quiz?.correctOptionId).assertEqual('a')
      expect(item.anchorId).assertEqual('anchor-1')
    })
  })
}
