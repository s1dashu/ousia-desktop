import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
} from "react"
import {
  Add01Icon,
  ArrowUp02Icon,
  Delete02Icon,
  Folder01Icon,
  FolderAddIcon,
  LayoutRightIcon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown, Plus, X } from "lucide-react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import {
  CodeSquareBoldDuotone,
  GlobalBoldDuotone,
  MonitorBoldDuotone,
  Widget6BoldDuotone,
} from "solar-icon-set"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  OusiaChatEvent,
  OusiaChatHistoryItem,
  OusiaRuntimeWidgetsResult,
  OusiaTextChatItem,
  OusiaThinkingLevel,
} from "@/electron/chat-types"
import { WidgetSlot } from "@/widgets/WidgetSlot"
import { widgetsBySlot } from "@/widgets/registry"
import { runtimeWidgetsToDefinitions } from "@/widgets/runtime"
import type { WidgetContext } from "@/widgets/types"

type SessionRecord = {
  id: string
  title: string
  time: string
}

type ProjectRecord = {
  id: string
  name: string
  path: string
  sessions: SessionRecord[]
}

const PROJECTS_STORAGE_KEY = "ousia.projects.v1"
const SETTINGS_STORAGE_KEY = "ousia.settings.v1"
const SELECTION_STORAGE_KEY = "ousia.selection.v1"
const DEFAULT_WORKSPACE_WIDGET_ID = "workspace.browser"
const REMOVED_DEFAULT_WORKSPACE_WIDGET_IDS = new Set(["custom.widget-overview"])

type AppSettings = {
  defaultWorkDir: string
  thinkingLevel: OusiaThinkingLevel
  modelProvider: string
  modelId: string
  modelApiKey: string
}

type InitialAppState = {
  settings: AppSettings
  projects: ProjectRecord[]
  selectedProjectId: string
  selectedSessionId: string
  selectedWorkspaceWidgetId: string
  workspaceTabsBySession: Record<string, WorkspaceTabsState>
}

type WorkspaceTab = {
  id: string
  widgetId: string | null
}

type WorkspaceTabsState = {
  activeTabId: string
  tabs: WorkspaceTab[]
}

type StoredSelection = {
  selectedProjectId?: string
  selectedSessionId?: string
  selectedWorkspaceWidgetId?: string
  workspaceTabsBySession?: Record<string, WorkspaceTabsState>
}

const defaultSettings: AppSettings = {
  defaultWorkDir: "~/Desktop",
  thinkingLevel: "medium",
  modelProvider: "deepseek",
  modelId: "deepseek-v4-flash",
  modelApiKey: "",
}

const modelPresets: Array<{
  provider: string
  modelId: string
  label: string
  description: string
}> = [
  {
    provider: "deepseek",
    modelId: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "Current default. Fast DeepSeek coding model.",
  },
  {
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "Deeper DeepSeek model for harder changes.",
  },
  {
    provider: "anthropic",
    modelId: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    description: "Anthropic model for complex coding work.",
  },
  {
    provider: "openai",
    modelId: "gpt-5.2",
    label: "GPT-5.2",
    description: "OpenAI model for broad coding and reasoning work.",
  },
  {
    provider: "google",
    modelId: "gemini-3-pro-preview",
    label: "Gemini 3 Pro Preview",
    description: "Google model when Gemini auth is configured.",
  },
]

function modelPresetValue(provider: string, modelId: string) {
  return `${provider}/${modelId}`
}

function findModelPreset(provider: string, modelId: string) {
  return modelPresets.find(
    (preset) => preset.provider === provider && preset.modelId === modelId
  )
}

const thinkingLevels: Array<{
  label: string
  value: OusiaThinkingLevel
  description: string
}> = [
  { label: "Off", value: "off", description: "Disable reasoning output." },
  {
    label: "Minimal",
    value: "minimal",
    description: "Smallest reasoning budget.",
  },
  {
    label: "Low",
    value: "low",
    description: "Light reasoning for simple tasks.",
  },
  {
    label: "Medium",
    value: "medium",
    description: "Balanced default for coding work.",
  },
  {
    label: "High",
    value: "high",
    description: "Deeper reasoning for complex changes.",
  },
  {
    label: "XHigh",
    value: "xhigh",
    description: "Maximum reasoning when supported.",
  },
]

const MIN_SIDEBAR_WIDTH = 200
const SIDEBAR_COLLAPSE_THRESHOLD = 120
const MAX_SIDEBAR_WIDTH = 360
const MIN_CHAT_WIDTH = 340
const MIN_WORKSPACE_WIDTH = 360

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createSession(title = "新会话"): SessionRecord {
  return {
    id: createId("session"),
    title,
    time: "now",
  }
}

function projectNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function createDefaultProject(settings: AppSettings): ProjectRecord {
  return {
    id: "default-workdir",
    name: projectNameFromPath(settings.defaultWorkDir),
    path: settings.defaultWorkDir,
    sessions: [createSession()],
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return defaultSettings
    }
    return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    return defaultSettings
  }
}

function loadProjects(settings: AppSettings) {
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY)
    if (!raw) {
      return [createDefaultProject(settings)]
    }
    const parsed = JSON.parse(raw) as ProjectRecord[]
    return Array.isArray(parsed) ? parsed : [createDefaultProject(settings)]
  } catch {
    return [createDefaultProject(settings)]
  }
}

function resolveSelection(
  projects: ProjectRecord[],
  selection?: StoredSelection
) {
  const selectedProject =
    projects.find((project) => project.id === selection?.selectedProjectId) ??
    projects[0]
  const selectedSession =
    selectedProject?.sessions.find(
      (session) => session.id === selection?.selectedSessionId
    ) ?? selectedProject?.sessions[0]

  return {
    selectedProjectId: selectedProject?.id ?? "",
    selectedSessionId: selectedSession?.id ?? "",
    selectedWorkspaceWidgetId:
      selection?.selectedWorkspaceWidgetId ?? DEFAULT_WORKSPACE_WIDGET_ID,
    workspaceTabsBySession: selection?.workspaceTabsBySession ?? {},
  }
}

function loadSelection() {
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY)
    if (!raw) {
      return undefined
    }
    return JSON.parse(raw) as StoredSelection
  } catch {
    return undefined
  }
}

function loadInitialAppState(): InitialAppState {
  const settings = loadSettings()
  const projects = loadProjects(settings)
  const selection = resolveSelection(projects, loadSelection())
  return {
    settings,
    projects,
    ...selection,
  }
}

function chatKey(projectId: string, sessionId: string) {
  return `${projectId}::${sessionId}`
}

type TextChatItem = OusiaTextChatItem
type ChatItem = OusiaChatHistoryItem

function formatToolPayload(value: unknown) {
  if (value === undefined) {
    return ""
  }
  if (typeof value === "string") {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function applyChatEvent(items: ChatItem[], event: OusiaChatEvent): ChatItem[] {
  const next = [...items]
  const upsertText = (
    id: string,
    role: "assistant" | "thinking",
    update: (item: TextChatItem) => void
  ) => {
    const index = next.findIndex((item) => item.id === id)
    if (index >= 0) {
      const item = next[index]
      if (item.role === "assistant" || item.role === "thinking") {
        const updated: TextChatItem = { ...item }
        update(updated)
        next[index] = updated
      }
      return
    }
    const created: TextChatItem = {
      id,
      role,
      text: "",
      status: "streaming",
    }
    update(created)
    next.push(created)
  }

  if (event.type === "user_message") {
    next.push({ id: event.id, role: "user", text: event.text })
  } else if (event.type === "assistant_text_start") {
    upsertText(event.id, "assistant", (item) => {
      item.status = "streaming"
    })
  } else if (event.type === "assistant_text_delta") {
    upsertText(event.id, "assistant", (item) => {
      item.text += event.delta
      item.status = "streaming"
    })
  } else if (event.type === "assistant_text_end") {
    upsertText(event.id, "assistant", (item) => {
      item.text = event.text ?? item.text
      item.status = "finished"
    })
  } else if (event.type === "thinking_start") {
    upsertText(event.id, "thinking", (item) => {
      item.status = "streaming"
    })
  } else if (event.type === "thinking_delta") {
    upsertText(event.id, "thinking", (item) => {
      item.text += event.delta
      item.status = "streaming"
    })
  } else if (event.type === "thinking_end") {
    upsertText(event.id, "thinking", (item) => {
      item.text = event.text ?? item.text
      item.status = "finished"
    })
  } else if (event.type === "tool_start") {
    next.push({
      id: event.id,
      role: "tool",
      name: event.name,
      text: formatToolPayload(event.args),
      status: "running",
    })
  } else if (event.type === "tool_update") {
    const index = next.findIndex((item) => item.id === event.id)
    if (index >= 0 && next[index].role === "tool") {
      next[index] = {
        ...next[index],
        text: formatToolPayload(event.value) || next[index].text,
      }
    }
  } else if (event.type === "tool_end") {
    const index = next.findIndex((item) => item.id === event.id)
    if (index >= 0 && next[index].role === "tool") {
      next[index] = {
        ...next[index],
        name: event.name ?? next[index].name,
        text: formatToolPayload(event.result) || next[index].text,
        status: event.isError ? "failed" : "finished",
      }
    }
  } else if (event.type === "run_status") {
    if (event.text) {
      next.push({
        id: `status-${event.timestamp}`,
        role: "system",
        text: event.text,
      })
    }
  } else if (event.type === "error") {
    next.push({ id: event.id, role: "error", text: event.text })
  }

  return next
}

function formatToolName(name: string) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Tool"
}

function TitleBarTrafficLightSlot({ isFullscreen }: { isFullscreen: boolean }) {
  return (
    <div className="flex w-[104px] shrink-0 items-center">
      {isFullscreen ? (
        <span className="truncate text-sm font-semibold tracking-normal text-foreground">
          Ousia
        </span>
      ) : null}
    </div>
  )
}

function Sidebar({
  onCreateSession,
  onDeleteProject,
  onDeleteSession,
  onOpenProject,
  onOpenSettings,
  onRenameSession,
  onSelectSession,
  projects,
  selectedProjectId,
  selectedSessionId,
  isWindowFullscreen,
  style,
}: {
  onCreateSession: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
  onDeleteSession: (projectId: string, sessionId: string) => void
  onOpenProject: () => void
  onOpenSettings: () => void
  onRenameSession: (projectId: string, sessionId: string) => void
  onSelectSession: (projectId: string, sessionId: string) => void
  projects: ProjectRecord[]
  selectedProjectId: string
  selectedSessionId: string
  isWindowFullscreen: boolean
  style: CSSProperties
}) {
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (!openSessionMenuId) {
      return
    }

    function closeMenu() {
      setOpenSessionMenuId(null)
    }

    document.addEventListener("pointerdown", closeMenu)
    return () => document.removeEventListener("pointerdown", closeMenu)
  }, [openSessionMenuId])

  return (
    <aside
      className="flex min-h-0 shrink-0 flex-col bg-sidebar text-sidebar-foreground"
      style={style}
    >
      <div className="window-drag flex h-12 shrink-0 items-center border-b px-4">
        <TitleBarTrafficLightSlot isFullscreen={isWindowFullscreen} />
      </div>

      <div className="ousia-hover-scrollbar min-h-0 flex-1 overflow-auto px-1.5 pb-2">
        <div className="flex items-center justify-between px-1.5 pt-2 pb-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            Projects
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Open project"
            onClick={onOpenProject}
          >
            <HugeiconsIcon
              icon={FolderAddIcon}
              className="text-muted-foreground"
              size={16}
              strokeWidth={1.8}
            />
          </Button>
        </div>
        <div className="space-y-1">
          {projects.map((project, index) => (
            <section key={project.id} className="py-1">
              <div className="project-row grid h-7 w-full min-w-0 grid-cols-[22px_minmax(0,1fr)_24px_24px] items-center gap-1 rounded-md px-1.5 text-muted-foreground">
                <HugeiconsIcon
                  icon={Folder01Icon}
                  className={[
                    "size-4 shrink-0 justify-self-center",
                    index === 0
                      ? "text-muted-foreground"
                      : "text-muted-foreground",
                  ].join(" ")}
                  size={16}
                  strokeWidth={1.8}
                />
                <button
                  type="button"
                  className="min-w-0 truncate text-left text-sm hover:text-accent-foreground"
                  title={project.path}
                  onClick={() => {
                    const firstSession = project.sessions[0]
                    onSelectSession(project.id, firstSession?.id ?? "")
                  }}
                >
                  {project.name}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="project-row-action opacity-0 transition-opacity"
                  aria-label={`Remove ${project.name} from Ousia`}
                  onClick={() => onDeleteProject(project.id)}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    className="text-muted-foreground"
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`New session in ${project.name}`}
                  onClick={() => onCreateSession(project.id)}
                >
                  <HugeiconsIcon
                    icon={Add01Icon}
                    className="text-muted-foreground"
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              </div>
              <div className="mt-0.5 space-y-0.5 pl-[30px]">
                {project.sessions.length ? (
                  project.sessions.map((session) => (
                    <div
                      key={session.id}
                      className={[
                        "group/session relative grid h-8 w-full grid-cols-[minmax(0,1fr)_24px] items-center gap-1 rounded-lg px-1.5 text-sm text-muted-foreground hover:text-accent-foreground",
                        project.id === selectedProjectId &&
                        session.id === selectedSessionId
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className="min-w-0 truncate text-left"
                        onClick={() => {
                          setOpenSessionMenuId(null)
                          onSelectSession(project.id, session.id)
                        }}
                      >
                        {session.title}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={[
                          "opacity-0 transition-opacity group-hover/session:opacity-100",
                          openSessionMenuId === session.id ? "opacity-100" : "",
                        ].join(" ")}
                        aria-expanded={openSessionMenuId === session.id}
                        aria-label={`More actions for ${session.title}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenSessionMenuId((current) =>
                            current === session.id ? null : session.id
                          )
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
                          className="text-muted-foreground"
                          size={16}
                          strokeWidth={1.8}
                        />
                      </Button>
                      {openSessionMenuId === session.id ? (
                        <div
                          className="absolute top-8 right-1 z-20 w-32 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              setOpenSessionMenuId(null)
                              onRenameSession(project.id, session.id)
                            }}
                          >
                            <HugeiconsIcon
                              icon={PencilEdit01Icon}
                              className="text-muted-foreground"
                              size={16}
                              strokeWidth={1.8}
                            />
                            <span>重命名</span>
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-destructive hover:bg-muted"
                            onClick={() => {
                              setOpenSessionMenuId(null)
                              onDeleteSession(project.id, session.id)
                            }}
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              size={16}
                              strokeWidth={1.8}
                            />
                            <span>删除</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="h-8 px-1.5 text-sm leading-8 text-muted-foreground/45">
                    无会话
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="border-t p-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={onOpenSettings}
        >
          <HugeiconsIcon icon={Settings01Icon} size={18} strokeWidth={1.8} />
          <span>Settings</span>
        </Button>
      </div>
    </aside>
  )
}

function ChatArea({
  currentProject,
  currentSession,
  items,
  isSidebarCollapsed,
  isWindowFullscreen,
  isWorkspaceCollapsed,
  onLocalEvent,
  onExpandWorkspace,
  settings,
  style,
}: {
  currentProject: ProjectRecord | undefined
  currentSession: SessionRecord | undefined
  items: ChatItem[]
  isSidebarCollapsed: boolean
  isWindowFullscreen: boolean
  isWorkspaceCollapsed: boolean
  onLocalEvent: (event: OusiaChatEvent) => void
  onExpandWorkspace: () => void
  settings: AppSettings
  style: CSSProperties
}) {
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isInterrupting, setIsInterrupting] = useState(false)
  const [isFollowingLatest, setIsFollowingLatest] = useState(true)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = useRef(false)
  const hasElectronApi = Boolean(window.ousia)

  function isScrolledToLatest(node: HTMLDivElement) {
    return node.scrollHeight - node.scrollTop - node.clientHeight < 24
  }

  function scrollToLatest(behavior: ScrollBehavior = "auto") {
    const node = scrollRef.current
    if (!node) {
      return
    }
    isProgrammaticScrollRef.current = true
    node.scrollTo({
      top: node.scrollHeight,
      behavior,
    })
    setIsFollowingLatest(true)
    setShowScrollToLatest(false)
    window.setTimeout(
      () => {
        const currentNode = scrollRef.current
        if (currentNode && isScrolledToLatest(currentNode)) {
          isProgrammaticScrollRef.current = false
        }
      },
      behavior === "smooth" ? 450 : 0
    )
  }

  useEffect(() => {
    if (!isFollowingLatest) {
      return
    }
    const node = scrollRef.current
    if (!node) {
      return
    }
    isProgrammaticScrollRef.current = true
    node.scrollTo({
      top: node.scrollHeight,
      behavior: "auto",
    })
    window.setTimeout(() => {
      const currentNode = scrollRef.current
      if (currentNode && isScrolledToLatest(currentNode)) {
        isProgrammaticScrollRef.current = false
      }
    }, 0)
  }, [isFollowingLatest, items])

  function handleChatScroll(event: UIEvent<HTMLDivElement>) {
    const isAtLatest = isScrolledToLatest(event.currentTarget)
    if (isProgrammaticScrollRef.current) {
      if (isAtLatest) {
        isProgrammaticScrollRef.current = false
      }
      return
    }
    setIsFollowingLatest(isAtLatest)
    setShowScrollToLatest(!isAtLatest)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isSending) {
      return
    }
    if (!window.ousia || !currentProject || !currentSession) {
      onLocalEvent({
        type: "error",
        id: `no-electron-${Date.now()}`,
        text: window.ousia
          ? "Select a project and session before chatting."
          : "Open this app with Electron to use the pi coding agent.",
        timestamp: new Date().toISOString(),
      })
      return
    }
    setDraft("")
    setIsSending(true)
    try {
      await window.ousia.sendChatMessage({
        prompt: text,
        projectPath: currentProject.path,
        sessionId: currentSession.id,
        thinkingLevel: settings.thinkingLevel,
        model: {
          provider: settings.modelProvider,
          modelId: settings.modelId,
          apiKey: settings.modelApiKey.trim() || undefined,
        },
      })
    } finally {
      setIsSending(false)
    }
  }

  async function handleInterrupt() {
    if (isInterrupting || !window.ousia || !currentProject || !currentSession) {
      return
    }
    setIsInterrupting(true)
    try {
      await window.ousia.interruptChat({
        projectPath: currentProject.path,
        sessionId: currentSession.id,
      })
    } finally {
      setIsInterrupting(false)
    }
  }

  function handleEscapeKey(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return
    }
    event.preventDefault()
    void handleInterrupt()
  }

  return (
    <section
      className="flex min-w-0 shrink-0 flex-col bg-background"
      style={style}
      onKeyDownCapture={handleEscapeKey}
    >
      <header className="window-drag flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          {isSidebarCollapsed ? (
            <TitleBarTrafficLightSlot isFullscreen={isWindowFullscreen} />
          ) : null}
          <div className="min-w-0">
            {/* Future: connect this title to AI-generated conversation naming. */}
            <h1 className="truncate text-base font-semibold">
              {currentSession?.title ?? "新会话"}
            </h1>
          </div>
        </div>
        {isWorkspaceCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Expand workspace"
            onClick={onExpandWorkspace}
          >
            <HugeiconsIcon icon={LayoutRightIcon} size={19} strokeWidth={1.8} />
          </Button>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        tabIndex={0}
        className="ousia-hover-scrollbar min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4"
        onScroll={handleChatScroll}
      >
        {items.length ? (
          items.map((item) => <ChatItemView item={item} key={item.id} />)
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm leading-6 text-muted-foreground">
            <div className="max-w-sm">
              {hasElectronApi
                ? `Ask the agent to work in ${currentProject?.path ?? "a project"}.`
                : "Open with Electron to talk to the pi coding agent."}
            </div>
          </div>
        )}
      </div>

      {showScrollToLatest ? (
        <div className="pointer-events-none relative z-20 h-0 shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="pointer-events-auto absolute bottom-3 left-1/2 size-8 -translate-x-1/2 rounded-full border bg-popover/90 text-popover-foreground shadow-md backdrop-blur"
            aria-label="Scroll to latest message"
            onClick={() => scrollToLatest("smooth")}
          >
            <ArrowDown className="size-4" strokeWidth={2} />
          </Button>
        </div>
      ) : null}

      <form className="shrink-0 px-5 pb-5" onSubmit={handleSubmit}>
        <div className="rounded-xl bg-card p-3 shadow-sm">
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            className="min-h-14 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
            placeholder="Ask the agent to create or update a widget..."
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Attach"
              >
                <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2} />
              </Button>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={isSending || !draft.trim()}
            >
              <HugeiconsIcon icon={ArrowUp02Icon} size={19} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}

function ChatItemView({ item }: { item: ChatItem }) {
  if (item.role === "thinking") {
    if (item.status === "finished") {
      return null
    }

    return (
      <div className="border-l border-border/70 py-1 pr-2 pl-3 text-xs leading-5 text-muted-foreground/70 italic">
        {item.text || "Thinking..."}
      </div>
    )
  }

  if (item.role === "tool") {
    const tone =
      item.status === "failed"
        ? "text-destructive"
        : item.status === "running"
          ? "text-muted-foreground"
          : "text-muted-foreground"
    return (
      <div className="rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
        <div className={["font-medium", tone].join(" ")}>
          {formatToolName(item.name)}
        </div>
        {item.text ? (
          <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] break-words whitespace-pre-wrap">
            {item.text}
          </pre>
        ) : null}
      </div>
    )
  }

  if (item.role === "system" || item.role === "error") {
    return (
      <div
        className={[
          "text-xs leading-5",
          item.role === "error" ? "text-destructive" : "text-muted-foreground",
        ].join(" ")}
      >
        {item.text}
      </div>
    )
  }

  return (
    <article
      className={[
        "text-sm leading-5",
        item.role === "user"
          ? "ml-auto w-fit rounded-lg bg-card px-3 py-2 text-card-foreground"
          : "text-foreground",
      ].join(" ")}
    >
      {item.role === "assistant" ? (
        <Streamdown
          mode={item.status === "streaming" ? "streaming" : "static"}
          isAnimating={item.status === "streaming"}
          linkSafety={{ enabled: false }}
          className="ousia-chat-markdown space-y-0 text-sm leading-5 break-words"
        >
          {item.text}
        </Streamdown>
      ) : (
        <p className="m-0 break-words whitespace-pre-wrap">{item.text}</p>
      )}
    </article>
  )
}

const defaultWorkspaceTabWidgetIds = widgetsBySlot("workspace.tab").map(
  (widget) => widget.id
).filter(
  (widgetId) => !REMOVED_DEFAULT_WORKSPACE_WIDGET_IDS.has(widgetId)
)

function createDefaultWorkspaceTabs(
  selectedWorkspaceWidgetId = DEFAULT_WORKSPACE_WIDGET_ID
): WorkspaceTabsState {
  const tabs = defaultWorkspaceTabWidgetIds.map((widgetId) =>
    createWorkspaceTab(widgetId, widgetId)
  )
  const defaultWidgetIds = new Set(defaultWorkspaceTabWidgetIds)
  return {
    tabs,
    activeTabId: defaultWidgetIds.has(selectedWorkspaceWidgetId)
      ? selectedWorkspaceWidgetId
      : DEFAULT_WORKSPACE_WIDGET_ID,
  }
}

function normalizeWorkspaceTabsState(
  state: WorkspaceTabsState | undefined,
  selectedWorkspaceWidgetId: string
): WorkspaceTabsState {
  if (!state?.tabs?.length) {
    return createDefaultWorkspaceTabs(selectedWorkspaceWidgetId)
  }
  const tabs = state.tabs
    .filter(
      (tab) =>
        !tab.widgetId ||
        !REMOVED_DEFAULT_WORKSPACE_WIDGET_IDS.has(tab.widgetId)
    )
    .map((tab) => createWorkspaceTab(tab.widgetId ?? null, tab.id))
  if (!tabs.length) {
    return createDefaultWorkspaceTabs(selectedWorkspaceWidgetId)
  }
  const activeTabId = tabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : tabs[0]?.id ?? ""
  return { tabs, activeTabId }
}

function createWorkspaceTab(
  widgetId: string | null,
  id = createId("workspace-tab")
): WorkspaceTab {
  return {
    id,
    widgetId,
  }
}

function Workspace({
  currentProject,
  currentSession,
  initialWorkspaceTabs,
  onCollapse,
  selectedWorkspaceWidgetId,
  workspaceKey,
  onWorkspaceTabsChange,
  onSelectWorkspaceWidget,
}: {
  currentProject?: ProjectRecord
  currentSession?: SessionRecord
  initialWorkspaceTabs?: WorkspaceTabsState
  onCollapse: () => void
  selectedWorkspaceWidgetId: string
  workspaceKey: string
  onWorkspaceTabsChange: (workspaceKey: string, state: WorkspaceTabsState) => void
  onSelectWorkspaceWidget: (widgetId: string) => void
}) {
  const [runtimeResult, setRuntimeResult] =
    useState<OusiaRuntimeWidgetsResult | null>(null)
  const initialTabsState = normalizeWorkspaceTabsState(
    initialWorkspaceTabs,
    selectedWorkspaceWidgetId
  )
  const [tabs, setTabs] = useState<WorkspaceTab[]>(initialTabsState.tabs)
  const [activeTabId, setActiveTabId] = useState(initialTabsState.activeTabId)
  const runtimeWidgets = useMemo(
    () =>
      runtimeResult
        ? runtimeWidgetsToDefinitions(
            runtimeResult.widgets,
            runtimeResult.errors
          )
        : [],
    [runtimeResult]
  )
  const workspaceWidgets = useMemo(
    () => [
      ...widgetsBySlot("workspace.tab"),
      ...runtimeWidgets.filter((widget) => widget.slot === "workspace.tab"),
    ],
    [runtimeWidgets]
  )
  const widgetsById = useMemo(
    () => new Map(workspaceWidgets.map((widget) => [widget.id, widget])),
    [workspaceWidgets]
  )
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const context: WidgetContext = {
    project: {
      id: currentProject?.id ?? "",
      name: currentProject?.name ?? "No project",
      path: currentProject?.path ?? "",
    },
    conversation: {
      id: currentSession?.id ?? "",
      title: currentSession?.title ?? "No session",
    },
  }
  const currentProjectPath = currentProject?.path

  useEffect(() => {
    if (!workspaceKey) {
      return
    }
    onWorkspaceTabsChange(workspaceKey, { tabs, activeTabId })
  }, [activeTabId, onWorkspaceTabsChange, tabs, workspaceKey])
  const tabIcons = {
    "custom.widget-overview": Widget6BoldDuotone,
    "workspace.browser": GlobalBoldDuotone,
    "workspace.editor": CodeSquareBoldDuotone,
    "workspace.terminal": MonitorBoldDuotone,
  }

  function getWidgetIcon(widgetId: string | null | undefined) {
    if (!widgetId) {
      return Plus
    }
    return tabIcons[widgetId as keyof typeof tabIcons] ?? Widget6BoldDuotone
  }

  function getWidgetTitle(tab: WorkspaceTab) {
    if (!tab.widgetId) {
      return "New Tab"
    }
    return widgetsById.get(tab.widgetId)?.title ?? "Missing widget"
  }

  function isEdgeToEdgeWidget(widgetId: string | null | undefined) {
    return (
      widgetId === "workspace.browser" ||
      widgetId === "workspace.editor" ||
      widgetId === "workspace.terminal" ||
      widgetId?.startsWith("runtime.") === true
    )
  }

  function handleSelectTab(tab: WorkspaceTab) {
    setActiveTabId(tab.id)
    if (tab.widgetId) {
      onSelectWorkspaceWidget(tab.widgetId)
    }
  }

  function handleNewTab() {
    const tab = createWorkspaceTab(null)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
  }

  function handleCloseTab(tabId: string) {
    setTabs((current) => {
      const closingIndex = current.findIndex((tab) => tab.id === tabId)
      const next = current.filter((tab) => tab.id !== tabId)
      if (tabId === activeTabId) {
        const nextActive =
          next[Math.min(closingIndex, next.length - 1)] ?? next.at(-1)
        setActiveTabId(nextActive?.id ?? "")
        if (nextActive?.widgetId) {
          onSelectWorkspaceWidget(nextActive.widgetId)
        }
      }
      return next
    })
  }

  function handleChooseWidget(widgetId: string) {
    if (!activeTab) {
      const tab = createWorkspaceTab(widgetId)
      setTabs([tab])
      setActiveTabId(tab.id)
      onSelectWorkspaceWidget(widgetId)
      return
    }
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTab.id ? { ...tab, widgetId } : tab
      )
    )
    onSelectWorkspaceWidget(widgetId)
  }

  const refreshRuntimeWidgets = useCallback(async () => {
    if (!window.ousia) {
      return
    }
    try {
      setRuntimeResult(
        await window.ousia.listRuntimeWidgets({
          projectPath: currentProjectPath,
        })
      )
    } catch {
      // Runtime widgets are optional; workspace system tabs still work.
    }
  }, [currentProjectPath])

  useEffect(() => {
    if (!window.ousia) {
      return
    }
    let isCancelled = false
    const removeRuntimeWidgetsChangedListener =
      window.ousia.onRuntimeWidgetsChanged(() => {
        void refreshRuntimeWidgets()
      })
    window.ousia
      .watchRuntimeWidgets({
        projectPath: currentProjectPath,
      })
      .then((result) => {
        if (!isCancelled) {
          setRuntimeResult(result)
        }
      })
      .catch(() => {
        // Runtime widgets are optional; workspace system tabs still work.
      })
    return () => {
      isCancelled = true
      removeRuntimeWidgetsChangedListener()
      void window.ousia?.unwatchRuntimeWidgets()
    }
  }, [currentProjectPath, refreshRuntimeWidgets])

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="window-drag flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <div
          className="flex min-w-0 flex-1 scrollbar-none gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Workspace tabs"
        >
          {tabs.map((tab) => {
            const Icon = getWidgetIcon(tab.widgetId)
            const isActive = tab.id === activeTab?.id
            return (
              <Button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="group/tab min-w-0 max-w-44 shrink-0"
                onClick={() => handleSelectTab(tab)}
                title={getWidgetTitle(tab)}
              >
                <span className="relative grid size-5 shrink-0 place-items-center">
                  <Icon className="size-5 transition-opacity group-hover/tab:opacity-0" />
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 grid place-items-center rounded-sm opacity-0 transition-opacity group-hover/tab:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleCloseTab(tab.id)
                    }}
                  >
                    <X className="size-4" strokeWidth={2.2} />
                  </span>
                </span>
                <span className="min-w-0 truncate">{getWidgetTitle(tab)}</span>
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="New workspace tab"
          onClick={handleNewTab}
          title="New tab"
        >
          <Plus className="size-4" strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Collapse workspace"
          onClick={onCollapse}
        >
          <HugeiconsIcon icon={LayoutRightIcon} size={19} strokeWidth={1.8} />
        </Button>
      </div>

      {activeTab?.widgetId ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) => {
            if (!tab.widgetId) {
              return null
            }
            const widget = widgetsById.get(tab.widgetId)
            if (!widget) {
              return null
            }
            return (
              <div
                key={tab.id}
                hidden={tab.id !== activeTab.id}
                className={[
                  "h-full min-h-0 overflow-auto",
                  isEdgeToEdgeWidget(tab.widgetId) ? "p-0" : "p-4",
                ].join(" ")}
              >
                <WidgetSlot widget={widget} context={context} />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid grid-cols-4 gap-3">
            {workspaceWidgets.map((widget) => {
              const Icon = getWidgetIcon(widget.id)
              return (
                <button
                  key={widget.id}
                  type="button"
                  className="group flex min-h-28 min-w-0 flex-col items-start justify-between rounded-lg border bg-card p-4 text-left text-card-foreground transition-colors hover:border-ring/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => handleChooseWidget(widget.id)}
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 max-w-full truncate text-sm font-medium">
                    {widget.title}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function ResizeHandle({
  label,
  onPointerDown,
}: {
  label: string
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      aria-label={label}
      className="group relative z-10 w-px shrink-0 cursor-col-resize bg-border"
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    >
      <div className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-ring" />
    </div>
  )
}

function SettingsPage({
  onSave,
  settings,
}: {
  onSave: (settings: AppSettings) => void
  settings: AppSettings
}) {
  const [draft, setDraft] = useState(settings)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const defaultWorkDir = draft.defaultWorkDir.trim()
    const modelProvider = draft.modelProvider.trim()
    const modelId = draft.modelId.trim()
    if (!defaultWorkDir || !modelProvider || !modelId) {
      return
    }
    onSave({
      ...draft,
      defaultWorkDir,
      modelProvider,
      modelId,
      modelApiKey: draft.modelApiKey.trim(),
    })
  }

  const selectedPreset = findModelPreset(draft.modelProvider, draft.modelId)
  const selectedModelValue = selectedPreset
    ? modelPresetValue(selectedPreset.provider, selectedPreset.modelId)
    : "custom"
  const modelSelectItems = [
    ...modelPresets.map((preset) => ({
      label: preset.label,
      value: modelPresetValue(preset.provider, preset.modelId),
    })),
    { label: "Custom model", value: "custom" },
  ]
  const thinkingSelectItems = thinkingLevels.map((level) => ({
    label: level.label,
    value: level.value,
  }))

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="window-drag flex h-12 shrink-0 items-center border-b px-5">
        <h1 className="text-base font-semibold">Settings</h1>
      </header>
      <form
        className="min-h-0 flex-1 overflow-auto px-6 py-6"
        onSubmit={handleSubmit}
      >
        <div className="mx-auto w-full max-w-2xl space-y-8">
          <section>
            <h2 className="text-sm font-semibold">Workspace</h2>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">
              Default work dir
            </label>
            <input
              className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={draft.defaultWorkDir}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultWorkDir: event.target.value,
                }))
              }
              placeholder="~/Desktop"
            />
            <div className="mt-2 text-xs leading-5 text-muted-foreground">
              Used when Ousia creates the default project. Supports paths like
              ~/Desktop.
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold">Model</h2>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-muted-foreground">
                Preset
              </span>
              <Select
                items={modelSelectItems}
                value={selectedModelValue}
                onValueChange={(value) => {
                  if (value === "custom") {
                    return
                  }
                  const preset = modelPresets.find(
                    (item) =>
                      modelPresetValue(item.provider, item.modelId) === value
                  )
                  if (!preset) {
                    return
                  }
                  setDraft((current) => ({
                    ...current,
                    modelProvider: preset.provider,
                    modelId: preset.modelId,
                  }))
                }}
              >
                <SelectTrigger className="mt-2 w-full rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {modelPresets.map((preset) => (
                      <SelectItem
                        key={modelPresetValue(preset.provider, preset.modelId)}
                        value={modelPresetValue(
                          preset.provider,
                          preset.modelId
                        )}
                      >
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom model</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            {selectedPreset ? (
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {selectedPreset.description}
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Provider
                </span>
                <input
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={draft.modelProvider}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      modelProvider: event.target.value,
                    }))
                  }
                  placeholder="deepseek"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Model ID
                </span>
                <input
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={draft.modelId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      modelId: event.target.value,
                    }))
                  }
                  placeholder="deepseek-v4-flash"
                />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-muted-foreground">
                API Key
              </span>
              <input
                className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={draft.modelApiKey}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    modelApiKey: event.target.value,
                  }))
                }
                placeholder="sk-..."
                type="password"
              />
            </label>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">
              The key is passed to pi for the selected provider. Leave it empty
              to use pi auth storage or environment variables such as
              DEEPSEEK_API_KEY.
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-muted-foreground">
                Thinking
              </span>
              <Select
                items={thinkingSelectItems}
                value={draft.thinkingLevel}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    thinkingLevel: value as OusiaThinkingLevel,
                  }))
                }
              >
                <SelectTrigger className="mt-2 w-full rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {thinkingLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">
              {
                thinkingLevels.find(
                  (level) => level.value === draft.thinkingLevel
                )?.description
              }{" "}
              DeepSeek may clamp unsupported levels.
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit">Save settings</Button>
          </div>
        </div>
      </form>
    </section>
  )
}

export function App() {
  const [initialState] = useState<InitialAppState>(() => loadInitialAppState())
  const shellRef = useRef<HTMLElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [chatWidth, setChatWidth] = useState(520)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false)
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(initialState.settings)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectRecord[]>(
    initialState.projects
  )
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialState.selectedProjectId
  )
  const [selectedSessionId, setSelectedSessionId] = useState(
    initialState.selectedSessionId
  )
  const [selectedWorkspaceWidgetId, setSelectedWorkspaceWidgetId] = useState(
    initialState.selectedWorkspaceWidgetId
  )
  const [workspaceTabsBySession, setWorkspaceTabsBySession] = useState<
    Record<string, WorkspaceTabsState>
  >(initialState.workspaceTabsBySession)
  const [itemsBySession, setItemsBySession] = useState<
    Record<string, ChatItem[]>
  >({})

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0]
  const selectedSession =
    selectedProject?.sessions.find(
      (session) => session.id === selectedSessionId
    ) ?? selectedProject?.sessions[0]
  const selectedChatKey =
    selectedProject && selectedSession
      ? chatKey(selectedProject.id, selectedSession.id)
      : ""
  const selectedItems = selectedChatKey
    ? (itemsBySession[selectedChatKey] ?? [])
    : []

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    window.localStorage.setItem(
      SELECTION_STORAGE_KEY,
      JSON.stringify({
        selectedProjectId: selectedProject?.id ?? "",
        selectedSessionId: selectedSession?.id ?? "",
        selectedWorkspaceWidgetId,
        workspaceTabsBySession,
      })
    )
  }, [
    selectedProject?.id,
    selectedSession?.id,
    selectedWorkspaceWidgetId,
    workspaceTabsBySession,
  ])

  const handleWorkspaceTabsChange = useCallback(
    (workspaceKey: string, state: WorkspaceTabsState) => {
      setWorkspaceTabsBySession((current) => ({
        ...current,
        [workspaceKey]: state,
      }))
    },
    []
  )

  useEffect(() => {
    if (
      !window.ousia ||
      !selectedProject ||
      !selectedSession ||
      !selectedChatKey ||
      itemsBySession[selectedChatKey]?.length
    ) {
      return
    }

    let isCancelled = false
    window.ousia
      .getChatHistory({
        projectPath: selectedProject.path,
        sessionId: selectedSession.id,
      })
      .then((history) => {
        if (isCancelled || !history.items.length) {
          return
        }
        setItemsBySession((current) => {
          if (current[selectedChatKey]?.length) {
            return current
          }
          return {
            ...current,
            [selectedChatKey]: history.items,
          }
        })
      })
      .catch(() => {
        // History hydration is best-effort; live chat still works.
      })

    return () => {
      isCancelled = true
    }
  }, [itemsBySession, selectedChatKey, selectedProject, selectedSession])

  useEffect(() => {
    return window.ousia?.onChatEvent((event) => {
      const targetProject = projects.find(
        (project) => project.path === event.context?.projectPath
      )
      const targetKey =
        targetProject && event.context
          ? chatKey(targetProject.id, event.context.sessionId)
          : selectedChatKey
      if (!targetKey) {
        return
      }
      setItemsBySession((current) => ({
        ...current,
        [targetKey]: applyChatEvent(current[targetKey] ?? [], event),
      }))
    })
  }, [projects, selectedChatKey])

  useEffect(() => {
    return window.ousia?.onWindowFullscreenChange((event) => {
      setIsWindowFullscreen(event.isFullscreen)
    })
  }, [])

  function appendLocalEvent(event: OusiaChatEvent) {
    if (!selectedChatKey) {
      return
    }
    setItemsBySession((current) => ({
      ...current,
      [selectedChatKey]: applyChatEvent(current[selectedChatKey] ?? [], event),
    }))
  }

  async function handleOpenProject() {
    if (!window.ousia) {
      const rawPath = window.prompt("Project path")
      if (!rawPath) {
        return
      }
      addProject(rawPath, projectNameFromPath(rawPath))
      return
    }
    const result = await window.ousia.openProjectDirectory()
    if (result.canceled) {
      return
    }
    addProject(result.path, result.name)
  }

  function addProject(path: string, name: string) {
    const existing = projects.find((project) => project.path === path)
    if (existing) {
      const firstSession = existing.sessions[0] ?? createSession()
      if (!existing.sessions.length) {
        setProjects((current) =>
          current.map((project) =>
            project.id === existing.id
              ? { ...project, sessions: [firstSession] }
              : project
          )
        )
      }
      setSelectedProjectId(existing.id)
      setSelectedSessionId(firstSession.id)
      setIsSettingsOpen(false)
      return
    }
    const session = createSession()
    const project = {
      id: createId("project"),
      name,
      path,
      sessions: [session],
    }
    setProjects((current) => [...current, project])
    setSelectedProjectId(project.id)
    setSelectedSessionId(session.id)
    setIsSettingsOpen(false)
  }

  function handleCreateSession(projectId: string) {
    const session = createSession()
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, sessions: [session, ...project.sessions] }
          : project
      )
    )
    setSelectedProjectId(projectId)
    setSelectedSessionId(session.id)
    setIsSettingsOpen(false)
  }

  function handleDeleteProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId)
    if (!project) {
      return
    }
    if (
      !window.confirm(
        `Remove "${project.name}" from Ousia?\n\nThis will not delete the folder.`
      )
    ) {
      return
    }

    const projectIndex = projects.findIndex((item) => item.id === projectId)
    const remaining = projects.filter((item) => item.id !== projectId)
    setProjects(remaining)
    setItemsBySession((current) => {
      const next = { ...current }
      for (const session of project.sessions) {
        delete next[chatKey(project.id, session.id)]
      }
      return next
    })
    setWorkspaceTabsBySession((current) => {
      const next = { ...current }
      for (const session of project.sessions) {
        delete next[chatKey(project.id, session.id)]
      }
      return next
    })

    if (selectedProjectId === projectId) {
      const nextProject =
        remaining[Math.min(projectIndex, remaining.length - 1)] ?? remaining[0]
      setSelectedProjectId(nextProject?.id ?? "")
      setSelectedSessionId(nextProject?.sessions[0]?.id ?? "")
      setIsSettingsOpen(false)
    }
  }

  function handleSelectSession(projectId: string, sessionId: string) {
    setSelectedProjectId(projectId)
    setSelectedSessionId(sessionId)
    setIsSettingsOpen(false)
  }

  function handleOpenSettings() {
    setIsSettingsOpen(true)
  }

  function handleSaveSettings(nextSettings: AppSettings) {
    setSettings(nextSettings)
    setProjects((current) => {
      const existing = current.find(
        (project) => project.id === "default-workdir"
      )
      if (!existing) {
        return [
          {
            id: "default-workdir",
            name: projectNameFromPath(nextSettings.defaultWorkDir),
            path: nextSettings.defaultWorkDir,
            sessions: [createSession()],
          },
          ...current,
        ]
      }
      return current.map((project) =>
        project.id === "default-workdir"
          ? {
              ...project,
              name: projectNameFromPath(nextSettings.defaultWorkDir),
              path: nextSettings.defaultWorkDir,
            }
          : project
      )
    })
  }

  function handleRenameSession(projectId: string, sessionId: string) {
    const project = projects.find((item) => item.id === projectId)
    const session = project?.sessions.find((item) => item.id === sessionId)
    if (!session) {
      return
    }
    const nextTitle = window.prompt("Rename session", session.title)?.trim()
    if (!nextTitle) {
      return
    }
    setProjects((current) =>
      current.map((item) =>
        item.id === projectId
          ? {
              ...item,
              sessions: item.sessions.map((candidate) =>
                candidate.id === sessionId
                  ? { ...candidate, title: nextTitle }
                  : candidate
              ),
            }
          : item
      )
    )
  }

  function handleDeleteSession(projectId: string, sessionId: string) {
    const project = projects.find((item) => item.id === projectId)
    const session = project?.sessions.find((item) => item.id === sessionId)
    if (!project || !session) {
      return
    }
    if (!window.confirm(`Delete "${session.title}"?`)) {
      return
    }
    const remaining = project.sessions.filter((item) => item.id !== sessionId)
    setProjects((current) =>
      current.map((item) =>
        item.id === projectId ? { ...item, sessions: remaining } : item
      )
    )
    setItemsBySession((current) => {
      const next = { ...current }
      delete next[chatKey(projectId, sessionId)]
      return next
    })
    setWorkspaceTabsBySession((current) => {
      const next = { ...current }
      delete next[chatKey(projectId, sessionId)]
      return next
    })
    if (selectedProjectId === projectId && selectedSessionId === sessionId) {
      setSelectedSessionId(remaining[0]?.id ?? "")
    }
  }

  function getShellWidth() {
    return shellRef.current?.getBoundingClientRect().width ?? window.innerWidth
  }

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "b" ||
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return
      }
      event.preventDefault()
      setIsSidebarCollapsed((current) => !current)
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  function beginSidebarResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startSidebarWidth = sidebarWidth
    const shellWidth = getShellWidth()

    function stopSidebarResize() {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const rawSidebarWidth = startSidebarWidth + moveEvent.clientX - startX
      if (rawSidebarWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
        setIsSidebarCollapsed(true)
        stopSidebarResize()
        return
      }

      const maxSidebarWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        shellWidth - MIN_CHAT_WIDTH - MIN_WORKSPACE_WIDTH - 2
      )
      const nextSidebarWidth = clamp(
        rawSidebarWidth,
        MIN_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, maxSidebarWidth)
      )
      setSidebarWidth(nextSidebarWidth)
    }

    function handlePointerUp() {
      stopSidebarResize()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })
  }

  function beginChatResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startChatWidth = chatWidth
    const shellWidth = getShellWidth()

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const effectiveSidebarWidth = isSidebarCollapsed ? 0 : sidebarWidth
      const maxChatWidth =
        shellWidth - effectiveSidebarWidth - MIN_WORKSPACE_WIDTH - 2
      const nextChatWidth = clamp(
        startChatWidth + moveEvent.clientX - startX,
        MIN_CHAT_WIDTH,
        Math.max(MIN_CHAT_WIDTH, maxChatWidth)
      )
      setChatWidth(nextChatWidth)
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })
  }

  return (
    <main
      ref={shellRef}
      className="relative flex h-svh overflow-hidden bg-background text-foreground"
    >
      {isSidebarCollapsed ? null : (
        <>
          <Sidebar
            onCreateSession={handleCreateSession}
            onDeleteProject={handleDeleteProject}
            onDeleteSession={handleDeleteSession}
            onOpenProject={handleOpenProject}
            onOpenSettings={handleOpenSettings}
            onRenameSession={handleRenameSession}
            onSelectSession={handleSelectSession}
            projects={projects}
            selectedProjectId={selectedProject?.id ?? ""}
            selectedSessionId={selectedSession?.id ?? ""}
            isWindowFullscreen={isWindowFullscreen}
            style={{ width: sidebarWidth }}
          />
          <ResizeHandle
            label="Resize sidebar"
            onPointerDown={beginSidebarResize}
          />
        </>
      )}
      {isSettingsOpen ? (
        <SettingsPage settings={settings} onSave={handleSaveSettings} />
      ) : (
        <>
          <ChatArea
            key={selectedChatKey}
            currentProject={selectedProject}
            currentSession={selectedSession}
            items={selectedItems}
            isSidebarCollapsed={isSidebarCollapsed}
            isWindowFullscreen={isWindowFullscreen}
            isWorkspaceCollapsed={isWorkspaceCollapsed}
            onLocalEvent={appendLocalEvent}
            onExpandWorkspace={() => setIsWorkspaceCollapsed(false)}
            settings={settings}
            style={
              isWorkspaceCollapsed
                ? { flex: "1 1 0", width: "auto" }
                : { width: chatWidth }
            }
          />
          {isWorkspaceCollapsed ? null : (
            <>
              <ResizeHandle
                label="Resize workspace"
                onPointerDown={beginChatResize}
              />
              <Workspace
                key={selectedChatKey}
                currentProject={selectedProject}
                currentSession={selectedSession}
                initialWorkspaceTabs={workspaceTabsBySession[selectedChatKey]}
                onCollapse={() => setIsWorkspaceCollapsed(true)}
                selectedWorkspaceWidgetId={selectedWorkspaceWidgetId}
                workspaceKey={selectedChatKey}
                onWorkspaceTabsChange={handleWorkspaceTabsChange}
                onSelectWorkspaceWidget={setSelectedWorkspaceWidgetId}
              />
            </>
          )}
        </>
      )}
    </main>
  )
}

export default App
