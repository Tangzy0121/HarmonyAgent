interface MapFilterBarProps {
  value: '全部' | '学习中' | '待复习' | '已掌握'
  onChange: (value: '全部' | '学习中' | '待复习' | '已掌握') => void
}

const filters = ['全部', '学习中', '待复习', '已掌握'] as const

export function MapFilterBar({ value, onChange }: MapFilterBarProps) {
  return (
    <div className="map-filters" role="group" aria-label="学习状态筛选">
      {filters.map((item) => (
        <button
          className={value === item ? 'map-filter map-filter--active' : 'map-filter'}
          key={item}
          type="button"
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}
