import { describe, expect, it } from '@ohos/hypium'
import { ReviewDeepLinkParameters, parseReviewDeepLink } from '../main/ets/review/ReviewDeepLink'

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
  })
}
