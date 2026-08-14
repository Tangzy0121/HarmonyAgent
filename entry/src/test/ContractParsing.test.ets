import { describe, expect, it } from '@ohos/hypium'
import { parseBook, parseBookSummaries, parseFeynmanSubmission, parseQuizSubmission } from '../main/ets/network/BookContractParser'

const BOOK_JSON: string = '{' +
  '"id":"book-1","status":"ready","updatedAt":"2026-08-13T10:00:00.000Z",' +
  '"activeChapterId":"ch-1","proposal":{"title":"机器学习入门"},' +
  '"chapters":[{"id":"ch-1","title":"监督学习","order":1,"status":"ready","blocks":[' +
  '{"id":"b1","type":"explanation","title":"解释","body":"正文","keyPoint":"关键"},' +
  '{"id":"b2","type":"concept","title":"概念","concepts":[{"id":"c1","label":"监督信号","description":"目标答案"}]},' +
  '{"id":"b3","type":"example","title":"例子","scenario":"邮件分类","takeaway":"有标签"},' +
  '{"id":"b4","type":"quiz","title":"测验","question":"是否有标签？",' +
  '"options":[{"id":"a","marker":"A","text":"有"},{"id":"b","marker":"B","text":"没有"}],' +
  '"correctAnswerId":"a","feedback":"检查标签"}' +
  ']}]}'

export default function contractParsingTest(): void {
  describe('BookContractParser', () => {
    it('parseBookSummaries_reads_proposal_title_and_updated_order_fields', 0, () => {
      const summaries = parseBookSummaries('[' + BOOK_JSON + ']')

      expect(summaries.length).assertEqual(1)
      expect(summaries[0].title).assertEqual('机器学习入门')
      expect(summaries[0].activeChapterId).assertEqual('ch-1')
    })

    it('parseBook_maps_supported_blocks_without_browser_models', 0, () => {
      const book = parseBook(BOOK_JSON)

      expect(book.chapters[0].blocks.length).assertEqual(4)
      expect(book.chapters[0].blocks[1].conceptLabel).assertEqual('监督信号')
      expect(book.chapters[0].blocks[3].options[1].text).assertEqual('没有')
    })

    it('parseQuizSubmission_preserves_server_mastery_values', 0, () => {
      const submission = parseQuizSubmission('{"attempt":{"isCorrect":false},' +
        '"mastery":{"chapter":0.512821,"concept":0.25},' +
        '"diagnosis":{"type":"concept","advice":"先检查定义"}}')

      expect(submission.isCorrect).assertFalse()
      expect(submission.chapterMastery).assertEqual(0.512821)
      expect(submission.conceptMastery).assertEqual(0.25)
      expect(submission.diagnosis).assertEqual('先检查定义')
    })

    it('parseBook_rejects_missing_proposal_title', 0, () => {
      let rejected: boolean = false
      try {
        parseBook('{"id":"book-1","status":"ready","updatedAt":"x","activeChapterId":"ch-1","chapters":[]}')
      } catch (error) {
        rejected = true
      }
      expect(rejected).assertTrue()
    })

    it('parseFeynmanSubmission_consumes_safe_evidence_projection_and_mastery_fields', 0, () => {
      const submission = parseFeynmanSubmission('{"passed":true,"feedback":"抓住核心",' +
        '"gap":"","evidenceId":"evidence-feynman-1","projectionStatus":"pending",' +
        '"mastery":{"chapter":0.42,"concept":0.31}}')

      expect(submission.evidenceId).assertEqual('evidence-feynman-1')
      expect(submission.projectionStatus).assertEqual('pending')
      expect(submission.chapterMastery).assertEqual(0.42)
      expect(submission.conceptMastery).assertEqual(0.31)
    })

    it('parseFeynmanSubmission_keeps_legacy_nested_evidence_id_compatibility', 0, () => {
      const submission = parseFeynmanSubmission('{"passed":true,"feedback":"抓住核心",' +
        '"gap":"","evidence":{"id":"evidence-legacy-1"},"projectionStatus":"projected"}')

      expect(submission.evidenceId).assertEqual('evidence-legacy-1')
      expect(submission.projectionStatus).assertEqual('projected')
    })

    it('parseFeynmanSubmission_rejects_unknown_projection_state', 0, () => {
      let rejected: boolean = false
      try {
        parseFeynmanSubmission('{"passed":true,"feedback":"抓住核心","gap":"",' +
          '"projectionStatus":"secret_internal_state"}')
      } catch (error) {
        rejected = true
      }

      expect(rejected).assertTrue()
    })
  })
}
