import { useMemo, useState } from 'react'
import { LibraryControlPanel } from '../components/library/LibraryControlPanel'
import { Icon, type IconName } from '../components/Icon'
import { libraryPageContent } from '../data/libraryPage'

interface PageProps {
  isActive: boolean
  onOpenDocument: (documentId: string) => void
}

export function KnowledgeLibraryPage({ isActive, onOpenDocument }: PageProps) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'全部' | '资料' | '笔记'>('全部')
  const visibleItems = useMemo(() => libraryPageContent.items.filter((item) => (
    (kind === '全部' || item.kind === kind) && item.name.includes(query.trim())
  )), [kind, query])

  return (
    <section className="destination-page library-page library-page--v4" hidden={!isActive} aria-labelledby="library-title">
      <header className="library-page-heading">
        <div className="library-page-heading__row">
          <h1 id="library-title">{libraryPageContent.title}</h1>
          <button className="library-create" type="button" aria-label="新建资料">
            <Icon name="add" size={20} />
          </button>
        </div>
        <p>{libraryPageContent.subtitle} · {libraryPageContent.items.length} 项资料</p>
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
        {visibleItems.map((item) => (
          <button className="library-row-v4" key={item.id} type="button" onClick={() => onOpenDocument(item.id)}>
            <span className={`library-row-v4__type library-row-v4__type--${item.kind}`}>
              <Icon name={item.icon as IconName} size={19} />
            </span>
            <span className="library-row__content">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <span className={`library-row-v4__status library-row-v4__status--${item.status}`}>{item.status}</span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {visibleItems.length === 0 && <p className="library-empty">没有符合条件的资料。</p>}
      </section>
    </section>
  )
}
