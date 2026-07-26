import { Icon } from '../Icon'
import { LociGlass } from '../LociGlass'
import { lociGlassPresets } from '../../types/materials'

type LibraryKind = '全部' | '资料' | '笔记'

interface LibraryControlPanelProps {
  query: string
  kind: LibraryKind
  filters: readonly LibraryKind[]
  onQueryChange: (query: string) => void
  onKindChange: (kind: LibraryKind) => void
}

export function LibraryControlPanel({
  query,
  kind,
  filters,
  onQueryChange,
  onKindChange,
}: LibraryControlPanelProps) {
  return (
    <div className="library-controls">
      <LociGlass
        className="loci-glass--smoke-reference library-control-panel"
        interactive={false}
        spec={{ ...lociGlassPresets.refractive, cornerRadius: 23, interactionStrength: 0 }}
      >
        <div className="library-control-panel__search">
          <Icon name="search" size={19} />
          <label>
            <span className="sr-only">搜索资料</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索资料、笔记或主题"
            />
          </label>
          {query && (
            <button type="button" onClick={() => onQueryChange('')}>清除</button>
          )}
        </div>
      </LociGlass>
      <div className="library-control-panel__filters" role="group" aria-label="资料类型筛选">
        {filters.map((filter) => (
          <button
            key={filter}
            className={kind === filter ? 'library-control-panel__filter library-control-panel__filter--active' : 'library-control-panel__filter'}
            type="button"
            aria-pressed={kind === filter}
            onClick={() => onKindChange(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  )
}
