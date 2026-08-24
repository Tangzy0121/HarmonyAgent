import type { SVGProps } from 'react'

export type IconName =
  | 'today' | 'library' | 'spark' | 'arrow' | 'clock' | 'book' | 'search' | 'add' | 'close'
  | 'back' | 'check' | 'warning' | 'document' | 'more' | 'chevron' | 'map' | 'list'
  | 'quote' | 'chat' | 'source' | 'bookmark' | 'refresh' | 'archive' | 'upload' | 'menu' | 'calendar'

const paths: Record<IconName, React.ReactNode> = {
  today: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6.5 10.5V20h11v-9.5M10 20v-6h4v6" /></>,
  library: <><path d="M5 4h13a1 1 0 0 1 1 1v14H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" /><path d="M6 16h13M8 8h7" /></>,
  spark: <><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.7L12 15l-1.3-4.3L6.5 9l4.2-1.8L12 3Z" /><path d="m18.5 15 .6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></>,
  add: <><path d="M12 5v14M5 12h14" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  back: <><path d="m14 6-6 6 6 6M8 12h11" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  warning: <><path d="M12 4 3.5 19h17L12 4Z" /><path d="M12 9v4M12 16h.01" /></>,
  document: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h4M9 13h6M9 17h6" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  map: <><path d="m3 6 5-2 8 2 5-2v14l-5 2-8-2-5 2V6Z" /><path d="M8 4v14M16 6v14" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
  quote: <><path d="M5 9h5v5H5zM14 9h5v5h-5z" /><path d="M7 9c0-3 1.5-4.5 3-5M16 9c0-3 1.5-4.5 3-5" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></>,
  source: <><path d="M8 7V4h12v13h-3" /><path d="M4 8h12v12H4zM7 12h6M7 16h4" /></>,
  bookmark: <path d="M7 4h10v16l-5-3-5 3V4Z" />,
  refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
  archive: <><path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 15v5h14v-5" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
}

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>
}
