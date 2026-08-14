import { describe, expect, it } from '@ohos/hypium'
import { FixtureLearningRepository } from '../main/ets/learning/FixtureLearningRepository'

export default function fixtureLearningRepositoryTest(): void {
  describe('FixtureLearningRepository', () => {
    it('submitQuiz_returns_server_shaped_mastery_for_wrong_answer', 0, async () => {
      const repository = new FixtureLearningRepository()
      const books = await repository.listBooks()
      const book = await repository.getBook(books[0].id)
      const quiz = book.chapters[0].blocks[3]

      const result = await repository.submitQuiz(book.id, quiz.id, 'answer-a')

      expect(result.isCorrect).assertFalse()
      expect(result.chapterMastery).assertEqual(0.25)
      expect(result.conceptMastery).assertEqual(0.25)
    })

    it('submitQuiz_returns_server_shaped_mastery_for_correct_answer', 0, async () => {
      const repository = new FixtureLearningRepository()
      const books = await repository.listBooks()
      const book = await repository.getBook(books[0].id)
      const quiz = book.chapters[0].blocks[3]

      const result = await repository.submitQuiz(book.id, quiz.id, 'answer-b')

      expect(result.isCorrect).assertTrue()
      expect(result.chapterMastery).assertEqual(0.82)
      expect(result.conceptMastery).assertEqual(0.82)
    })
  })
}
