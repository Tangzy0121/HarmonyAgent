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

  it('defaults an omitted scope to the requested readable chapter', () => {
    const context = buildBookAgentContext(readyBook, { chapterId: 'ch-1' })

    expect(context.scope).toBe('chapter')
    expect(context.chapters.map((chapter) => chapter.id)).toEqual(['ch-1'])
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
    expect(JSON.stringify(context.chapters[0]).length).toBeLessThanOrEqual(8_000)
    expect(context.warnings.join(' ')).toContain('ch-1')
  })

  it('bounds the final serialized chapter, including block metadata and source references, at 8,000 characters', () => {
    const sharedAnchor = readyBook.chapters[0].blocks[0].sourceAnchors[0]
    const metadataHeavyChapter = {
      ...readyBook,
      chapters: readyBook.chapters.map((chapter) => chapter.id === 'ch-1'
        ? {
            ...chapter,
            title: 'chapter-title-'.repeat(39),
            objective: 'chapter-objective-'.repeat(53),
            blocks: Array.from({ length: 5 }, (_, index) => ({
              ...chapter.blocks[0],
              id: `metadata-heavy-${index}`,
              status: 'ready' as const,
              title: 'block-title-'.repeat(42),
              body: 'body-'.repeat(180),
              keyPoint: `key-${index}`,
              sourceAnchors: [sharedAnchor],
            })),
          }
        : chapter),
    }

    const context = buildBookAgentContext(metadataHeavyChapter, { chapterId: 'ch-1', scope: 'chapter' })
    const repeated = buildBookAgentContext(metadataHeavyChapter, { chapterId: 'ch-1', scope: 'chapter' })
    const chapter = context.chapters[0]
    const sourceIds = new Set<string>(context.sources.map((source) => source.id))

    expect(JSON.stringify(chapter).length).toBeLessThanOrEqual(8_000)
    expect(chapter.blocks).toHaveLength(4)
    expect(chapter.blocks.map((block) => block.id)).toEqual(repeated.chapters[0].blocks.map((block) => block.id))
    expect(chapter.blocks.every((block) => block.sourceIds.every((sourceId) => sourceIds.has(sourceId)))).toBe(true)
    expect(context.sources.every((source) => source.chapterId === chapter.id
      && chapter.blocks.some((block) => block.id === source.blockId))).toBe(true)
  })

  it('throws a stable controlled error when a chapter identity alone exceeds its final budget', () => {
    const oversizedChapterId = 'chapter-id-'.repeat(1_000)
    const oversizedChapter = {
      ...readyBook,
      chapters: readyBook.chapters.map((chapter) => chapter.id === 'ch-1'
        ? { ...chapter, id: oversizedChapterId }
        : chapter),
    }

    expect(() => buildBookAgentContext(oversizedChapter, {
      chapterId: oversizedChapterId,
      scope: 'chapter',
    })).toThrow('BOOK_AGENT_CHAPTER_BUDGET_EXCEEDED')
  })

  it('reassigns a shared source owner when chapter trimming removes its first referencing block', () => {
    const sharedAnchor = readyBook.chapters[0].blocks[0].sourceAnchors[0]
    const twoChapterBook = {
      ...allChaptersReady(),
      chapters: allChaptersReady().chapters.map((chapter, index) => index === 0
        ? {
            ...chapter,
            blocks: [{
              ...chapter.blocks[0],
              id: 'first-owner-'.repeat(500),
              status: 'ready' as const,
              body: 'body-'.repeat(380),
              keyPoint: 'first owner is deliberately too large',
              sourceAnchors: [sharedAnchor],
            }],
          }
        : index === 1
          ? {
              ...chapter,
              blocks: [{
                ...chapter.blocks[0],
                id: 'later-shared-reference',
                status: 'ready' as const,
                sourceAnchors: [sharedAnchor],
              }],
            }
          : { ...chapter, status: 'pending' as const }),
    }

    const context = buildBookAgentContext(twoChapterBook, { chapterId: 'ch-1', scope: 'book' })
    const source = context.sources.find((candidate) => candidate.sourceId === sharedAnchor.sourceId)

    expect(context.chapters.find((chapter) => chapter.id === 'ch-1')?.blocks).toEqual([])
    expect(context.chapters.find((chapter) => chapter.id === 'ch-2')?.blocks.map((block) => block.id))
      .toEqual(['later-shared-reference'])
    expect(source).toMatchObject({ chapterId: 'ch-2', blockId: 'later-shared-reference' })
  })

  it('re-fits the final context after shared-source ownership grows during reassignment', () => {
    const sharedAnchor = {
      ...readyBook.chapters[0].blocks[0].sourceAnchors[0],
      sourceId: 'shared-source',
      fileName: 'f'.repeat(500),
      pageRange: 'p'.repeat(200),
      excerpt: 'e'.repeat(1_000),
    }
    const retainedAnchors = [sharedAnchor]
    const independentAnchor = {
      ...sharedAnchor,
      sourceId: 'independent-retained-source',
      fileName: 'f',
      pageRange: '1',
      excerpt: 'e',
    }
    const trimmedOwnerAnchors = [sharedAnchor, ...Array.from({ length: 1_500 }, (_, index) => ({
      ...sharedAnchor,
      sourceId: `trimmed-source-${index}`,
      fileName: 'f',
      pageRange: '1',
      excerpt: 'e',
    }))]
    const longRetainedBlockId = 'retained-owner-'.repeat(180)
    const nearLimitBook = {
      ...allChaptersReady(),
      chapters: allChaptersReady().chapters.map((chapter, index) => index === 0
        ? {
            ...chapter,
            blocks: [{
              ...chapter.blocks[0],
              id: 'trimmed-first-owner',
              status: 'ready' as const,
              sourceAnchors: trimmedOwnerAnchors,
            }],
          }
        : index === 1
          ? {
              ...chapter,
              blocks: [
                {
                  ...chapter.blocks[0],
                  id: 'small-retained-reference',
                  status: 'ready' as const,
                  sourceAnchors: [independentAnchor],
                },
                {
                  ...chapter.blocks[0],
                  id: longRetainedBlockId,
                  status: 'ready' as const,
                  sourceAnchors: retainedAnchors,
                },
              ],
            }
          : { ...chapter, status: 'pending' as const }),
    }

    const context = buildBookAgentContext(nearLimitBook, {
      chapterId: 'ch-1',
      scope: 'book',
      focusBlockId: 'focus-'.repeat(2_800),
    })
    const sharedSource = context.sources.find((source) => source.sourceId === 'shared-source')

    expect(JSON.stringify(context).length).toBeLessThanOrEqual(24_000)
    expect(context.chapters.find((chapter) => chapter.id === 'ch-1')?.blocks).toEqual([])
    expect(context.chapters.find((chapter) => chapter.id === 'ch-2')?.blocks.map((block) => block.id))
      .toEqual(['small-retained-reference'])
    expect(sharedSource).toBeUndefined()
    expect(context.sources.every((source) => context.chapters.some((chapter) => chapter.id === source.chapterId
      && chapter.blocks.some((block) => block.id === source.blockId)))).toBe(true)
  })

  it('hard-bounds long chapter and source metadata with deterministic tail removal and valid shared sources', () => {
    const sharedAnchor = {
      ...readyBook.chapters[0].blocks[0].sourceAnchors[0],
      fileName: 'file-name-'.repeat(1_000),
      pageRange: 'page-range-'.repeat(500),
      excerpt: 'excerpt-'.repeat(2_000),
    }
    const longBook = {
      ...allChaptersReady(),
      proposal: { ...readyBook.proposal, title: 'book-title-'.repeat(1_000) },
      chapters: allChaptersReady().chapters.map((chapter) => ({
        ...chapter,
        title: `chapter-${chapter.id}-${'title-'.repeat(1_000)}`,
        objective: `objective-${'text-'.repeat(1_000)}`,
        blocks: Array.from({ length: 5 }, (_, index) => ({
          ...chapter.blocks[0],
          id: `${chapter.id}-long-${index}`,
          status: 'ready' as const,
          sourceAnchors: [sharedAnchor],
          body: 'body-'.repeat(400),
          keyPoint: `key-${index}`,
        })),
      })),
    }

    const context = buildBookAgentContext(longBook, { chapterId: 'ch-1', scope: 'book' })
    const repeated = buildBookAgentContext(longBook, { chapterId: 'ch-1', scope: 'book' })
    const blocks = context.chapters.flatMap((chapter) => chapter.blocks)
    const sourceIds = new Set<string>(context.sources.map((source) => source.id))

    expect(JSON.stringify(context).length).toBeLessThanOrEqual(24_000)
    expect(context.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id)))
      .toEqual(repeated.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id)))
    expect(blocks.some((block) => block.id.startsWith('ch-4-'))).toBe(false)
    expect(blocks.every((block) => block.sourceIds.every((sourceId) => sourceIds.has(sourceId)))).toBe(true)
    expect(context.sources.every((source) => context.chapters.some((chapter) => chapter.id === source.chapterId
      && chapter.blocks.some((block) => block.id === source.blockId)))).toBe(true)
    expect(context.sources).toHaveLength(1)
  })

  it('throws a stable controlled error when required identity fields alone exceed the context budget', () => {
    expect(() => buildBookAgentContext({ ...readyBook, id: 'book-id-'.repeat(4_000) }, {
      chapterId: 'ch-1',
      scope: 'chapter',
    })).toThrow('BOOK_AGENT_CONTEXT_BUDGET_EXCEEDED')
  })
})
