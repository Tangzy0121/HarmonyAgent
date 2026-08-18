import { LearningRepository } from './LearningRepository'
import {
  BookChapter,
  LearningBlock,
  LearningBook,
  LearningBookSummary,
  QuizOption,
  QuizSubmission,
  FeynmanSubmission
} from './LearningModels'

function fixtureBook(): LearningBook {
  const explanation = new LearningBlock('block-explanation', 'explanation', '先看训练数据')
  explanation.body = '监督学习使用带目标答案的数据，无监督学习从未标注数据中寻找结构。'
  explanation.keyPoint = '判断关键是训练数据是否包含目标答案。'

  const concept = new LearningBlock('block-concept', 'concept', '核心概念')
  concept.conceptLabel = '监督信号'
  concept.conceptDescription = '训练样本中用于指导模型学习的目标答案。'

  const example = new LearningBlock('block-example', 'example', '邮件分类例子')
  example.scenario = '已标注“垃圾邮件/正常邮件”的数据用于训练分类器。'
  example.takeaway = '存在目标标签，因此属于监督学习。'

  const quiz = new LearningBlock('block-quiz', 'quiz', '快速验证')
  quiz.question = '没有标签的邮件被模型自动分组，这属于监督学习吗？'
  quiz.options = [
    new QuizOption('answer-a', 'A', '属于，因为数据量足够大。'),
    new QuizOption('answer-b', 'B', '不属于，因为没有目标标签形成监督信号。')
  ]
  quiz.correctAnswerId = 'answer-b'
  quiz.feedback = '是否存在目标标签，是区分两类学习方式的关键。'

  const chapter = new BookChapter('chapter-supervised', '监督学习与无监督学习', 1, 'ready',
    [explanation, concept, example, quiz])
  return new LearningBook('book-machine-learning', '机器学习入门', 'ready',
    '2026-08-13T12:00:00.000Z', chapter.id, [chapter])
}

export class FixtureLearningRepository implements LearningRepository {
  private book: LearningBook = fixtureBook()

  listBooks(): Promise<Array<LearningBookSummary>> {
    return Promise.resolve([
      new LearningBookSummary(this.book.id, this.book.title, this.book.status,
        this.book.updatedAt, this.book.activeChapterId)
    ])
  }

  getBook(id: string): Promise<LearningBook> {
    if (id !== this.book.id) {
      return Promise.reject(new Error('book_not_found'))
    }
    return Promise.resolve(this.book)
  }

  submitQuiz(bookId: string, blockId: string, answerId: string): Promise<QuizSubmission> {
    if (bookId !== this.book.id || blockId !== 'block-quiz') {
      return Promise.reject(new Error('quiz_not_found'))
    }
    if (answerId === 'answer-b') {
      return Promise.resolve(new QuizSubmission(true,
        '回答正确。是否存在目标标签，是判断监督学习的关键。', 0.82, 0.82))
    }
    return Promise.resolve(new QuizSubmission(false,
      '这次还没有答对。先检查训练数据中是否存在目标标签。', 0.25, 0.25,
      '概念判断：把“数据量大”误当成了监督信号。'))
  }

  submitFeynman(bookId: string, chapterId: string, explanation: string): Promise<FeynmanSubmission> {
    if (bookId !== this.book.id || chapterId !== this.book.activeChapterId) {
      return Promise.reject(new Error('chapter_not_found'))
    }
    if (explanation.trim().length === 0 || explanation.trim().length > 2000) {
      return Promise.reject(new Error('invalid_request'))
    }
    const passed: boolean = explanation.indexOf('标签') >= 0 || explanation.indexOf('监督信号') >= 0
    return Promise.resolve(new FeynmanSubmission(passed,
      passed ? '讲得不错，抓住了监督信号这个核心。' : '已经开始用自己的话解释了。',
      passed ? '' : '再说明目标标签怎样指导模型学习。', 'evidence-feynman-fixture',
      'projected', passed ? 0.15 : 0, passed ? 0.15 : 0))
  }
}
