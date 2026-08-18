import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import { parseEpub, EpubParseError } from './epubParser.js'

interface EpubChapter {
  id: string
  fileName: string
  body: string
}

/** 程序生成最小 EPUB 夹具：mimetype + container.xml + content.opf + xhtml 章节 */
async function makeEpub(chapters: EpubChapter[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip')
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
  const manifest = chapters
    .map((chapter) => `<item id="${chapter.id}" href="${chapter.fileName}" media-type="application/xhtml+xml"/>`)
    .join('')
  const spine = chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join('')
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <manifest>${manifest}</manifest>
  <spine>${spine}</spine>
</package>`)
  for (const chapter of chapters) {
    zip.file(
      `OEBPS/${chapter.fileName}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter.id}</title></head><body>${chapter.body}</body></html>`,
    )
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

const CHAPTER_ONE = `第一章导论。${'互动学习书把静态教材改造成可对话的学习路径，'.repeat(10)}`
const CHAPTER_TWO = `第二章方法。${'虚拟分页按固定字符目标在段落边界附近截断长文，'.repeat(10)}`

describe('parseEpub', () => {
  it('extracts xhtml chapters in spine order with tags stripped', async () => {
    // spine 顺序与 zip 内文件名字典序相反，验证按 spine 而非文件名排序
    const buf = await makeEpub([
      { id: 'chap-b', fileName: 'b-two.xhtml', body: `<p>${CHAPTER_TWO}</p>` },
      { id: 'chap-a', fileName: 'a-one.xhtml', body: `<p>${CHAPTER_ONE}</p>` },
    ])
    // 重排：spine 里 chap-a 在前
    const zip = await JSZip.loadAsync(buf)
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <manifest><item id="chap-a" href="a-one.xhtml" media-type="application/xhtml+xml"/><item id="chap-b" href="b-two.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chap-a"/><itemref idref="chap-b"/></spine>
</package>`)
    const reordered = await zip.generateAsync({ type: 'nodebuffer' })

    const parsed = await parseEpub(reordered)
    const fullText = parsed.pages.map((page) => page.text).join('\n')
    expect(fullText).toContain('第一章导论')
    expect(fullText).toContain('第二章方法')
    expect(fullText.indexOf('第一章导论')).toBeLessThan(fullText.indexOf('第二章方法'))
    expect(fullText).not.toContain('<p>')
    expect(parsed.pageCount).toBe(parsed.pages.length)
    expect(parsed.pages[0]?.page).toBe(1)
  })

  it('strips script/style blocks and decodes HTML entities', async () => {
    const filler = '实体与脚本剔除测试段落，'.repeat(20)
    const buf = await makeEpub([
      {
        id: 'chap-1',
        fileName: 'one.xhtml',
        body: `<style>body { color: red }</style><p>${filler}</p><script>alert("x")</script><p>5 &lt; 6 &amp; 7 &gt; 4 &quot;q&quot; &#39;s&#39;&nbsp;end</p>`,
      },
    ])

    const parsed = await parseEpub(buf)
    const fullText = parsed.pages.map((page) => page.text).join('\n')
    expect(fullText).not.toContain('alert')
    expect(fullText).not.toContain('color: red')
    expect(fullText).toContain(`5 < 6 & 7 > 4 "q" 's' end`)
  })

  it('throws epub_unreadable for a non-zip buffer', async () => {
    await expect(parseEpub(Buffer.from('definitely not a zip'))).rejects.toMatchObject({
      name: 'EpubParseError',
      code: 'epub_unreadable',
    })
  })

  it('throws epub_unreadable when the epub contains no xhtml content', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip')
    zip.file('META-INF/container.xml', '<container/>')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    await expect(parseEpub(buf)).rejects.toMatchObject({
      name: 'EpubParseError',
      code: 'epub_unreadable',
    })
  })

  it('throws doc_no_text when the extracted text is below the floor', async () => {
    const buf = await makeEpub([{ id: 'chap-1', fileName: 'one.xhtml', body: '<p>太短</p>' }])

    const error = await parseEpub(buf).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(EpubParseError)
    expect((error as EpubParseError).code).toBe('doc_no_text')
  })

  it('throws doc_too_long when the extracted text exceeds the limit', async () => {
    const buf = await makeEpub([{ id: 'chap-1', fileName: 'one.xhtml', body: `<p>${'字'.repeat(45_500)}</p>` }])

    const error = await parseEpub(buf).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(EpubParseError)
    expect((error as EpubParseError).code).toBe('doc_too_long')
  })
})
