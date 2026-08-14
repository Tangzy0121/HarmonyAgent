import { LearningRepository } from './LearningRepository'
import {
  BookChapter,
  LearningBlock,
  LearningBook,
  LearningBookSummary,
  QuizSubmission,
  FeynmanSubmission
} from './LearningModels'
import {
  FEYNMAN_EFFECTIVE_LIMIT,
  FeynmanPanelState,
  buildFeynmanPanelState,
  limitFeynmanDraft
} from '../components/learning/FeynmanPanelState'
import { ReviewDeepLinkTarget } from '../review/ReviewDeepLink'

function isLearnable(status: string): boolean {
  return status === 'ready' || status === 'partial'
}

export function selectCurrentBook(books: Array<LearningBookSummary>): LearningBookSummary | null {
  let selected: LearningBookSummary | null = null
  for (let index: number = 0; index < books.length; index++) {
    const candidate: LearningBookSummary = books[index]
    if (!isLearnable(candidate.status)) {
      continue
    }
    if (selected === null || candidate.updatedAt > selected.updatedAt) {
      selected = candidate
    }
  }
  return selected
}

export function findActiveChapter(chapters: Array<BookChapter>, activeChapterId: string): BookChapter | null {
  for (let index: number = 0; index < chapters.length; index++) {
    if (chapters[index].id === activeChapterId && isLearnable(chapters[index].status)) {
      return chapters[index]
    }
  }
  for (let index: number = 0; index < chapters.length; index++) {
    if (isLearnable(chapters[index].status)) {
      return chapters[index]
    }
  }
  return null
}

export class LearningSession {
  private repository: LearningRepository
  phase: string = 'idle'
  destination: string = 'today'
  currentBook: LearningBook | null = null
  currentChapter: BookChapter | null = null
  selectedAnswerId: string = ''
  submitting: boolean = false
  lastSubmission: QuizSubmission | null = null
  chapterMastery: number = 0
  conceptMastery: number = 0
  errorMessage: string = ''
  feynmanText: string = ''
  feynmanSubmitting: boolean = false
  feynmanSubmission: FeynmanSubmission | null = null
  feynmanError: string = ''
  feynmanNextStep: string = ''
  focusBlockId: string = ''

  get feynmanRemaining(): number {
    return Math.max(0, FEYNMAN_EFFECTIVE_LIMIT - buildFeynmanPanelState(this.feynmanText).effectiveLength)
  }

  constructor(repository: LearningRepository) {
    this.repository = repository
  }

  async load(): Promise<void> {
    this.phase = 'loading'
    this.errorMessage = ''
    try {
      const summaries: Array<LearningBookSummary> = await this.repository.listBooks()
      const selected: LearningBookSummary | null = selectCurrentBook(summaries)
      if (selected === null) {
        this.phase = 'empty'
        return
      }
      const book: LearningBook = await this.repository.getBook(selected.id)
      const chapter: BookChapter | null = findActiveChapter(book.chapters, book.activeChapterId)
      if (chapter === null) {
        this.phase = 'empty'
        return
      }
      this.currentBook = book
      this.currentChapter = chapter
      this.phase = 'ready'
    } catch (error) {
      this.phase = 'error'
      this.errorMessage = (error as Error).message
    }
  }

  openLearning(): void {
    if (this.currentChapter !== null) {
      this.focusBlockId = ''
      this.destination = 'learning'
    }
  }

  openToday(): void {
    this.focusBlockId = ''
    this.destination = 'today'
  }

  async openReviewTarget(target: ReviewDeepLinkTarget | null): Promise<boolean> {
    this.focusBlockId = ''
    if (target === null) {
      this.destination = 'today'
      return false
    }
    try {
      const book: LearningBook = await this.repository.getBook(target.bookId)
      let chapter: BookChapter | null = null
      for (let chapterIndex: number = 0; chapterIndex < book.chapters.length; chapterIndex++) {
        if (book.chapters[chapterIndex].id === target.chapterId && isLearnable(book.chapters[chapterIndex].status)) {
          chapter = book.chapters[chapterIndex]
          break
        }
      }
      if (chapter === null) {
        this.destination = 'today'
        return false
      }
      let found: boolean = false
      for (let blockIndex: number = 0; blockIndex < chapter.blocks.length; blockIndex++) {
        if (chapter.blocks[blockIndex].id === target.blockId) {
          found = true
          break
        }
      }
      if (!found) {
        this.destination = 'today'
        return false
      }
      this.currentBook = book
      this.currentChapter = chapter
      this.phase = 'ready'
      this.focusBlockId = target.blockId
      this.destination = 'learning'
      return true
    } catch (_error) {
      this.destination = 'today'
      return false
    }
  }

  selectAnswer(answerId: string): void {
    if (!this.submitting) {
      this.selectedAnswerId = answerId
    }
  }

  currentQuiz(): LearningBlock | null {
    if (this.currentChapter === null) {
      return null
    }
    for (let index: number = 0; index < this.currentChapter.blocks.length; index++) {
      if (this.currentChapter.blocks[index].type === 'quiz') {
        return this.currentChapter.blocks[index]
      }
    }
    return null
  }

  async submitCurrentQuiz(): Promise<void> {
    const quiz: LearningBlock | null = this.currentQuiz()
    if (this.submitting || this.currentBook === null || quiz === null || this.selectedAnswerId.length === 0) {
      return
    }
    this.submitting = true
    this.errorMessage = ''
    try {
      const result: QuizSubmission = await this.repository.submitQuiz(
        this.currentBook.id,
        quiz.id,
        this.selectedAnswerId
      )
      this.lastSubmission = result
      if (result.chapterMastery >= 0) this.chapterMastery = result.chapterMastery
      if (result.conceptMastery >= 0) this.conceptMastery = result.conceptMastery
    } catch (error) {
      this.errorMessage = (error as Error).message
    } finally {
      this.submitting = false
    }
  }

  setFeynmanText(value: string): void {
    this.feynmanText = limitFeynmanDraft(value)
    this.feynmanSubmission = null
    this.feynmanNextStep = ''
    this.feynmanError = ''
  }

  async submitFeynman(): Promise<void> {
    const draftState: FeynmanPanelState = buildFeynmanPanelState(this.feynmanText)
    if (this.feynmanSubmitting || this.currentBook === null || this.currentChapter === null ||
      !draftState.canSubmit) return
    this.feynmanSubmitting = true
    this.feynmanError = ''
    try {
      const result: FeynmanSubmission = await this.repository.submitFeynman(
        this.currentBook.id, this.currentChapter.id, draftState.submitText)
      this.feynmanSubmission = result
      if (result.chapterMastery >= 0) this.chapterMastery = result.chapterMastery
      if (result.conceptMastery >= 0) this.conceptMastery = result.conceptMastery
      this.feynmanNextStep = result.passed ? '已抓住核心，可以进入下一步学习。' :
        `下一步：${result.gap}`
    } catch (error) {
      this.feynmanError = '费曼检验提交失败，请稍后重试。'
    } finally {
      this.feynmanSubmitting = false
    }
  }
}
