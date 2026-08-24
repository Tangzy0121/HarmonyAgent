import { useMemo, useState } from 'react'
import { LibraryControlPanel } from '../components/library/LibraryControlPanel'
import { Icon, type IconName } from '../components/Icon'
import { libraryPageContent, toRealBookListItem } from '../data/libraryPage'
import type { StoredBook } from '../services/bookApi'

interface PageProps {
  isActive: boolean
  onOpenDocument: (documentId: string) => void
  bookStatusLabel?: string
  realBooks?: StoredBook[]
  onUploadBook?: () => void
  onOpenRealBook?: (bookId: string) => void
  /** 仅视觉原型使用；MVP 真实流程必须关闭，避免把演示资料当成用户数据。 */
  showFixtures?: boolean
}

export function KnowledgeLibraryPage({ isActive, onOpenDocument, bookStatusLabel, realBooks, onUploadBook, onOpenRealBook, showFixtures = true }: PageProps) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'全部' | '资料' | '笔记'>('全部')
  const trimmedQuery = query.trim()
  const visibleItems = useMemo(() => (showFixtures ? libraryPageContent.items : []).filter((item) => (
    (kind === '全部' || item.kind === kind) && item.name.includes(trimmedQuery)
  )), [kind, showFixtures, trimmedQuery])
  const visibleRealBooks = useMemo(() => (realBooks ?? [])
    .map(toRealBookListItem)
    .filter((item) => kind !== '笔记' && item.name.includes(trimmedQuery)), [realBooks, kind, trimmedQuery])

  return (
    <section className="destination-page library-page library-page--v4" hidden={!isActive} aria-labelledby="library-title">
      <header className="library-page-heading">
        <div className="library-page-heading__row">
          <h1 id="library-title">{libraryPageContent.title}</h1>
          <div className="library-page-heading__actions">
            {onUploadBook && (
              <button className="library-upload" type="button" onClick={onUploadBook}>
                <Icon name="upload" size={16} />
                上传学习资料
              </button>
            )}
            {showFixtures && <button className="library-create" type="button" aria-label="新建资料">
              <Icon name="add" size={20} />
            </button>}
          </div>
        </div>
        <p>{showFixtures ? libraryPageContent.subtitle : '我的学习资料'} · {visibleRealBooks.length + visibleItems.length} 项资料</p>
      </header>

      <LibraryControlPanel
        query={query}
        kind={kind}
        filters={libraryPageContent.filters}
        onQueryChange={setQuery}
        onKindChange={setKind}
      />

      <section className="library-list-v4" aria-label="资料列表">
        <div className="library-list__heading">
          <span aria-hidden="true" />
          <strong>所有文件</strong>
          <span aria-hidden="true" />
        </div>
        {visibleRealBooks.map((item) => (
          <button className="library-row-v4 library-row-v4--real" key={item.id} type="button" onClick={() => onOpenRealBook?.(item.id)}>
            <span className="library-row-v4__type library-row-v4__type--资料">
              <Icon name="document" size={19} />
            </span>
            <span className="library-row__content">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="library-row-v4__status">{item.status}</span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {visibleItems.map((item) => (
          <button className="library-row-v4" key={item.id} type="button" onClick={() => onOpenDocument(item.id)}>
            <span className={`library-row-v4__type library-row-v4__type--${item.kind}`}>
              <Icon name={item.icon as IconName} size={19} />
            </span>
            <span className="library-row__content">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <span className={`library-row-v4__status library-row-v4__status--${item.status}`}>{item.id === 'ml-chapter-03' && bookStatusLabel ? bookStatusLabel : item.status}</span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {visibleItems.length === 0 && visibleRealBooks.length === 0 && <p className="library-empty">没有符合条件的资料。</p>}
      </section>
    </section>
  )
}
