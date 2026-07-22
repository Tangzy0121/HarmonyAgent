import { useMemo, useState } from 'react'
import { MobileTopBar } from '../components/MobileTopBar'
import { Icon } from '../components/Icon'
import { knowledgeLibraryItems } from '../data/prototype'

interface PageProps {
  isActive: boolean
}

export function KnowledgeLibraryPage({ isActive }: PageProps) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'全部' | '资料' | '笔记'>('全部')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const visibleItems = useMemo(() => knowledgeLibraryItems.filter((item) => (
    (kind === '全部' || item.kind === kind) && item.name.includes(query.trim())
  )), [kind, query])

  return (
    <section className="destination-page library-page" hidden={!isActive} aria-labelledby="library-title">
      <MobileTopBar
        title="知识库"
        titleId="library-title"
        subtitle="机器学习基础 · 4 项资料"
        actions={
          <>
            <button type="button" aria-label="搜索资料" onClick={() => setIsSearchOpen((current) => !current)}><Icon name="search" size={20} /></button>
            <button type="button" className="library-import" aria-label="导入资料"><Icon name="add" size={20} /></button>
          </>
        }
      />

      {isSearchOpen && <label className="library-search">
        <span className="sr-only">搜索资料</span>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料、笔记或主题" />
        <button type="button" onClick={() => setQuery('')}>清除</button>
      </label>}

      <article className="library-feature" aria-label="本周重点资料">
        <div className="library-feature__art" aria-hidden="true">
          <span className="library-feature__sheet library-feature__sheet--back" />
          <span className="library-feature__sheet library-feature__sheet--front"><Icon name="document" size={28} /></span>
        </div>
        <div className="library-feature__copy">
          <p>本周重点</p>
          <h2>机器学习<br />第三章</h2>
          <span>24 页 · 已建立 8 个知识节点</span>
        </div>
      </article>

      <div className="library-filters" role="group" aria-label="资料类型筛选">
        {(['全部', '资料', '笔记'] as const).map((item) => (
          <button key={item} className={kind === item ? 'library-filter library-filter--active' : 'library-filter'} type="button" onClick={() => setKind(item)}>{item}</button>
        ))}
      </div>

      <section className="library-list" aria-label="资料列表">
        <div className="library-list__heading">
          <span>最近更新</span>
          <span>{visibleItems.length} 项</span>
        </div>
        {visibleItems.map((item) => (
          <button className="library-row" key={item.id} type="button">
            <span className={`library-row__type library-row__type--${item.kind}`}><Icon name={item.kind === '笔记' ? 'link' : 'document'} size={20} /><small>{item.type}</small></span>
            <span className="library-row__content">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <span className={`library-row__status library-row__status--${item.status}`}>{item.status}</span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {visibleItems.length === 0 && <p className="library-empty">没有符合条件的资料。</p>}
      </section>
    </section>
  )
}
