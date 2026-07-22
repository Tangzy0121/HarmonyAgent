interface IconProps {
  name: 'today' | 'map' | 'library' | 'agent' | 'search' | 'add' | 'more' | 'minus' | 'plus' | 'locate' | 'close' | 'expand' | 'arrow' | 'link' | 'document' | 'spark'
  size?: number
  strokeWidth?: number
}

export function Icon({ name, size = 22, strokeWidth = 1.8 }: IconProps) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  }

  const paths = {
    today: <><path d="M5 7.5h14M8 3.5v4M16 3.5v4" {...common} /><rect x="4" y="5" width="16" height="15" rx="4" {...common} /><path d="M8 12h3v3H8z" {...common} /></>,
    map: <><circle cx="6" cy="12" r="2.5" {...common} /><circle cx="17.5" cy="6.5" r="2.5" {...common} /><circle cx="17" cy="18" r="2.5" {...common} /><path d="m8.3 10.8 6.8-3.2M8.4 13.2l6.2 3.5M17.4 9v6.5" {...common} /></>,
    library: <><path d="M5.5 4.5h10a3 3 0 0 1 3 3v12h-10a3 3 0 0 1-3-3z" {...common} /><path d="M8.5 4.5v12a3 3 0 0 0 3 3M11.5 8h4M11.5 11h4" {...common} /></>,
    agent: <><path d="M12 3.5c.7 4.9 3.6 7.8 8.5 8.5-4.9.7-7.8 3.6-8.5 8.5-.7-4.9-3.6-7.8-8.5-8.5 4.9-.7 7.8-3.6 8.5-8.5Z" {...common} /><path d="M19 3v3M20.5 4.5h-3" {...common} /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" {...common} /><path d="m15.4 15.4 4.1 4.1" {...common} /></>,
    add: <path d="M12 5v14M5 12h14" {...common} />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    minus: <path d="M5 12h14" {...common} />,
    plus: <path d="M12 5v14M5 12h14" {...common} />,
    locate: <><circle cx="12" cy="12" r="4" {...common} /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" {...common} /></>,
    close: <path d="m6 6 12 12M18 6 6 18" {...common} />,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" {...common} /></>,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" {...common} />,
    link: <><path d="M10.5 13.5 13.5 10" {...common} /><path d="M8.4 16.6 6.8 18.2a3.5 3.5 0 0 1-5-5l3.4-3.4a3.5 3.5 0 0 1 5 0" {...common} /><path d="m15.6 7.4 1.6-1.6a3.5 3.5 0 1 1 5 5l-3.4 3.4a3.5 3.5 0 0 1-5 0" {...common} /></>,
    document: <><path d="M6 3.5h8l4 4v13H6z" {...common} /><path d="M14 3.5v4h4M9 12h6M9 16h6" {...common} /></>,
    spark: <><path d="M12 3.5c.6 4.8 3.2 7.4 8 8-4.8.6-7.4 3.2-8 8-.6-4.8-3.2-7.4-8-8 4.8-.6 7.4-3.2 8-8Z" {...common} /></>,
  }

  return <svg aria-hidden="true" className="app-icon" height={size} viewBox="0 0 24 24" width={size}>{paths[name]}</svg>
}
