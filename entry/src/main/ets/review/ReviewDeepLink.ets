export class ReviewDeepLinkTarget {
  bookId: string
  chapterId: string
  blockId: string
  action: string

  constructor(bookId: string, chapterId: string, blockId: string, action: string) {
    this.bookId = bookId
    this.chapterId = chapterId
    this.blockId = blockId
    this.action = action
  }
}

export class ReviewDeepLinkParameters {
  bookId: string
  chapterId: string
  blockId: string
  action: string
  uri: string

  constructor(bookId: string = '', chapterId: string = '', blockId: string = '', action: string = '',
    uri: string = '') {
    this.bookId = bookId
    this.chapterId = chapterId
    this.blockId = blockId
    this.action = action
    this.uri = uri
  }
}

function validIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
}

export function parseReviewDeepLink(parameters: ReviewDeepLinkParameters | undefined): ReviewDeepLinkTarget | null {
  if (parameters === undefined || parameters.uri.length > 0) return null
  const bookId: string = parameters.bookId
  const chapterId: string = parameters.chapterId
  const blockId: string = parameters.blockId
  const action: string = parameters.action
  if (!validIdentifier(bookId) || !validIdentifier(chapterId) || !validIdentifier(blockId) || action !== 'review') {
    return null
  }
  return new ReviewDeepLinkTarget(bookId, chapterId, blockId, action)
}
