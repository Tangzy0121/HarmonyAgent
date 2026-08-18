import { describe, expect, it } from '@ohos/hypium'
import { FixtureLearningRepository } from '../main/ets/learning/FixtureLearningRepository'
import { FeynmanSubmission } from '../main/ets/learning/LearningModels'
import { LearningSession } from '../main/ets/learning/LearningSession'
import { FEYNMAN_RAW_LIMIT } from '../main/ets/components/learning/FeynmanPanelState'

class FailingFeynmanRepository extends FixtureLearningRepository {
  submitFeynman(_bookId: string, _chapterId: string,
    _explanation: string): Promise<FeynmanSubmission> {
    return Promise.reject(new Error('feynman_unavailable'))
  }
}

class CountingFeynmanRepository extends FixtureLearningRepository {
  calls: number = 0
  lastExplanation: string = ''
  submitFeynman(bookId: string, chapterId: string,
    explanation: string): Promise<FeynmanSubmission> {
    this.calls += 1
    this.lastExplanation = explanation
    return super.submitFeynman(bookId, chapterId, explanation)
  }
}

class PendingFeynmanRepository extends FixtureLearningRepository {
  submitFeynman(_bookId: string, _chapterId: string,
    _explanation: string): Promise<FeynmanSubmission> {
    return Promise.resolve(new FeynmanSubmission(true, '已记录', '', 'evidence-pending',
      'pending', -1, -1))
  }
}

export default function feynmanSessionTest(): void {
  describe('Feynman learning loop', () => {
    it('draft_is_editable_and_capped_at_the_explicit_raw_limit_without_submitting', 0, async () => {
      const repository = new CountingFeynmanRepository()
      const session = new LearningSession(repository)
      await session.load()

      session.setFeynmanText('讲'.repeat(FEYNMAN_RAW_LIMIT + 1))

      expect(session.feynmanText.length).assertEqual(FEYNMAN_RAW_LIMIT)
      expect(session.feynmanRemaining).assertEqual(0)
      expect(repository.calls).assertEqual(0)
    })

    it('editing_keeps_incremental_trailing_whitespace_verbatim', 0, async () => {
      const repository = new CountingFeynmanRepository()
      const session = new LearningSession(repository)
      await session.load()

      session.setFeynmanText('讲')
      session.setFeynmanText('讲 ')

      expect(session.feynmanText).assertEqual('讲 ')
      expect(repository.calls).assertEqual(0)
    })

    it('submit_trims_once_and_sends_all_2000_effective_characters', 0, async () => {
      const repository = new CountingFeynmanRepository()
      const session = new LearningSession(repository)
      await session.load()
      const draft: string = `  ${'讲'.repeat(2000)}  `
      session.setFeynmanText(draft)

      await session.submitFeynman()

      expect(session.feynmanText).assertEqual(draft)
      expect(repository.calls).assertEqual(1)
      expect(repository.lastExplanation).assertEqual('讲'.repeat(2000))
    })

    it('submit_rejects_2001_effective_characters_without_mutating_the_draft', 0, async () => {
      const repository = new CountingFeynmanRepository()
      const session = new LearningSession(repository)
      await session.load()
      const draft: string = ` ${'讲'.repeat(2001)} `
      session.setFeynmanText(draft)

      await session.submitFeynman()

      expect(session.feynmanText).assertEqual(draft)
      expect(repository.calls).assertEqual(0)
    })

    it('whitespace_only_submit_never_calls_the_repository', 0, async () => {
      const repository = new CountingFeynmanRepository()
      const session = new LearningSession(repository)
      await session.load()
      session.setFeynmanText('  \n\t  ')

      await session.submitFeynman()

      expect(session.feynmanText).assertEqual('  \n\t  ')
      expect(repository.calls).assertEqual(0)
    })

    it('explicit_submit_refreshes_evidence_mastery_and_next_step', 0, async () => {
      const session = new LearningSession(new FixtureLearningRepository())
      await session.load()
      session.setFeynmanText('监督学习依靠带目标标签的数据形成监督信号。')

      await session.submitFeynman()

      expect(session.feynmanSubmission?.evidenceId).assertEqual('evidence-feynman-fixture')
      expect(session.chapterMastery).assertEqual(0.15)
      expect(session.conceptMastery).assertEqual(0.15)
      expect(session.feynmanNextStep).assertContain('下一')
      expect(session.feynmanError).assertEqual('')

      session.setFeynmanText('这是一次新的复述草稿。')
      expect(session.feynmanSubmission).assertNull()
      expect(session.feynmanNextStep).assertEqual('')
    })

    it('failed_submit_keeps_the_users_editable_text', 0, async () => {
      const session = new LearningSession(new FailingFeynmanRepository())
      await session.load()
      const draft: string = '  这是我自己的复述，失败后不能丢。  '
      session.setFeynmanText(draft)

      await session.submitFeynman()

      expect(session.feynmanText).assertEqual(draft)
      expect(session.feynmanError).assertEqual('费曼检验提交失败，请稍后重试。')
      expect(session.feynmanSubmitting).assertFalse()
    })

    it('pending_projection_without_mastery_preserves_existing_mastery', 0, async () => {
      const session = new LearningSession(new PendingFeynmanRepository())
      await session.load()
      session.selectAnswer('answer-b')
      await session.submitCurrentQuiz()
      session.setFeynmanText('监督学习依靠带标签数据。')

      await session.submitFeynman()

      expect(session.feynmanSubmission?.projectionStatus).assertEqual('pending')
      expect(session.chapterMastery).assertEqual(0.82)
      expect(session.conceptMastery).assertEqual(0.82)
    })
  })
}
