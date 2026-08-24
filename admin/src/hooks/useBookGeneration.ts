import { useCallback, useEffect, useRef, useState } from 'react'

import { streamChapterGeneration } from '../services/bookApi'
import type { BookBlock, ChapterStatus } from '../types/learningBook'

export interface BookGenerationProgress {
  chapterId: string
  blocksReceived: number
}

/** 钩子向父层上报的书籍状态变迁；父层负责把事件落到 learningBook 状态。 */
export type BookGenerationEvent =
  | { type: 'chapter_start'; chapterId: string }
  | { type: 'block'; chapterId: string; block: BookBlock }
  | { type: 'chapter_done'; chapterId: string }
  | { type: 'chapter_error'; chapterId: string; code: string; message: string }

export interface UseBookGenerationOptions {
  /** null 表示当前不在真实书场景：钩子惰性，且会中断进行中的流。 */
  bookId: string | null
  chapters: ReadonlyArray<{ id: string; status: ChapterStatus }>
  onEvent: (event: BookGenerationEvent) => void
}

export interface UseBookGenerationResult {
  start: () => void
  retryChapter: (chapterId: string) => void
  progress: BookGenerationProgress | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * 真实学习书的渐进生成编排：确认目录后从第一章起顺序触发生成，
 * 同时至多一章在流；单章失败记入书状态后继续后续章节；
 * bookId 失效（离开书页/切 hash）或 unmount 时 abort 进行中的请求。
 */
export function useBookGeneration({ bookId, chapters, onEvent }: UseBookGenerationOptions): UseBookGenerationResult {
  const [progress, setProgress] = useState<BookGenerationProgress | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const chaptersRef = useRef(chapters)
  const onEventRef = useRef(onEvent)
  chaptersRef.current = chapters
  onEventRef.current = onEvent

  const runQueue = useCallback(async (queue: string[]) => {
    const activeBookId = bookId
    if (activeBookId === null || runningRef.current || queue.length === 0) return
    runningRef.current = true
    try {
      for (const chapterId of queue) {
        const controller = new AbortController()
        controllerRef.current = controller
        let failed = false
        setProgress({ chapterId, blocksReceived: 0 })
        try {
          await streamChapterGeneration(activeBookId, chapterId, {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === 'chapter_start') {
                onEventRef.current({ type: 'chapter_start', chapterId })
              } else if (event.type === 'block') {
                onEventRef.current({ type: 'block', chapterId, block: event.block })
                setProgress((current) => current && current.chapterId === chapterId
                  ? { chapterId, blocksReceived: current.blocksReceived + 1 }
                  : current)
              } else if (event.type === 'error') {
                failed = true
                onEventRef.current({ type: 'chapter_error', chapterId, code: event.code, message: event.message })
              }
              // chapter_done 由流正常结束统一上报，避免重复
            },
          })
          if (!failed) onEventRef.current({ type: 'chapter_done', chapterId })
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return
          onEventRef.current({
            type: 'chapter_error',
            chapterId,
            code: error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'chapter_generation_failed',
            message: '本章生成失败，可以稍后重试。',
          })
        }
      }
    } finally {
      runningRef.current = false
      controllerRef.current = null
      setProgress(null)
    }
  }, [bookId])

  const start = useCallback(() => {
    const queue = chaptersRef.current
      .filter((chapter) => chapter.status === 'pending')
      .map((chapter) => chapter.id)
    void runQueue(queue)
  }, [runQueue])

  const retryChapter = useCallback((chapterId: string) => {
    const rest = chaptersRef.current
      .filter((chapter) => chapter.status === 'pending' && chapter.id !== chapterId)
      .map((chapter) => chapter.id)
    void runQueue([chapterId, ...rest])
  }, [runQueue])

  useEffect(() => {
    if (bookId === null) {
      controllerRef.current?.abort()
      setProgress(null)
    }
    return () => {
      controllerRef.current?.abort()
    }
  }, [bookId])

  return { start, retryChapter, progress }
}
