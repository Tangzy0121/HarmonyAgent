import { useState, type ChangeEvent } from 'react'

import type { LearningGoal, LearnerLevel } from '../../types/learningBook'
import { Icon } from '../Icon'

export interface UploadBookSubmission {
  file: File
  goal: LearningGoal
  learnerLevel: LearnerLevel
}

interface UploadBookSheetProps {
  onSubmit: (input: UploadBookSubmission) => void | Promise<void>
  onClose: () => void
  /** 上传/建书失败文案（父层按 BookApiError.code 映射后传入）；面板保持打开 */
  errorMessage?: string | null
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
const GOALS: readonly LearningGoal[] = ['理解概念', '课程学习', '考试复习']
const LEVELS: readonly LearnerLevel[] = ['入门', '了解', '熟悉']

function formatLabelFor(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown'
  if (lower.endsWith('.docx')) return 'DOCX'
  if (lower.endsWith('.epub')) return 'EPUB'
  return 'PDF'
}

function formatSizeLabel(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.ceil(sizeBytes / 1024))} KB`
}

export function UploadBookSheet({ onSubmit, onClose, errorMessage = null }: UploadBookSheetProps) {
  const [file, setFile] = useState<File | null>(null)
  const [goal, setGoal] = useState<LearningGoal | null>(null)
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel | null>(null)
  const [tooLarge, setTooLarge] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = file !== null && goal !== null && learnerLevel !== null && !tooLarge && !submitting

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    setTooLarge(next !== null && next.size > MAX_FILE_SIZE_BYTES)
  }

  const handleSubmit = () => {
    if (!canSubmit || file === null || goal === null || learnerLevel === null) return
    setSubmitting(true)
    try {
      void Promise.resolve(onSubmit({ file, goal, learnerLevel }))
        .catch(() => undefined)
        .finally(() => setSubmitting(false))
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="upload-book-sheet__scrim"
        aria-label="关闭上传面板"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="upload-book-sheet" role="dialog" aria-modal="true" aria-labelledby="upload-book-sheet-title">
        <div className="upload-book-sheet__grip" aria-hidden="true" />
        <header className="upload-book-sheet__heading">
          <div>
            <p>学习资料</p>
            <h2 id="upload-book-sheet-title">上传学习资料</h2>
          </div>
          <button type="button" className="upload-book-sheet__close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <label className="upload-book-sheet__file">
          <input
            type="file"
            accept="application/pdf,.pdf,text/markdown,.md,.markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/epub+zip,.epub"
            aria-label="选择学习资料文件"
            onChange={handleFileChange}
          />
          {file === null ? (
            <span className="upload-book-sheet__file-placeholder">
              <Icon name="upload" size={20} />
              <strong>选择 PDF / Markdown / DOCX / EPUB 文件</strong>
              <small>单个文件，不超过 20MB</small>
            </span>
          ) : (
            <span className="upload-book-sheet__file-info">
              <Icon name="document" size={20} />
              <span>
                <strong>{file.name}</strong>
                <small>{formatSizeLabel(file.size)} · {formatLabelFor(file.name)}</small>
              </span>
            </span>
          )}
        </label>
        {tooLarge && (
          <p className="upload-book-sheet__error" role="alert">
            文件超过 20MB 上限，请压缩或拆分后再上传。
          </p>
        )}

        <section className="upload-book-sheet__group" aria-label="学习目标">
          <h3>学习目标</h3>
          <div className="upload-book-sheet__options" role="group" aria-label="学习目标选项">
            {GOALS.map((option) => (
              <button
                key={option}
                type="button"
                className="upload-book-sheet__option"
                aria-pressed={goal === option}
                onClick={() => setGoal(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        <section className="upload-book-sheet__group" aria-label="基础水平">
          <h3>基础水平</h3>
          <div className="upload-book-sheet__options" role="group" aria-label="基础水平选项">
            {LEVELS.map((option) => (
              <button
                key={option}
                type="button"
                className="upload-book-sheet__option"
                aria-pressed={learnerLevel === option}
                onClick={() => setLearnerLevel(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        <p className="upload-book-sheet__note">
          文件将上传至云端解析，用于生成互动学习书；原始文件与解析结果可随时在知识库删除。DOCX 与 EPUB 中的图片与表格样式不会保留。
        </p>

        {errorMessage && (
          <p className="upload-book-sheet__error" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          className="upload-book-sheet__submit"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? '上传中…' : '开始生成学习书'}
        </button>
      </aside>
    </>
  )
}
