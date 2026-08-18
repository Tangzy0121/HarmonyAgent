import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import { parseDocx } from './docxParser.js'

/** 程序生成最小合法 docx（不提交二进制 fixture，与 pdf-lib 同一策略） */
async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  const body = paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('')
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('parseDocx', () => {
  it('extracts raw text from a valid docx and pages it virtually', async () => {
    const buffer = await makeDocx(['机器学习第一章。'.repeat(50)])

    const doc = await parseDocx(buffer)

    expect(doc.pageCount).toBeGreaterThanOrEqual(1)
    expect(doc.pages[0].text).toContain('机器学习第一章')
  })

  it('rejects a non-docx buffer as docx_unreadable', async () => {
    await expect(parseDocx(Buffer.from('not a docx at all')))
      .rejects.toMatchObject({ code: 'docx_unreadable' })
  })

  it('rejects a docx whose text is below the minimum as doc_no_text', async () => {
    const buffer = await makeDocx(['短'])
    await expect(parseDocx(buffer)).rejects.toMatchObject({ code: 'doc_no_text' })
  })
})
