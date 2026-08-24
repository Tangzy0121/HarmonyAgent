import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'

import { mockProjects, mockRecommendations } from '../data/mockData'
import type {
  ChatMessage,
  ChatScope,
  CreateDraft,
  LearningProject,
  PrimaryDestination,
  ProjectFilter,
  Recommendation,
  Screen,
  SourceAnchor,
  WorkspaceMode,
} from '../types/product'

interface PrototypeState {
  screen: Screen
  destination: PrimaryDestination
  projects: LearningProject[]
  activeProjectId: string
  activeChapterId: string
  projectFilter: ProjectFilter
  workspaceMode: WorkspaceMode
  recommendationIndex: number
  dismissedNoticeIds: string[]
  createDraft: CreateDraft
  chapterMenuOpen: boolean
  chat: {
    open: boolean
    scope: ChatScope
    label: string
    messages: ChatMessage[]
  }
  source: { open: boolean; anchorId: string | null }
}

type Action =
  | { type: 'navigate'; destination: PrimaryDestination }
  | { type: 'screen'; screen: Screen }
  | { type: 'open_project'; projectId: string }
  | { type: 'open_workspace'; projectId?: string; chapterId?: string }
  | { type: 'set_chapter'; chapterId: string }
  | { type: 'set_mode'; mode: WorkspaceMode }
  | { type: 'set_filter'; filter: ProjectFilter }
  | { type: 'rotate_recommendation' }
  | { type: 'dismiss_notice'; noticeId: string }
  | { type: 'patch_draft'; patch: Partial<CreateDraft> }
  | { type: 'create_plan' }
  | { type: 'update_plan'; project: LearningProject }
  | { type: 'confirm_plan' }
  | { type: 'retry_project' }
  | { type: 'toggle_chapters'; open?: boolean }
  | { type: 'open_chat'; scope: ChatScope; label: string }
  | { type: 'close_chat' }
  | { type: 'send_chat'; body: string }
  | { type: 'open_source'; anchorId: string }
  | { type: 'close_source' }

const initialMessages: ChatMessage[] = [
  {
    id: 'chat-welcome',
    role: 'assistant',
    body: '我会基于当前作用域回答，并把关键判断连接回资料。你也可以让我比较概念、解释选中文字或提出一个需要确认的学习动作。',
  },
]

const initialState: PrototypeState = {
  screen: 'today',
  destination: 'today',
  projects: mockProjects,
  activeProjectId: 'project-ml',
  activeChapterId: 'chapter-loss',
  projectFilter: 'active',
  workspaceMode: 'content',
  recommendationIndex: 0,
  dismissedNoticeIds: [],
  createDraft: { file: null, goal: '', level: '入门', depth: '系统学习' },
  chapterMenuOpen: false,
  chat: { open: false, scope: 'learning_overview', label: '学习概况', messages: initialMessages },
  source: { open: false, anchorId: null },
}

function targetScreen(project: LearningProject): Screen {
  if (project.status === 'draft') return 'create'
  if (project.status === 'plan_ready') return 'plan'
  if (project.status === 'blocked' || project.status === 'preparing' || project.status === 'archived') return 'overview'
  if (project.status === 'completed') return 'summary'
  return 'workspace'
}

function planFromDraft(state: PrototypeState): LearningProject {
  const template = structuredClone(state.projects.find((project) => project.id === 'project-hcai') ?? state.projects[0])
  const file = state.createDraft.file
  const title = file?.name.replace(/\.(pdf|md|markdown|docx)$/iu, '') || '新的学习项目'
  return {
    ...template,
    id: 'project-new',
    title,
    goal: state.createDraft.goal || '理解这份资料的核心框架，并能在真实问题中应用。',
    level: state.createDraft.level,
    depth: state.createDraft.depth,
    status: 'plan_ready',
    lastStudiedLabel: '刚刚',
    source: {
      id: 'doc-new',
      name: file?.name ?? '示例学习资料.pdf',
      format: file?.format ?? 'PDF',
      size: file?.size ?? '2.4 MB',
      units: file?.format === 'Markdown' ? '9 节' : '18 页',
    },
    notice: undefined,
  }
}

function reducer(state: PrototypeState, action: Action): PrototypeState {
  switch (action.type) {
    case 'navigate':
      return { ...state, destination: action.destination, screen: action.destination, chapterMenuOpen: false }
    case 'screen':
      return { ...state, screen: action.screen, chapterMenuOpen: false }
    case 'open_project': {
      const project = state.projects.find((entry) => entry.id === action.projectId)
      if (!project) return state
      return {
        ...state,
        activeProjectId: project.id,
        activeChapterId: project.lastChapterId,
        screen: targetScreen(project),
        workspaceMode: 'content',
        chapterMenuOpen: false,
        createDraft: project.status === 'draft'
          ? { file: { name: project.source.name, format: project.source.format, size: project.source.size }, goal: '', level: project.level, depth: project.depth }
          : state.createDraft,
      }
    }
    case 'open_workspace': {
      const project = state.projects.find((entry) => entry.id === (action.projectId ?? state.activeProjectId))
      if (!project) return state
      return {
        ...state,
        activeProjectId: project.id,
        activeChapterId: action.chapterId ?? project.lastChapterId,
        screen: 'workspace',
        workspaceMode: 'content',
        chapterMenuOpen: false,
      }
    }
    case 'set_chapter':
      return { ...state, activeChapterId: action.chapterId, workspaceMode: 'content', chapterMenuOpen: false }
    case 'set_mode':
      return { ...state, workspaceMode: action.mode }
    case 'set_filter':
      return { ...state, projectFilter: action.filter }
    case 'rotate_recommendation':
      return { ...state, recommendationIndex: (state.recommendationIndex + 1) % mockRecommendations.length }
    case 'dismiss_notice':
      return { ...state, dismissedNoticeIds: [...state.dismissedNoticeIds, action.noticeId] }
    case 'patch_draft':
      return { ...state, createDraft: { ...state.createDraft, ...action.patch } }
    case 'create_plan': {
      const project = planFromDraft(state)
      const projects = [project, ...state.projects.filter((entry) => entry.id !== project.id)]
      return { ...state, projects, activeProjectId: project.id, activeChapterId: project.lastChapterId, screen: 'plan' }
    }
    case 'update_plan':
      return { ...state, projects: state.projects.map((project) => project.id === action.project.id ? action.project : project) }
    case 'confirm_plan': {
      const projects = state.projects.map((project) => {
        if (project.id !== state.activeProjectId) return project
        return {
          ...project,
          status: 'active' as const,
          notice: { id: `notice-${project.id}`, tone: 'info' as const, title: '第一章已经可以阅读', detail: '后续章节会继续生成，你可以随时离开并从学习库恢复。', actionLabel: '开始第一章' },
          chapters: project.chapters.map((chapter, index) => ({ ...chapter, taskState: index === 0 ? 'ready' as const : index === 1 ? 'running' as const : 'pending' as const })),
        }
      })
      const project = projects.find((entry) => entry.id === state.activeProjectId)!
      return { ...state, projects, activeChapterId: project.chapters[0].id, screen: 'workspace' }
    }
    case 'retry_project':
      return {
        ...state,
        projects: state.projects.map((project) => project.id === state.activeProjectId
          ? {
              ...project,
              status: 'active' as const,
              notice: { id: `retry-${project.id}`, tone: 'info' as const, title: '正在从失败章节继续', detail: '已有章节和学习记录保持不变。完成后会在学习库提示。', actionLabel: '阅读已有章节' },
              chapters: project.chapters.map((chapter) => chapter.taskState === 'failed' ? { ...chapter, taskState: 'running' as const } : chapter),
            }
          : project),
      }
    case 'toggle_chapters':
      return { ...state, chapterMenuOpen: action.open ?? !state.chapterMenuOpen }
    case 'open_chat':
      return { ...state, chat: { ...state.chat, open: true, scope: action.scope, label: action.label } }
    case 'close_chat':
      return { ...state, chat: { ...state.chat, open: false } }
    case 'send_chat': {
      const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', body: action.body }
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        body: '这里要先区分“训练中的反馈”和“训练后的评估”。损失函数负责告诉模型当前预测偏差有多大；独立评估则检查这种规律能否迁移到未见数据。两者相互关联，但不能互相替代。',
        sourceIds: ['src-loss', 'src-eval'],
      }
      return { ...state, chat: { ...state.chat, messages: [...state.chat.messages, userMessage, assistantMessage] } }
    }
    case 'open_source':
      return { ...state, source: { open: true, anchorId: action.anchorId } }
    case 'close_source':
      return { ...state, source: { open: false, anchorId: null } }
  }
}

interface PrototypeContextValue {
  state: PrototypeState
  activeProject: LearningProject
  activeRecommendation: Recommendation
  activeAnchor: SourceAnchor | null
  dispatch: Dispatch<Action>
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null)

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0]
  const activeRecommendation = mockRecommendations[state.recommendationIndex]
  const activeAnchor = activeProject.anchors.find((anchor) => anchor.id === state.source.anchorId) ?? null
  const value = useMemo(() => ({ state, activeProject, activeRecommendation, activeAnchor, dispatch }), [state, activeProject, activeRecommendation, activeAnchor])
  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototype(): PrototypeContextValue {
  const value = useContext(PrototypeContext)
  if (!value) throw new Error('usePrototype must be used inside PrototypeProvider')
  return value
}
