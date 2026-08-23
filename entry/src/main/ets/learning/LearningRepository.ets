import { FeynmanSubmission, LearningBook, LearningBookSummary, QuizSubmission } from './LearningModels'

export interface LearningRepository {
  listBooks(): Promise<Array<LearningBookSummary>>
  getBook(id: string): Promise<LearningBook>
  submitQuiz(bookId: string, blockId: string, answerId: string): Promise<QuizSubmission>
  submitFeynman(bookId: string, chapterId: string, explanation: string): Promise<FeynmanSubmission>
}
