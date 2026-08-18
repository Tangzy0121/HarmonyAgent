import { describe, expect, it } from '@ohos/hypium'
import { ReviewDeepLinkParameters, parseReviewDeepLink } from '../main/ets/review/ReviewDeepLink'
import { FixtureLearningRepository } from '../main/ets/learning/FixtureLearningRepository'
import { LearningSession } from '../main/ets/learning/LearningSession'

export default function reviewDeepLinkTest(): void {
  describe('review deep link', () => {
    it('accepts_only_the_existing_learning_target_identifiers', 0, () => {
      const target = parseReviewDeepLink(new ReviewDeepLinkParameters(
        'book-1', 'chapter-1', 'quiz-1', 'review'))

      expect(target?.bookId).assertEqual('book-1')
      expect(target?.chapterId).assertEqual('chapter-1')
      expect(target?.blockId).assertEqual('quiz-1')
      expect(target?.action).assertEqual('review')
    })

    it('rejects_missing_unknown_or_injection_shaped_parameters', 0, () => {
      expect(parseReviewDeepLink(new ReviewDeepLinkParameters('book-1', 'chapter-1', '', 'review'))).assertNull()
      expect(parseReviewDeepLink(new ReviewDeepLinkParameters(
        'book-1', 'chapter-1', 'quiz-1', 'https://evil.invalid'))).assertNull()
      expect(parseReviewDeepLink(new ReviewDeepLinkParameters(
        '../EntryAbility', 'chapter-1', 'quiz-1', 'review'))).assertNull()
      expect(parseReviewDeepLink(new ReviewDeepLinkParameters(
        'book-1', 'chapter-1', 'quiz-1', 'review', 'evil://inject'))).assertNull()
    })

    it('navigates_only_to_an_existing_book_chapter_and_block_otherwise_returns_today', 0, async () => {
      const session = new LearningSession(new FixtureLearningRepository())
      const summaries = await new FixtureLearningRepository().listBooks()
      const book = await new FixtureLearningRepository().getBook(summaries[0].id)
      const chapter = book.chapters[0]
      const block = chapter.blocks[3]

      const opened = await session.openReviewTarget(parseReviewDeepLink(new ReviewDeepLinkParameters(
        book.id, chapter.id, block.id, 'review')))

      expect(opened).assertTrue()
      expect(session.destination).assertEqual('learning')
      expect(session.focusBlockId).assertEqual(block.id)

      const expired = await session.openReviewTarget(parseReviewDeepLink(new ReviewDeepLinkParameters(
        book.id, chapter.id, 'missing-block', 'review')))
      expect(expired).assertFalse()
      expect(session.destination).assertEqual('today')
      expect(session.focusBlockId).assertEqual('')
    })
  })
}
