import { describe, expect, it } from '@ohos/hypium'
import { BookChapter, LearningBookSummary } from '../main/ets/learning/LearningModels'
import { FixtureLearningRepository } from '../main/ets/learning/FixtureLearningRepository'
import { findActiveChapter, LearningSession, selectCurrentBook } from '../main/ets/learning/LearningSession'

export default function learningSessionTest(): void {
  describe('LearningSession', () => {
    it('selectCurrentBook_prefers_latest_learnable_book', 0, () => {
      const selected = selectCurrentBook([
        new LearningBookSummary('proposal-new', '待确认', 'proposal', '2026-08-13T12:00:00.000Z', 'ch-1'),
        new LearningBookSummary('ready-old', '旧书', 'ready', '2026-08-10T12:00:00.000Z', 'ch-1'),
        new LearningBookSummary('partial-new', '新书', 'partial', '2026-08-12T12:00:00.000Z', 'ch-2')
      ])

      expect(selected?.id).assertEqual('partial-new')
    })

    it('findActiveChapter_falls_back_to_first_ready_chapter', 0, () => {
      const chapters = [
        new BookChapter('ch-pending', '准备中', 1, 'pending'),
        new BookChapter('ch-ready', '可学习', 2, 'ready')
      ]

      expect(findActiveChapter(chapters, 'missing')?.id).assertEqual('ch-ready')
    })

    it('load_and_submit_uses_repository_mastery_in_session_state', 0, async () => {
      const session = new LearningSession(new FixtureLearningRepository())

      await session.load()
      session.openLearning()
      session.selectAnswer('answer-b')
      await session.submitCurrentQuiz()

      expect(session.phase).assertEqual('ready')
      expect(session.destination).assertEqual('learning')
      expect(session.currentBook?.id).assertEqual('book-machine-learning')
      expect(session.currentChapter?.id).assertEqual('chapter-supervised')
      expect(session.lastSubmission?.isCorrect).assertTrue()
      expect(session.chapterMastery).assertEqual(0.82)
      expect(session.conceptMastery).assertEqual(0.82)
    })
  })
}
