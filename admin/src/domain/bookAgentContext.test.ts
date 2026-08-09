import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import { advanceGeneration } from './learningBook'
import { buildBookAgentContext } from './bookAgentContext'

const readyBook = advanceGeneration(learningBookFixture)

function allChaptersReady() {
  return {
    ...readyBook,
    chapters: readyBook.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
  }
}

describe('buildBookAgentContext', () => {
  it('serializes only the requested readable chapter and keeps the payload within the browser budget', () => {
    const context = buildBookAgentContext(readyBook, { chapterId: 'ch-1', scope: 'chapter' })

    expect(context.chapters).toHaveLength(1)
    expect(context.chapters[0].id).toBe('ch-1')
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(24_000)
  })

  it('uses the readable portion of a book rather than pending chapters', () => {
    expect(buildBookAgentContext(readyBook, { chapterId: 'ch-1', scope: 'book' }).chapters.map((chapter) => chapter.id))
      .toEqual(['ch-1'])
    expect(buildBookAgentContext(allChaptersReady(), { chapterId: 'ch-1', scope: 'book' }).chapters.map((chapter) => chapter.id))
      .toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4'])
  })

  it('places the requested ready block first without changing the input book', () => {
    const context = buildBookAgentContext(readyBook, {
      chapterId: 'ch-1',
      scope: 'chapter',
      focusBlockId: 'blk-quiz-1',
    })

    expect(context.focusBlockId).toBe('blk-quiz-1')
    expect(context.chapters[0].blocks[0].id).toBe('blk-quiz-1')
    expect(readyBook.chapters[0].blocks[0].id).toBe('blk-explanation-1')
  })

  it('assigns stable, de-duplicated sources after block ordering and never sources user notes', () => {
    const context = buildBookAgentContext(readyBook, {
      chapterId: 'ch-1',
      scope: 'chapter',
      focusBlockId: 'blk-quiz-1',
    })

    expect(context.sources[0].id).toBe('S1')
    expect(context.sources[0].blockId).toBe('blk-quiz-1')
    expect(context.sources.every((source) => source.blockId !== 'blk-note-1')).toBe(true)
    expect(context.sources).toHaveLength(6)
    expect(context.chapters[0].blocks.find((block) => block.id === 'blk-note-1')?.sourceIds).toEqual([])
  })

  it('marks notes as user-authored supplemental text rather than source material', () => {
    const context = buildBookAgentContext(readyBook, { chapterId: 'ch-1', scope: 'chapter' })
    const note = context.chapters[0].blocks.find((block) => block.id === 'blk-note-1')

    expect(note).toMatchObject({ userAuthored: true, sourceIds: [] })
    expect(note?.content).toContain('用户笔记（非原文）：')
    expect(note?.content).toContain(learningBookFixture.userNotes[0].body)
  })

  it('warns for a missing chapter and emits no fallback content', () => {
    const context = buildBookAgentContext(readyBook, { chapterId: 'missing', scope: 'chapter' })

    expect(context.chapters).toEqual([])
    expect(context.warnings.join(' ')).toContain('missing')
  })

  it('excludes unavailable chapters and blocks from the browser contract', () => {
    const context = buildBookAgentContext({
      ...allChaptersReady(),
      chapters: allChaptersReady().chapters.map((chapter, index) => index === 1
        ? { ...chapter, status: 'error' as const }
        : index === 0
          ? {
              ...chapter,
              status: 'partial' as const,
              blocks: chapter.blocks.map((block, blockIndex) => blockIndex === 0
                ? { ...block, status: 'hidden' as const }
                : blockIndex === 1
                  ? { ...block, status: 'pending' as const }
                  : blockIndex === 2
                    ? { ...block, status: 'error' as const }
                    : block),
            }
          : chapter),
    }, { chapterId: 'ch-1', scope: 'book' })

    expect(context.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-3', 'ch-4'])
    expect(context.chapters[0].blocks.map((block) => block.id)).not.toContain('blk-explanation-1')
    expect(context.chapters[0].blocks.map((block) => block.id)).not.toContain('blk-citation-1')
  })

  it('de-duplicates matching anchors while preserving block source references', () => {
    const duplicated = {
      ...readyBook,
      chapters: readyBook.chapters.map((chapter) => chapter.id === 'ch-1'
        ? {
            ...chapter,
            blocks: chapter.blocks.map((block) => block.id === 'blk-example-1'
              ? { ...block, sourceAnchors: [readyBook.chapters[0].blocks[0].sourceAnchors[0]] }
              : block),
          }
        : chapter),
    }

    const context = buildBookAgentContext(duplicated, { chapterId: 'ch-1', scope: 'chapter' })
    const explanation = context.chapters[0].blocks.find((block) => block.id === 'blk-explanation-1')
    const example = context.chapters[0].blocks.find((block) => block.id === 'blk-example-1')

    expect(context.sources.filter((source) => source.pageRange === readyBook.chapters[0].blocks[0].sourceAnchors[0].pageRange)).toHaveLength(1)
    expect(example?.sourceIds).toEqual(explanation?.sourceIds)
  })

  it('clips individual blocks at 2,000 characters and records the clipping', () => {
    const context = buildBookAgentContext({
      ...readyBook,
      chapters: readyBook.chapters.map((chapter) => chapter.id === 'ch-1'
        ? {
            ...chapter,
            blocks: chapter.blocks.map((block) => block.id === 'blk-explanation-1'
              ? { ...block, body: 'x'.repeat(2_100), keyPoint: 'key' }
              : block),
          }
        : chapter),
    }, { chapterId: 'ch-1', scope: 'chapter' })

    const block = context.chapters[0].blocks.find((candidate) => candidate.id === 'blk-explanation-1')
    expect(block?.content.length).toBe(2_000)
    expect(block?.content.endsWith('…已截断')).toBe(true)
    expect(context.warnings.join(' ')).toContain('blk-explanation-1')
  })

  it('clips a chapter at 8,000 characters and records the clipping', () => {
    const largeChapter = {
      ...readyBook,
      chapters: readyBook.chapters.map((chapter) => chapter.id === 'ch-1'
        ? {
            ...chapter,
            blocks: chapter.blocks.map((block, index) => ({
              ...block,
              ...(block.type === 'explanation' ? { body: 'x'.repeat(1_990), keyPoint: `${index}` } : {}),
              ...(block.type === 'example' ? { scenario: 'x'.repeat(1_990), takeaway: `${index}` } : {}),
              ...(block.type === 'formula' ? { formula: 'x'.repeat(1_990), explanation: `${index}` } : {}),
              ...(block.type === 'citation' ? { excerpt: 'x'.repeat(1_990) } : {}),
              ...(block.type === 'concept' ? { concepts: [{ ...block.concepts[0], description: 'x'.repeat(1_900) }] } : {}),
              ...(block.type === 'quiz' ? { question: 'x'.repeat(1_950), options: [] } : {}),
            })),
          }
        : chapter),
    }
    const context = buildBookAgentContext(largeChapter, { chapterId: 'ch-1', scope: 'chapter' })

    expect(context.chapters[0].blocks.reduce((size, block) => size + block.content.length, 0)).toBeLessThanOrEqual(8_000)
    const lastBlock = context.chapters[0].blocks[context.chapters[0].blocks.length - 1]
    expect(lastBlock?.content.endsWith('…已截断')).toBe(true)
    expect(context.warnings.join(' ')).toContain('ch-1')
  })
})
