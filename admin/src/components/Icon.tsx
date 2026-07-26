export type IconName =
  | 'today'
  | 'map'
  | 'library'
  | 'agent'
  | 'blossom'
  | 'user'
  | 'search'
  | 'add'
  | 'more'
  | 'minus'
  | 'plus'
  | 'locate'
  | 'close'
  | 'expand'
  | 'arrow'
  | 'back'
  | 'chevron'
  | 'check'
  | 'link'
  | 'document'
  | 'spark'
  | 'history'
  | 'compose'
  | 'scan'
  | 'route'
  | 'network'
  | 'note'
  | 'bookmark'
  | 'quote'
  | 'folder'
  | 'upload'
  | 'filter'
  | 'clock'
  | 'target'
  | 'refresh'

interface IconProps {
  name: IconName
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
    blossom: <g fill="currentColor">
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(72 12 12)" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(144 12 12)" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(216 12 12)" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(288 12 12)" />
      <circle cx="12" cy="12" r="1.35" />
    </g>,
    user: <><circle cx="12" cy="8" r="3.3" {...common} /><path d="M5.5 20c.5-4 2.9-6 6.5-6s6 2 6.5 6" {...common} /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" {...common} /><path d="m15.4 15.4 4.1 4.1" {...common} /></>,
    add: <path d="M12 5v14M5 12h14" {...common} />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    minus: <path d="M5 12h14" {...common} />,
    plus: <path d="M12 5v14M5 12h14" {...common} />,
    locate: <><circle cx="12" cy="12" r="4" {...common} /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" {...common} /></>,
    close: <path d="m6 6 12 12M18 6 6 18" {...common} />,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" {...common} /></>,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" {...common} />,
    back: <path d="m14.5 5-7 7 7 7" {...common} />,
    chevron: <path d="m7 9.5 5 5 5-5" {...common} />,
    check: <path d="m5 12.5 4.2 4.2L19 7" {...common} />,
    link: <><path d="M10.5 13.5 13.5 10" {...common} /><path d="M8.4 16.6 6.8 18.2a3.5 3.5 0 0 1-5-5l3.4-3.4a3.5 3.5 0 0 1 5 0" {...common} /><path d="m15.6 7.4 1.6-1.6a3.5 3.5 0 1 1 5 5l-3.4 3.4a3.5 3.5 0 0 1-5 0" {...common} /></>,
    document: <><path d="M6 3.5h8l4 4v13H6z" {...common} /><path d="M14 3.5v4h4M9 12h6M9 16h6" {...common} /></>,
    spark: <><path d="M12 3.5c.6 4.8 3.2 7.4 8 8-4.8.6-7.4 3.2-8 8-.6-4.8-3.2-7.4-8-8 4.8-.6 7.4-3.2 8-8Z" {...common} /></>,
    history: <><path d="M4.5 8.5V4.5h4" {...common} /><path d="M5 5a8.5 8.5 0 1 1-1.4 9.4" {...common} /><path d="M12 7.5V12l3 2" {...common} /></>,
    compose: <><path d="M13.5 5.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2v-7.5" {...common} /><path d="m12 13 1-3.5L18.5 4a1.4 1.4 0 0 1 2 2L15 11.5Z" {...common} /></>,
    scan: <><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" {...common} /><path d="M7 12h10M9 9h6M9 15h4" {...common} /></>,
    route: <><circle cx="6" cy="17.5" r="2.5" {...common} /><circle cx="18" cy="6.5" r="2.5" {...common} /><path d="M8.5 17.5h2.2a2.3 2.3 0 0 0 2.3-2.3v-6.4a2.3 2.3 0 0 1 2.3-2.3h.2M10 5.5 12 3l2 2.5" {...common} /></>,
    network: <><circle cx="12" cy="5" r="2.5" {...common} /><circle cx="5.5" cy="18" r="2.5" {...common} /><circle cx="18.5" cy="18" r="2.5" {...common} /><path d="m10.8 7.2-4.1 8.6M13.2 7.2l4.1 8.6M8 18h8" {...common} /></>,
    note: <><path d="M6 3.5h12v13L14.5 20H6z" {...common} /><path d="M14.5 20v-3.5H18M9 8h6M9 12h5" {...common} /></>,
    bookmark: <path d="M7 4.5h10v16l-5-3.2-5 3.2z" {...common} />,
    quote: <><path d="M9.5 7H6.8A2.8 2.8 0 0 0 4 9.8V12h5.5v5H4.8" {...common} /><path d="M20 7h-2.7a2.8 2.8 0 0 0-2.8 2.8V12H20v5h-4.7" {...common} /></>,
    folder: <path d="M3.5 6.5h6l2-2h4l2 2h3v12.5h-17z" {...common} />,
    upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" {...common} /><path d="M5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5" {...common} /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" {...common} /><circle cx="8" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="18" r="1.5" fill="currentColor" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" {...common} /><path d="M12 7.5V12l3.2 2" {...common} /></>,
    target: <><circle cx="12" cy="12" r="8.5" {...common} /><circle cx="12" cy="12" r="3.5" {...common} /><path d="M12 3.5V6M20.5 12H18M12 20.5V18M3.5 12H6" {...common} /></>,
    refresh: <><path d="M19.5 8V4.5H16" {...common} /><path d="M18.7 5.5A8.5 8.5 0 0 0 4.2 9M4.5 16v3.5H8" {...common} /><path d="M5.3 18.5A8.5 8.5 0 0 0 19.8 15" {...common} /></>,
  }

  return <svg aria-hidden="true" className="app-icon" height={size} viewBox="0 0 24 24" width={size}>{paths[name]}</svg>
}
