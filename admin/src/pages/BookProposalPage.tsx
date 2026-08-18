import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import {
  mergeChapterWithNext,
  moveChapter,
  removeChapter,
  renameChapter,
} from '../domain/learningBook'
import type { LearningBook } from '../types/learningBook'
import type { BookEstimate } from '../services/bookApi'

interface BookProposalPageProps {
  book: LearningBook
  onBookChange: (book: LearningBook) => void
  onConfirm: () => void
  onBack: () => void
  /** 真实书确认中：禁用确认按钮防重复提交（mock 书不传，行为不变） */
  isConfirming?: boolean
  /** 真实书确认失败文案（updateProposal/confirmBook 报错时由父层传入） */
  confirmError?: string | null
  /** 真实书逐章成本估算（纯算术参考值；mock 书不传不显示） */
  estimate?: BookEstimate | null
}

export function BookProposalPage({ book, onBookChange, onConfirm, onBack, isConfirming = false, confirmError = null, estimate = null }: BookProposalPageProps) {
  const [notice, setNotice] = useState('你可以调整名称与顺序，确认后再生成正文。')
  const [chapterDrafts, setChapterDrafts] = useState<Record<string, string>>(() => Object.fromEntries(book.chapters.map((chapter) => [chapter.id, chapter.title])))
  // 多文件合书：章 small 行标注来源文件名；单源书不显示，避免噪音
  const multiSource = (book.sources?.length ?? 0) > 1

  useEffect(() => {
    setChapterDrafts(Object.fromEntries(book.chapters.map((chapter) => [chapter.id, chapter.title])))
  }, [book.chapters])

  const applyEdit = (nextBook: LearningBook, successNotice: string, rejectedNotice: string) => {
    if (nextBook === book) {
      setNotice(rejectedNotice)
      return
    }
    onBookChange(nextBook)
    setNotice(successNotice)
  }

  return (
    <section className="book-proposal-page" aria-labelledby="book-proposal-title">
      <header className="book-proposal-navigation">
        <button type="button" className="document-detail__back" onClick={onBack} aria-label="返回知识库">
          <Icon name="back" size={22} />
          <span>知识库</span>
        </button>
        <span className="book-proposal-status"><span aria-hidden="true" />目录待确认</span>
      </header>

      <main className="book-proposal-content">
        <section className="book-proposal-source" aria-label="本次资料与学习设置">
          <div className="book-proposal-source__mark" aria-hidden="true">PDF</div>
          <div>
            <p>{book.source.fileName}</p>
            <span>{book.source.pageCount} 页 · {book.source.sizeLabel} · 文本解析完成</span>
          </div>
        </section>

        <section className="book-proposal-hero">
          <p className="document-section-label">互动学习书提案</p>
          <h1 id="book-proposal-title">{book.proposal.title}</h1>
          <p>{book.proposal.description}</p>
          <dl>
            <div><dt>学习目标</dt><dd>{book.goal}</dd></div>
            <div><dt>当前基础</dt><dd>{book.learnerLevel}</dd></div>
            <div><dt>预计用时</dt><dd>{book.proposal.estimatedMinutes} 分钟</dd></div>
          </dl>
        </section>

        <aside className="book-proposal-rationale" aria-label="目录生成依据">
          <span>为什么这样编排</span>
          <p>{book.proposal.rationale}</p>
        </aside>

        <section className="book-proposal-outline" aria-labelledby="book-outline-title">
          <header>
            <div>
              <p className="document-section-label">目录</p>
              <h2 id="book-outline-title">{book.chapters.length} 个学习章节</h2>
            </div>
            <span>最多 6 章</span>
          </header>

          <div className="book-proposal-chapters">
            {book.chapters.map((chapter, index) => (
              <article className="book-proposal-chapter" data-testid="book-proposal-chapter" key={chapter.id}>
                <span className="book-proposal-chapter__index">{String(index + 1).padStart(2, '0')}</span>
                <div className="book-proposal-chapter__body">
                  <label>
                    <span className="sr-only">第 {index + 1} 章名称</span>
                    <input
                      value={chapterDrafts[chapter.id] ?? chapter.title}
                      aria-label={`第 ${index + 1} 章名称`}
                      onChange={(event) => setChapterDrafts((drafts) => ({ ...drafts, [chapter.id]: event.target.value }))}
                      onBlur={(event) => {
                        const nextBook = renameChapter(book, chapter.id, event.target.value)
                        applyEdit(nextBook, '章节名称已更新。', '章节名称不能为空。')
                        if (nextBook === book) setChapterDrafts((drafts) => ({ ...drafts, [chapter.id]: chapter.title }))
                      }}
                    />
                  </label>
                  <p>{chapter.objective}</p>
                  <small>{chapter.estimatedMinutes} 分钟 · 原文第 {chapter.sourceAnchors.map((item) => item.pageRange).join('、')} 页{multiSource && chapter.sourceAnchors[0] ? ` · 来源：${chapter.sourceAnchors[0].fileName}` : ''}</small>
                  {estimate && (() => {
                    const chapterEstimate = estimate.chapters.find((entry) => entry.chapterId === chapter.id)
                    return chapterEstimate
                      ? <small className="book-proposal-chapter__estimate">预计消耗约 {chapterEstimate.estimatedTokens.toLocaleString()} tokens</small>
                      : null
                  })()}
                </div>
                <div className="book-proposal-chapter__actions" aria-label={`调整第 ${index + 1} 章`}>
                  <button type="button" aria-label={`上移第 ${index + 1} 章`} disabled={index === 0} onClick={() => applyEdit(moveChapter(book, chapter.id, 'up'), '章节已上移。', '已经是第一章。')}>↑</button>
                  <button type="button" aria-label={`下移第 ${index + 1} 章`} disabled={index === book.chapters.length - 1} onClick={() => applyEdit(moveChapter(book, chapter.id, 'down'), '章节已下移。', '已经是最后一章。')}>↓</button>
                  <button type="button" aria-label={`合并第 ${index + 1} 章与下一章`} disabled={book.chapters.length <= 3 || index === book.chapters.length - 1} onClick={() => applyEdit(mergeChapterWithNext(book, chapter.id), '已与下一章合并。', book.chapters.length <= 3 ? '互动学习书至少保留 3 章。' : '最后一章无法向后合并。')}>合并</button>
                  <button type="button" aria-label={`删除第 ${index + 1} 章`} disabled={book.chapters.length <= 3} onClick={() => applyEdit(removeChapter(book, chapter.id), '章节已删除。', '互动学习书至少保留 3 章。')}>删除</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <p className="book-proposal-notice" role="status">{notice}</p>
        {confirmError && <p className="book-proposal-notice" role="alert">{confirmError}</p>}
      </main>

      <footer className="book-proposal-primary-action">
        <div><span>下一步</span><strong>第一章生成后即可开始阅读</strong>{estimate && <span className="book-proposal-estimate-total">全书预计约 {estimate.totalTokens.toLocaleString()} tokens（参考值）</span>}</div>
        <button type="button" disabled={isConfirming} onClick={onConfirm}>{isConfirming ? '正在确认目录…' : '确认目录并生成'}<Icon name="arrow" size={18} /></button>
      </footer>
    </section>
  )
}
