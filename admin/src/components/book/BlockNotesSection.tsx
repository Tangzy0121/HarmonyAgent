import { useState } from 'react'
import { Icon } from '../Icon'
import type { UserNote } from '../../types/learningBook'

interface BlockNotesSectionProps {
  /** 挂在当前内容块下的用户笔记（真实书：来自服务端 userNotes） */
  notes: UserNote[]
  /** 返回 false 或 reject 视为保存失败（组件显示可重试的错误提示） */
  onAdd: (body: string) => void | Promise<boolean | void>
  onDelete: (noteId: string) => void | Promise<boolean | void>
}

/** 真实书块级用户笔记：列表 + 删除 + 新增。用户数据不参与任何重新生成。 */
export function BlockNotesSection({ notes, onAdd, onDelete }: BlockNotesSectionProps) {
  const [isComposing, setIsComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const save = () => {
    setIsSaving(true)
    setSaveFailed(false)
    Promise.resolve(onAdd(draft.trim()))
      .then((ok) => {
        if (ok === false) {
          setSaveFailed(true)
          return
        }
        setDraft('')
        setIsComposing(false)
      })
      .catch(() => setSaveFailed(true))
      .finally(() => setIsSaving(false))
  }

  return (
    <section className="block-notes" aria-label="我的笔记">
      {notes.map((note) => (
        <article className="block-notes__item" key={note.id}>
          <Icon name="note" size={16} />
          <p>{note.body}</p>
          <button type="button" aria-label="删除这条笔记" onClick={() => { void onDelete(note.id) }}>
            <Icon name="close" size={14} />
          </button>
        </article>
      ))}
      {isComposing ? (
        <div className="block-notes__composer">
          <textarea
            value={draft}
            aria-label="写下这条笔记"
            placeholder="写下你的理解、疑问或例子。笔记属于你的数据，重新生成内容不会覆盖。"
            onChange={(event) => setDraft(event.target.value)}
          />
          {saveFailed && <p role="alert">保存失败，请检查网络后重试。</p>}
          <div>
            <button type="button" className="book-block__primary" disabled={!draft.trim() || isSaving} onClick={save}>保存笔记</button>
            <button type="button" onClick={() => { setIsComposing(false); setDraft(''); setSaveFailed(false) }}>取消</button>
          </div>
        </div>
      ) : (
        <button type="button" className="block-notes__add" onClick={() => setIsComposing(true)}>
          <Icon name="note" size={15} />添加笔记
        </button>
      )}
    </section>
  )
}
