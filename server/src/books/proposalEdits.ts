import type { StoredBook } from './bookTypes.js'

export interface ProposalChapterEdit {
  id: string
  title: string
  order: number
  objective: string
  estimatedMinutes: number
}

export interface ProposalEdits {
  title?: string
  description?: string
  chapters: ProposalChapterEdit[]
}

export type ProposalEditErrorCode = 'invalid_proposal_edit' | 'book_not_editable'

export class ProposalEditError extends Error {
  readonly code: ProposalEditErrorCode

  constructor(code: ProposalEditErrorCode) {
    super(code)
    this.name = 'ProposalEditError'
    this.code = code
  }
}

const MIN_CHAPTERS = 3
const MAX_CHAPTERS = 6
const MAX_TITLE_LENGTH = 40

function isValidTitle(title: unknown): title is string {
  return typeof title === 'string' && title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH
}

function isValidChapterEdit(edit: unknown): edit is ProposalChapterEdit {
  if (typeof edit !== 'object' || edit === null || Array.isArray(edit)) return false
  const candidate = edit as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    isValidTitle(candidate.title) &&
    typeof candidate.order === 'number' &&
    Number.isFinite(candidate.order) &&
    typeof candidate.objective === 'string' &&
    candidate.objective.trim().length > 0 &&
    typeof candidate.estimatedMinutes === 'number' &&
    Number.isFinite(candidate.estimatedMinutes) &&
    candidate.estimatedMinutes > 0
  )
}

// 目录编辑：整体替换可编辑字段（书名/描述/章节标题·顺序·目标·预估时长），
// 章节壳的 id、coreConceptId、sourceAnchors、status、blocks 保持不变。
export function applyProposalEdits(book: StoredBook, edits: ProposalEdits): StoredBook {
  if (book.status !== 'proposal') {
    throw new ProposalEditError('book_not_editable')
  }

  const chapters: unknown = edits?.chapters
  if (!Array.isArray(chapters)) {
    throw new ProposalEditError('invalid_proposal_edit')
  }

  // 章节 id 集合须为原壳 id 的非空子集（允许删除/合并章节，3–6 章）；新增 id 一律拒绝
  const originalIds = new Set(book.chapters.map((chapter) => chapter.id))
  const editIds = new Set<string>()
  const valid =
    chapters.length >= MIN_CHAPTERS &&
    chapters.length <= MAX_CHAPTERS &&
    chapters.every((edit) => {
      if (!isValidChapterEdit(edit) || !originalIds.has(edit.id) || editIds.has(edit.id)) {
        return false
      }
      editIds.add(edit.id)
      return true
    })
  if (!valid) {
    throw new ProposalEditError('invalid_proposal_edit')
  }
  if (edits.title !== undefined && !isValidTitle(edits.title)) {
    throw new ProposalEditError('invalid_proposal_edit')
  }
  if (edits.description !== undefined && typeof edits.description !== 'string') {
    throw new ProposalEditError('invalid_proposal_edit')
  }

  // 按编辑后的 order 重排，并归一化为 1..N
  const sorted = [...(chapters as ProposalChapterEdit[])].sort((a, b) => a.order - b.order)
  const shellById = new Map(book.chapters.map((chapter) => [chapter.id, chapter]))

  return {
    ...book,
    proposal: {
      ...book.proposal,
      title: edits.title ?? book.proposal.title,
      description: edits.description ?? book.proposal.description,
    },
    chapters: sorted.map((edit, index) => {
      const shell = shellById.get(edit.id)!
      return {
        ...shell,
        title: edit.title,
        order: index + 1,
        objective: edit.objective,
        estimatedMinutes: edit.estimatedMinutes,
      }
    }),
  }
}
