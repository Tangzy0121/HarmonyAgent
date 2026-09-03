import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (name) => readFileSync(new URL(`./styles/${name}`, import.meta.url), 'utf8')

describe('mobile editorial visual system', () => {
  it('pairs a two-line menu trigger with the top-right loci identity', () => {
    const css = readStyle('shell.css')
    const identityRule = css.match(/\.mobile-identity \{[^}]+\}/u)?.[0] ?? ''

    expect(identityRule).toContain('right: var(--page-x)')
    expect(identityRule).toContain('left: var(--page-x)')
    expect(css).toContain('.nav-trigger span:first-child { width: 36px; }')
    expect(css).toContain('.nav-trigger span:last-child { width: 22px; }')
    expect(css).toContain('.nav-menu__list')
    expect(css).not.toContain('.primary-nav')
    expect(css).not.toContain('.profile-button')
  })

  it('keeps the screen pure black, the outside silver, and the visual system flat', () => {
    const css = readStyle('base.css')
    const tokens = readStyle('tokens.css')
    const modules = ['shell.css', 'pages.css', 'workspace.css', 'overlays.css']
      .map(readStyle)
      .join('\n')

    expect(tokens).toContain('--outside: #e9e9ee')
    expect(tokens).toContain('--screen: #000')
    expect(css).toContain('background: var(--screen)')
    expect(css).toContain('background-image: none !important')
    expect(css).toContain('box-shadow: none !important')
    expect(css).toContain('text-shadow: none !important')
    expect(css).toContain('backdrop-filter: none !important')
    expect(modules).not.toMatch(/(?:linear|radial)-gradient/u)
  })

  it('locks Today vertically and snaps learning goals horizontally', () => {
    const css = readStyle('pages.css')
    const todayRule = css.match(/\.page--today \{[^}]+\}/u)?.[0] ?? ''
    const carouselRule = css.match(/\.card-carousel \{[^}]+\}/u)?.[0] ?? ''
    const trackRule = css.match(/\.card-carousel__track \{[^}]+\}/u)?.[0] ?? ''
    const cardRule = css.match(/\.recommendation-hero \{[^}]+\}/u)?.[0] ?? ''

    expect(todayRule).toContain('overflow: hidden')
    expect(carouselRule).toContain('margin-top: auto')
    expect(trackRule).toContain('overflow-x: auto')
    expect(trackRule).toContain('overflow-y: hidden')
    expect(trackRule).toContain('scroll-snap-type: x mandatory')
    expect(trackRule).toContain('touch-action: pan-x')
    expect(trackRule).toContain('height: clamp(300px, 38vh, 330px)')
    expect(cardRule).toContain('scroll-snap-align: start')
    expect(cardRule).toContain('grid-template-rows: auto 126px 44px minmax(0, 1fr) auto')
    expect(cardRule).toContain('background: var(--card-blue)')
    expect(css).toContain('.recommendation-hero--mist { background: var(--card-mist); }')
    expect(css).toContain('.recommendation-hero--stone { background: var(--card-stone); }')
    expect(css).toContain('.week-calendar')
    expect(css).toContain('.today-date-pager')
  })

  it('geometrically centers the library add control', () => {
    const css = readStyle('pages.css')
    const buttonRule = css.match(/\.page--library \.page-header__action \.button \{[^}]+\}/u)?.[0] ?? ''

    expect(buttonRule).toContain('width: 46px')
    expect(buttonRule).toContain('height: 46px')
    expect(buttonRule).toContain('gap: 0')
    expect(css).toContain('.page--library .page-header__action .button > span { display: none; }')
  })

  it('keeps color decorative and controls fully legible in grayscale', () => {
    const tokens = readStyle('tokens.css')
    const shell = readStyle('shell.css')
    const pages = readStyle('pages.css')
    const workspace = readStyle('workspace.css')
    const overlays = readStyle('overlays.css')

    expect(tokens).toContain('--accent: #c8bc40')
    expect(tokens).not.toContain('#dd9a89')
    expect(shell).toContain('.button--accent { color: var(--screen); background: var(--ink); }')
    expect(pages).toContain('.switch-control[aria-checked="true"] { border-color: var(--ink); background: var(--ink); }')
    expect(overlays).toContain('.chat-composer > button')
    expect(overlays).toContain('color: var(--screen); background: var(--ink)')
    expect(workspace).toContain('content: "正确答案"')
    expect(workspace).toContain('content: "你的选择"')
  })

  it('lays out create-flow choices in one compact row', () => {
    const css = readStyle('pages.css')
    const choiceRule = css.match(/\.choice-row \{[^}]+\}/u)?.[0] ?? ''

    expect(choiceRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(choiceRule).toContain('border-bottom: 1px solid var(--line)')
  })
})
