import { http } from '@kit.NetworkKit'
import { LearningRepository } from './LearningRepository'
import { FeynmanSubmission, LearningBook, LearningBookSummary, QuizSubmission } from './LearningModels'
import { parseBook, parseBookSummaries, parseFeynmanSubmission, parseQuizSubmission } from '../network/BookContractParser'
import { ServerConfig } from '../network/ServerConfig'

interface QuizRequestBody {
  blockId: string
  answerId: string
}

interface FeynmanRequestBody {
  explanation: string
}

function responseText(response: http.HttpResponse): string {
  if (typeof response.result !== 'string') {
    throw new Error('invalid_http_payload')
  }
  return response.result
}

async function requestJson(path: string, method: http.RequestMethod,
  body: string = ''): Promise<string> {
  const request: http.HttpRequest = http.createHttp()
  try {
    const options: http.HttpRequestOptions = {
      method,
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: ServerConfig.TIMEOUT_MS,
      readTimeout: ServerConfig.TIMEOUT_MS,
      usingCache: false,
      header: { 'Content-Type': 'application/json' }
    }
    if (body.length > 0) {
      options.extraData = body
    }
    const response: http.HttpResponse = await request.request(ServerConfig.BASE_URL + path, options)
    if (response.responseCode < 200 || response.responseCode >= 300) {
      throw new Error('http_' + response.responseCode)
    }
    return responseText(response)
  } catch (error) {
    throw new Error((error as Error).message)
  } finally {
    request.destroy()
  }
}

export class HttpLearningRepository implements LearningRepository {
  async listBooks(): Promise<Array<LearningBookSummary>> {
    return parseBookSummaries(await requestJson('/api/books', http.RequestMethod.GET))
  }

  async getBook(id: string): Promise<LearningBook> {
    return parseBook(await requestJson('/api/books/' + encodeURIComponent(id), http.RequestMethod.GET))
  }

  async submitQuiz(bookId: string, blockId: string, answerId: string): Promise<QuizSubmission> {
    const body: QuizRequestBody = { blockId, answerId }
    return parseQuizSubmission(await requestJson('/api/books/' + encodeURIComponent(bookId) + '/attempts',
      http.RequestMethod.POST, JSON.stringify(body)))
  }

  async submitFeynman(bookId: string, chapterId: string,
    explanation: string): Promise<FeynmanSubmission> {
    const body: FeynmanRequestBody = { explanation }
    return parseFeynmanSubmission(await requestJson('/api/books/' + encodeURIComponent(bookId) +
      '/chapters/' + encodeURIComponent(chapterId) + '/feynman', http.RequestMethod.POST,
    JSON.stringify(body)))
  }
}
