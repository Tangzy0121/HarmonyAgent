import { Icon } from '../Icon'
import type { MasteryBoardRow, MasteryState } from '../../domain/masteryBoard'

interface MasteryBoardSheetProps {
  rows: MasteryBoardRow[]
  onOpenConcept: (chapterId: string, blockId: string) => void
  onClose: () => void
}

const stateClassName: Record<MasteryState, string> = {
  未学: 'is-unlearned',
  起步: 'is-started',
  掌握中: 'is-learning',
  已掌握: 'is-mastered',
  待复习: 'is-review',
}

/**
 * 掌握度看板：复用 pretest-sheet 外壳，按章分组渲染概念行（label + 状态徽标 + 百分比），
 * 点击行由父级切章并滚动到对应 concept 块。
 */
export function MasteryBoardSheet({ rows, onOpenConcept, onClose }: MasteryBoardSheetProps) {
  // buildMasteryBoard 按章顺序产出行，相邻同章归为一组
  const groups: { chapterId: string; chapterTitle: string; rows: MasteryBoardRow[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.chapterId === row.chapterId) last.rows.push(row)
    else groups.push({ chapterId: row.chapterId, chapterTitle: row.chapterTitle, rows: [row] })
  }

  return (
    <>
      <button
        type="button"
        className="pretest-sheet__scrim"
        aria-label="关闭掌握度看板"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="pretest-sheet mastery-sheet" role="dialog" aria-modal="true" aria-labelledby="mastery-sheet-title">
        <div className="pretest-sheet__grip" aria-hidden="true" />
        <header className="pretest-sheet__heading">
          <div>
            <p>掌握度看板</p>
            <h2 id="mastery-sheet-title">{rows.length > 0 ? `${rows.length} 个概念` : '掌握度看板'}</h2>
          </div>
          <button type="button" className="pretest-sheet__close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="pretest-sheet__status">这本书还没有概念块。</p>
        ) : (
          <div className="mastery-sheet__groups">
            {groups.map((group) => (
              <section key={group.chapterId} className="mastery-sheet__chapter">
                <h3 className="mastery-sheet__chapter-title">{group.chapterTitle}</h3>
                <div className="mastery-sheet__rows">
                  {group.rows.map((row) => (
                    <button
                      key={`${row.blockId}:${row.conceptId}`}
                      type="button"
                      className="mastery-sheet__row"
                      onClick={() => onOpenConcept(row.chapterId, row.blockId)}
                    >
                      <span className="mastery-sheet__label">{row.label}</span>
                      <span className={`mastery-sheet__badge ${stateClassName[row.state]}`}>{row.state}</span>
                      <span className="mastery-sheet__percent">{Math.round(row.mastery * 100)}%</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}
