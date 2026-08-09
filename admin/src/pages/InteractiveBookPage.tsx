import { Icon } from '../components/Icon'
import { BookBlockRenderer } from '../components/book/BookBlockRenderer'
import { BookContextBar } from '../components/book/BookContextBar'
import { BookGenerationRail } from '../components/book/BookGenerationRail'
import { advanceGeneration, regenerateBlock, retryChapterGeneration, submitQuizAttempt, updateUserNote } from '../domain/learningBook'
import type { AgentContextScope, LearningBook } from '../types/learningBook'

interface InteractiveBookPageProps {
  book: LearningBook
  activeChapterId: string
  contextScope: AgentContextScope
  onBookChange: (book: LearningBook) => void
  onChapterChange: (chapterId: string) => void
  onContextScopeChange: (scope: AgentContextScope) => void
  onAskAgent: (focusBlockId?: string) => void
  onBack: () => void
  onStartDeepLearning: (blockId: string) => void
}

export function InteractiveBookPage(props: InteractiveBookPageProps) {
  const { book, activeChapterId, contextScope, onBookChange, onChapterChange, onContextScopeChange, onAskAgent, onBack, onStartDeepLearning } = props
  const activeChapter = book.chapters.find((chapter) => chapter.id === activeChapterId) ?? book.chapters[0]
  const nextChapter = book.chapters[activeChapter.order + 1]
  const chapterOrdinal = ['一', '二', '三', '四', '五', '六'][activeChapter.order] ?? String(activeChapter.order + 1)

  return (
    <section className="interactive-book-page" aria-labelledby="interactive-book-title">
      <header className="interactive-book-navigation">
        <button type="button" onClick={onBack} aria-label="返回知识库"><Icon name="back" size={21} />知识库</button>
        <div><span>互动学习书</span><strong>{book.proposal.title}</strong></div>
        <span className="interactive-book-navigation__source"><Icon name="document" size={16} />{book.source.fileName}</span>
      </header>

      <BookGenerationRail chapters={book.chapters} activeChapterId={activeChapter.id} onChapterChange={onChapterChange} />

      <main className="interactive-book-reader">
        <BookContextBar contextScope={contextScope} onContextScopeChange={onContextScopeChange} onAskAgent={onAskAgent} />

        {activeChapter.status === 'generating' ? (
          <section className="book-generating-state" aria-live="polite">
            <span className="book-generating-state__orb"><Icon name="spark" size={34} /></span>
            <p>第 {activeChapter.order + 1} 章 · 正在理解原文</p>
            <h1 id="interactive-book-title">正在生成第{chapterOrdinal}章</h1>
            <span>Agent 正在依据第 {activeChapter.sourceAnchors.map((anchor) => anchor.pageRange).join('、')} 页组织讲解、例子和验证题。本章完成后即可开始阅读，后续章节会继续生成。</span>
            <div className="book-generating-state__steps"><i className="is-done" /><i className="is-active" /><i /><i /></div>
            <button type="button" onClick={() => onBookChange(advanceGeneration(book))}>完成本章生成 <Icon name="arrow" size={17} /></button>
          </section>
        ) : activeChapter.status === 'error' ? (
          <section className="book-pending-state" role="alert">
            <Icon name="refresh" size={28} />
            <h1 id="interactive-book-title">这一章生成失败了</h1>
            <p>已有章节和学习记录不会受到影响，可以单独重试当前章节。</p>
            <button type="button" className="book-block__primary" onClick={() => onBookChange(retryChapterGeneration(book, activeChapter.id))}>重新生成本章</button>
          </section>
        ) : activeChapter.status === 'ready' || activeChapter.status === 'partial' ? (
          <article className="interactive-book-chapter">
            <header className="interactive-book-chapter__hero">
              <p>第 {activeChapter.order + 1} 章 · {activeChapter.estimatedMinutes} 分钟</p>
              <h1 id="interactive-book-title">{book.proposal.title}</h1>
              <h2>{activeChapter.title}</h2>
              <span>{activeChapter.objective}</span>
              <small>依据原文第 {activeChapter.sourceAnchors.map((anchor) => anchor.pageRange).join('、')} 页生成</small>
            </header>
            <div className="interactive-book-blocks">
              {activeChapter.blocks.map((block) => (
                <BookBlockRenderer
                  key={block.id}
                  block={block}
                  note={block.type === 'user_note' ? book.userNotes.find((note) => note.id === block.noteId) : undefined}
                  attempt={book.quizAttempts.find((attempt) => attempt.blockId === block.id)}
                  onRegenerate={(blockId) => onBookChange(regenerateBlock(book, blockId))}
                  onSubmitQuiz={(blockId, answerId) => onBookChange(submitQuizAttempt(book, blockId, answerId))}
                  onUpdateNote={(noteId, body) => onBookChange(updateUserNote(book, noteId, body))}
                  onStartDeepLearning={onStartDeepLearning}
                  onAskAgent={onAskAgent}
                />
              ))}
            </div>
            {nextChapter && (
              <footer className="interactive-book-chapter__next">
                <div><span>接下来</span><strong>{nextChapter.title}</strong></div>
                <button type="button" onClick={() => onChapterChange(nextChapter.id)}>继续生成下一章 <Icon name="arrow" size={17} /></button>
              </footer>
            )}
          </article>
        ) : (
          <section className="book-pending-state">
            <Icon name="clock" size={28} /><h1 id="interactive-book-title">这一章正在排队</h1><p>先完成前面的章节，系统会按目录顺序继续生成。</p>
          </section>
        )}
      </main>
    </section>
  )
}
