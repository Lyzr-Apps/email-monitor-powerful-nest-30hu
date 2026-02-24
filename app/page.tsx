'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { cronToHuman, getScheduleLogs, listSchedules, pauseSchedule, resumeSchedule, triggerScheduleNow } from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import { KnowledgeBaseUpload } from '@/components/KnowledgeBaseUpload'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { HiOutlineMail, HiOutlineInbox, HiOutlineFlag, HiOutlineClock, HiOutlineCheck, HiOutlineRefresh, HiOutlineSearch, HiOutlineChevronRight, HiOutlineChevronLeft } from 'react-icons/hi'
import { FiDatabase, FiActivity, FiCalendar, FiPlay, FiAlertCircle, FiSend, FiEdit, FiX, FiChevronDown, FiChevronUp, FiLoader } from 'react-icons/fi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_MONITOR_AGENT_ID = '699d9312db2449ce8a2152d0'
const HUMAN_REPLY_AGENT_ID = '699d9313db2449ce8a2152d2'
const RAG_ID = '699d92c5b45a5c2df18ef5d5'
const SCHEDULE_ID = '699d931d399dfadeac390818'
const STORAGE_KEY = 'smart_support_hub_data'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessedEmail {
  id: string
  sender: string
  subject: string
  body_snippet: string
  received_at: string
  status: string
  confidence: string
  flagged_reason: string
  auto_reply_sent: string
  thread_id: string
  message_id: string
  localStatus?: 'flagged' | 'in_progress' | 'resolved'
  draftResponse?: string
  sentReply?: string
  resolvedAt?: string
}

interface StoredData {
  emails: ProcessedEmail[]
  lastSyncTimestamp: string
  stats: { totalToday: number; autoResponded: number; flagged: number }
}

interface EmailMonitorResponse {
  processed_emails: Array<{
    sender: string
    subject: string
    body_snippet: string
    received_at: string
    status: string
    confidence: string
    flagged_reason: string
    auto_reply_sent: string
    thread_id: string
    message_id: string
  }>
  summary: {
    total_processed: number
    auto_responded: number
    flagged: number
    timestamp: string
  }
}

interface HumanReplyResponse {
  action: string
  draft_response: string
  sent_to: string
  subject: string
  reply_body: string
  thread_id: string
  message_id: string
  status: string
  timestamp: string
}

type ScreenType = 'dashboard' | 'flagged' | 'activity' | 'schedule' | 'knowledge'

// ---------------------------------------------------------------------------
// Sample Data
// ---------------------------------------------------------------------------

const SAMPLE_EMAILS: ProcessedEmail[] = [
  {
    id: 'sample-1',
    sender: 'alice.johnson@techcorp.com',
    subject: 'Password Reset Request',
    body_snippet: 'Hi, I forgot my password and need help resetting it. My username is alice.j and I have been locked out since this morning...',
    received_at: '2026-02-24T08:15:00Z',
    status: 'auto_responded',
    confidence: 'HIGH',
    flagged_reason: '',
    auto_reply_sent: 'Your password has been queued for reset. Please check your email for a reset link within 5 minutes.',
    thread_id: 'thread-001',
    message_id: 'msg-001',
    localStatus: 'resolved',
    sentReply: 'Your password has been queued for reset. Please check your email for a reset link within 5 minutes.',
  },
  {
    id: 'sample-2',
    sender: 'bob.smith@enterprise.io',
    subject: 'Billing Discrepancy on Invoice #4521',
    body_snippet: 'I noticed a charge of $450 that does not match our agreement. Our contract specifies $350/month. Can you look into this?',
    received_at: '2026-02-24T09:30:00Z',
    status: 'flagged',
    confidence: 'LOW',
    flagged_reason: 'Billing dispute requires human review. Amount discrepancy detected between invoice and contract terms.',
    auto_reply_sent: '',
    thread_id: 'thread-002',
    message_id: 'msg-002',
    localStatus: 'flagged',
  },
  {
    id: 'sample-3',
    sender: 'carol.white@startup.co',
    subject: 'How to integrate the API?',
    body_snippet: 'We are looking into your REST API. Can you send us the documentation link and any sample code for authentication?',
    received_at: '2026-02-24T10:05:00Z',
    status: 'auto_responded',
    confidence: 'HIGH',
    flagged_reason: '',
    auto_reply_sent: 'Our API documentation is available at docs.example.com/api. For authentication, we use OAuth 2.0 bearer tokens.',
    thread_id: 'thread-003',
    message_id: 'msg-003',
    localStatus: 'resolved',
    sentReply: 'Our API documentation is available at docs.example.com/api. For authentication, we use OAuth 2.0 bearer tokens.',
  },
  {
    id: 'sample-4',
    sender: 'dave.chen@globalcorp.net',
    subject: 'Service Outage Report',
    body_snippet: 'We experienced a complete service outage between 2am and 4am UTC. Multiple clients are affected and we need a root cause analysis.',
    received_at: '2026-02-24T11:20:00Z',
    status: 'flagged',
    confidence: 'LOW',
    flagged_reason: 'Service outage report requires escalation to engineering team. Multiple clients affected -- needs senior review.',
    auto_reply_sent: '',
    thread_id: 'thread-004',
    message_id: 'msg-004',
    localStatus: 'in_progress',
    draftResponse: 'Thank you for reporting the outage. Our engineering team is investigating the root cause. We will provide an update within 2 hours.',
  },
  {
    id: 'sample-5',
    sender: 'eve.martinez@partner.org',
    subject: 'Feature Request: Dark Mode',
    body_snippet: 'Our team loves the product! Could you consider adding a dark mode option? Several of our developers have requested it.',
    received_at: '2026-02-24T12:45:00Z',
    status: 'auto_responded',
    confidence: 'HIGH',
    flagged_reason: '',
    auto_reply_sent: 'Thank you for your feature request! Dark mode is on our roadmap for Q3 2026. We will notify you when it becomes available.',
    thread_id: 'thread-005',
    message_id: 'msg-005',
    localStatus: 'resolved',
    sentReply: 'Thank you for your feature request! Dark mode is on our roadmap for Q3 2026. We will notify you when it becomes available.',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadStoredData(): StoredData {
  if (typeof window === 'undefined') return { emails: [], lastSyncTimestamp: '', stats: { totalToday: 0, autoResponded: 0, flagged: 0 } }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        emails: Array.isArray(parsed?.emails) ? parsed.emails : [],
        lastSyncTimestamp: parsed?.lastSyncTimestamp ?? '',
        stats: parsed?.stats ?? { totalToday: 0, autoResponded: 0, flagged: 0 },
      }
    }
  } catch {
    // ignore parse errors
  }
  return { emails: [], lastSyncTimestamp: '', stats: { totalToday: 0, autoResponded: 0, flagged: 0 } }
}

function saveStoredData(data: StoredData) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore storage errors
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return dateStr
  }
}

function generateId(): string {
  return 'email-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36)
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  if (s === 'auto_responded' || s === 'resolved') {
    return <Badge className="bg-emerald-700 text-white hover:bg-emerald-800 border-0">{s === 'auto_responded' ? 'Auto-Responded' : 'Resolved'}</Badge>
  }
  if (s === 'flagged') {
    return <Badge className="bg-amber-600 text-white hover:bg-amber-700 border-0">Flagged</Badge>
  }
  if (s === 'in_progress') {
    return <Badge className="bg-blue-600 text-white hover:bg-blue-700 border-0">In Progress</Badge>
  }
  return <Badge variant="secondary">{status || 'Unknown'}</Badge>
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const c = (confidence ?? '').toUpperCase()
  if (c === 'HIGH') return <Badge variant="outline" className="text-emerald-700 border-emerald-700 text-xs">HIGH</Badge>
  if (c === 'LOW') return <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">LOW</Badge>
  return <Badge variant="outline" className="text-xs">{confidence || '--'}</Badge>
}

// ---------------------------------------------------------------------------
// Inline Notification Component
// ---------------------------------------------------------------------------

function InlineNotification({ type, message, onDismiss }: { type: 'success' | 'error' | 'info'; message: string; onDismiss?: () => void }) {
  const colors = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  return (
    <div className={`flex items-center justify-between rounded-md border p-3 text-sm ${colors[type]}`}>
      <div className="flex items-center gap-2">
        {type === 'success' && <HiOutlineCheck className="h-4 w-4" />}
        {type === 'error' && <FiAlertCircle className="h-4 w-4" />}
        {type === 'info' && <HiOutlineClock className="h-4 w-4" />}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 hover:opacity-70">
          <FiX className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({ title, value, icon, accent }: { title: string; value: number | string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={accent ? 'border-accent bg-accent/5' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-serif">{title}</p>
            <p className="text-3xl font-bold font-serif mt-1">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${accent ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Email Row Component
// ---------------------------------------------------------------------------

function EmailRow({ email, onClick }: { email: ProcessedEmail; onClick: () => void }) {
  const displayStatus = email.localStatus ?? email.status
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-b-0 flex items-center gap-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold truncate font-serif">{email.sender ?? 'Unknown'}</span>
          <ConfidenceBadge confidence={email.confidence} />
        </div>
        <p className="text-sm truncate text-foreground/80">{email.subject ?? 'No subject'}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{email.body_snippet ?? ''}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <StatusBadge status={displayStatus} />
        <span className="text-xs text-muted-foreground">{formatDate(email.received_at)}</span>
      </div>
      <HiOutlineChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function Page() {
  // ---- State ----
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('dashboard')
  const [emails, setEmails] = useState<ProcessedEmail[]>([])
  const [lastSync, setLastSync] = useState('')
  const [stats, setStats] = useState({ totalToday: 0, autoResponded: 0, flagged: 0 })
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null)
  const [showSampleData, setShowSampleData] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'auto_responded' | 'flagged'>('all')

  // Agent states
  const [monitorLoading, setMonitorLoading] = useState(false)
  const [draftLoading, setDraftLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Schedule states
  const [scheduleId, setScheduleId] = useState(SCHEDULE_ID)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleLogs, setScheduleLogs] = useState<ExecutionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // Sidebar collapsed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Timer for notification auto-dismiss
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Notification helper ----
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    if (notifTimer.current) clearTimeout(notifTimer.current)
    setNotification({ type, message })
    notifTimer.current = setTimeout(() => setNotification(null), 6000)
  }, [])

  // ---- Load stored data on mount ----
  useEffect(() => {
    const stored = loadStoredData()
    if (stored.emails.length > 0) {
      setEmails(stored.emails)
      setLastSync(stored.lastSyncTimestamp)
      setStats(stored.stats)
    }
  }, [])

  // ---- Persist data when emails change ----
  useEffect(() => {
    if (emails.length > 0) {
      const autoResponded = emails.filter(e => e.status === 'auto_responded').length
      const flagged = emails.filter(e => (e.localStatus ?? e.status) === 'flagged' || (e.localStatus ?? e.status) === 'in_progress').length
      const newStats = { totalToday: emails.length, autoResponded, flagged }
      setStats(newStats)
      saveStoredData({ emails, lastSyncTimestamp: lastSync, stats: newStats })
    }
  }, [emails, lastSync])

  // ---- Load schedule data on mount ----
  useEffect(() => {
    loadScheduleData()
  }, [])

  const loadScheduleData = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      const result = await listSchedules()
      if (result.success) {
        const found = Array.isArray(result.schedules)
          ? result.schedules.find(s => s.id === scheduleId)
          : undefined
        if (found) {
          setSchedule(found)
        }
      }
    } catch (err) {
      setScheduleError('Failed to load schedule data')
    }
    setScheduleLoading(false)
  }, [scheduleId])

  const loadScheduleLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const result = await getScheduleLogs(scheduleId, { limit: 10 })
      if (result.success) {
        setScheduleLogs(Array.isArray(result.executions) ? result.executions : [])
      }
    } catch {
      // ignore
    }
    setLogsLoading(false)
  }, [scheduleId])

  // ---- Sample data toggle ----
  useEffect(() => {
    if (showSampleData) {
      setEmails(SAMPLE_EMAILS)
      setLastSync('2026-02-24T13:00:00Z')
    } else {
      const stored = loadStoredData()
      setEmails(stored.emails)
      setLastSync(stored.lastSyncTimestamp)
    }
  }, [showSampleData])

  // ---- Derived data ----
  const displayEmails = emails
  const flaggedEmails = displayEmails.filter(e => {
    const s = e.localStatus ?? e.status
    return s === 'flagged' || s === 'in_progress'
  })
  const autoRespondedEmails = displayEmails.filter(e => e.status === 'auto_responded')

  // Filtered emails for Activity Log
  const filteredEmails = displayEmails.filter(e => {
    const matchesSearch = !searchQuery || (e.sender ?? '').toLowerCase().includes(searchQuery.toLowerCase()) || (e.subject ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'all' || e.status === filterType
    return matchesSearch && matchesFilter
  })

  // ---- Agent Calls ----
  const runEmailMonitor = useCallback(async () => {
    setMonitorLoading(true)
    setActiveAgentId(EMAIL_MONITOR_AGENT_ID)
    try {
      const result = await callAIAgent(
        'Fetch new unread emails from the inbox, search the knowledge base for answers, and either auto-respond with high confidence answers or flag low confidence emails for human review. Process all new emails since the last check.',
        EMAIL_MONITOR_AGENT_ID
      )
      if (result.success) {
        const data = result?.response?.result as unknown as EmailMonitorResponse | undefined
        const newEmails = Array.isArray(data?.processed_emails) ? data.processed_emails : []
        const summary = data?.summary ?? { total_processed: 0, auto_responded: 0, flagged: 0, timestamp: '' }

        if (newEmails.length > 0) {
          const mapped: ProcessedEmail[] = newEmails.map(e => ({
            id: generateId(),
            sender: e.sender ?? '',
            subject: e.subject ?? '',
            body_snippet: e.body_snippet ?? '',
            received_at: e.received_at ?? '',
            status: e.status ?? 'flagged',
            confidence: e.confidence ?? '',
            flagged_reason: e.flagged_reason ?? '',
            auto_reply_sent: e.auto_reply_sent ?? '',
            thread_id: e.thread_id ?? '',
            message_id: e.message_id ?? '',
            localStatus: (e.status === 'flagged' ? 'flagged' : 'resolved') as 'flagged' | 'resolved',
          }))
          setEmails(prev => {
            const existingIds = new Set(prev.map(em => em.message_id))
            const unique = mapped.filter(em => !existingIds.has(em.message_id))
            return [...unique, ...prev]
          })
          setLastSync(summary?.timestamp || new Date().toISOString())
          showNotification('success', `Processed ${summary?.total_processed ?? newEmails.length} emails: ${summary?.auto_responded ?? 0} auto-responded, ${summary?.flagged ?? 0} flagged`)
        } else {
          setLastSync(new Date().toISOString())
          showNotification('info', 'No new emails to process')
        }
      } else {
        showNotification('error', result?.error ?? 'Failed to run email monitor')
      }
    } catch (err) {
      showNotification('error', 'Network error while running email monitor')
    }
    setMonitorLoading(false)
    setActiveAgentId(null)
  }, [showNotification])

  const draftResponse = useCallback(async (email: ProcessedEmail) => {
    setDraftLoading(true)
    setActiveAgentId(HUMAN_REPLY_AGENT_ID)
    try {
      const message = `Draft a response for this flagged email.\n\nFrom: ${email.sender}\nSubject: ${email.subject}\nBody: ${email.body_snippet}\nReason flagged: ${email.flagged_reason}`
      const result = await callAIAgent(message, HUMAN_REPLY_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result as unknown as HumanReplyResponse | undefined
        const draft = data?.draft_response ?? data?.reply_body ?? ''
        if (draft) {
          setDraftText(draft)
          setEmails(prev => prev.map(e => e.id === email.id ? { ...e, localStatus: 'in_progress' as const, draftResponse: draft } : e))
          setSelectedEmail(prev => prev?.id === email.id ? { ...prev, localStatus: 'in_progress' as const, draftResponse: draft } : prev)
          showNotification('success', 'Draft response generated')
        } else {
          showNotification('info', 'Agent returned an empty draft. You can write your reply manually.')
        }
      } else {
        showNotification('error', result?.error ?? 'Failed to generate draft')
      }
    } catch {
      showNotification('error', 'Network error while drafting response')
    }
    setDraftLoading(false)
    setActiveAgentId(null)
  }, [showNotification])

  const sendReply = useCallback(async (email: ProcessedEmail, replyText: string) => {
    if (!replyText.trim()) {
      showNotification('error', 'Reply text cannot be empty')
      return
    }
    setSendLoading(true)
    setActiveAgentId(HUMAN_REPLY_AGENT_ID)
    try {
      const message = `Send this reply via Gmail.\n\nTo: ${email.sender}\nSubject: Re: ${email.subject}\nThread ID: ${email.thread_id}\nReply Body: ${replyText}`
      const result = await callAIAgent(message, HUMAN_REPLY_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result as unknown as HumanReplyResponse | undefined
        const status = data?.status ?? ''
        if (status === 'sent' || status === 'drafted' || result.success) {
          setEmails(prev => prev.map(e => e.id === email.id ? { ...e, localStatus: 'resolved' as const, sentReply: replyText, resolvedAt: new Date().toISOString() } : e))
          setSelectedEmail(prev => prev?.id === email.id ? { ...prev, localStatus: 'resolved' as const, sentReply: replyText, resolvedAt: new Date().toISOString() } : prev)
          setDraftText('')
          showNotification('success', `Reply sent to ${data?.sent_to ?? email.sender}`)
        } else {
          showNotification('error', 'Agent reported an error while sending')
        }
      } else {
        showNotification('error', result?.error ?? 'Failed to send reply')
      }
    } catch {
      showNotification('error', 'Network error while sending reply')
    }
    setSendLoading(false)
    setActiveAgentId(null)
  }, [showNotification])

  // ---- Schedule Controls ----
  const handleToggleSchedule = useCallback(async () => {
    if (!schedule) return
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      if (schedule.is_active) {
        await pauseSchedule(scheduleId)
      } else {
        await resumeSchedule(scheduleId)
      }
      await loadScheduleData()
    } catch {
      setScheduleError('Failed to toggle schedule')
    }
    setScheduleLoading(false)
  }, [schedule, scheduleId, loadScheduleData])

  const handleTriggerNow = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      const result = await triggerScheduleNow(scheduleId)
      if (result.success) {
        showNotification('success', 'Email monitor triggered successfully. The scheduled agent will process emails shortly.')
      } else {
        setScheduleError(result?.error ?? 'Failed to trigger schedule')
      }
    } catch {
      setScheduleError('Network error while triggering schedule')
    }
    setScheduleLoading(false)
  }, [scheduleId, showNotification])

  // ---- Select email for detail view ----
  const openEmailDetail = useCallback((email: ProcessedEmail) => {
    setSelectedEmail(email)
    setDraftText(email.draftResponse ?? '')
  }, [])

  const closeEmailDetail = useCallback(() => {
    setSelectedEmail(null)
    setDraftText('')
  }, [])

  // ---- Navigation items ----
  const navItems: Array<{ id: ScreenType; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <HiOutlineInbox className="h-5 w-5" /> },
    { id: 'flagged', label: 'Flagged for Review', icon: <HiOutlineFlag className="h-5 w-5" />, count: flaggedEmails.length },
    { id: 'activity', label: 'Activity Log', icon: <FiActivity className="h-5 w-5" /> },
    { id: 'schedule', label: 'Schedule', icon: <FiCalendar className="h-5 w-5" /> },
    { id: 'knowledge', label: 'Knowledge Base', icon: <FiDatabase className="h-5 w-5" /> },
  ]

  // ========================================================================
  // RENDER: Dashboard Screen
  // ========================================================================

  function DashboardScreen() {
    return (
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Emails Processed" value={stats.totalToday} icon={<HiOutlineMail className="h-6 w-6" />} />
          <StatCard title="Auto-Responded" value={stats.autoResponded} icon={<HiOutlineCheck className="h-6 w-6" />} />
          <StatCard title="Flagged for Review" value={stats.flagged} icon={<HiOutlineFlag className="h-6 w-6" />} accent />
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runEmailMonitor} disabled={monitorLoading} className="gap-2">
            {monitorLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : <HiOutlineRefresh className="h-4 w-4" />}
            {monitorLoading ? 'Scanning...' : 'Run Monitor Now'}
          </Button>
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <HiOutlineClock className="h-4 w-4" />
            Last sync: {lastSync ? formatDate(lastSync) : 'Never'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${schedule?.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-sm text-muted-foreground">{schedule?.is_active ? 'Monitor Active' : 'Monitor Paused'}</span>
          </div>
        </div>

        {/* Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Flagged */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-serif flex items-center gap-2">
                  <HiOutlineFlag className="h-5 w-5 text-amber-600" />
                  Recent Flagged
                </CardTitle>
                {flaggedEmails.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setCurrentScreen('flagged')} className="text-xs gap-1">
                    View All <HiOutlineChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {flaggedEmails.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <HiOutlineCheck className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium">No flagged emails</p>
                  <p className="text-xs text-muted-foreground mt-1">All emails have been auto-responded or resolved</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[340px]">
                  {flaggedEmails.slice(0, 5).map(email => (
                    <EmailRow key={email.id} email={email} onClick={() => { openEmailDetail(email); setCurrentScreen('flagged') }} />
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Recent Auto-Responses */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-serif flex items-center gap-2">
                  <HiOutlineCheck className="h-5 w-5 text-emerald-600" />
                  Recent Auto-Responses
                </CardTitle>
                {autoRespondedEmails.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setCurrentScreen('activity')} className="text-xs gap-1">
                    View All <HiOutlineChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {autoRespondedEmails.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <HiOutlineMail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">No auto-responses yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Run the monitor to process incoming emails</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[340px]">
                  {autoRespondedEmails.slice(0, 5).map(email => (
                    <EmailRow key={email.id} email={email} onClick={() => { openEmailDetail(email); setCurrentScreen('activity') }} />
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Agent Info */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-serif text-muted-foreground">Agents Powering This App</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${activeAgentId === EMAIL_MONITOR_AGENT_ID ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Email Monitor Agent</p>
                  <p className="text-xs text-muted-foreground">Scans inbox, auto-responds or flags</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${activeAgentId === HUMAN_REPLY_AGENT_ID ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Human Reply Agent</p>
                  <p className="text-xs text-muted-foreground">Drafts and sends manual replies</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // RENDER: Flagged for Review Screen
  // ========================================================================

  function FlaggedScreen() {
    if (selectedEmail) {
      return <EmailDetailView email={selectedEmail} />
    }

    const searchedFlagged = flaggedEmails.filter(e => {
      if (!searchQuery) return true
      return (e.sender ?? '').toLowerCase().includes(searchQuery.toLowerCase()) || (e.subject ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    })

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold font-serif">Flagged for Review</h2>
            <p className="text-sm text-muted-foreground mt-1">{flaggedEmails.length} email{flaggedEmails.length !== 1 ? 's' : ''} need attention</p>
          </div>
          <Button onClick={runEmailMonitor} disabled={monitorLoading} variant="outline" className="gap-2">
            {monitorLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : <HiOutlineRefresh className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search flagged emails..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {searchedFlagged.length === 0 ? (
              <div className="text-center py-16 px-4">
                <HiOutlineCheck className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-lg font-medium font-serif">No flagged emails</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery ? 'No results match your search' : 'All emails have been resolved. Great job!'}
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[600px]">
                {searchedFlagged.map(email => (
                  <EmailRow key={email.id} email={email} onClick={() => openEmailDetail(email)} />
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // RENDER: Email Detail View
  // ========================================================================

  function EmailDetailView({ email }: { email: ProcessedEmail }) {
    const displayStatus = email.localStatus ?? email.status
    return (
      <div className="space-y-4">
        {/* Back button */}
        <Button variant="ghost" onClick={closeEmailDetail} className="gap-2 -ml-2">
          <HiOutlineChevronLeft className="h-4 w-4" />
          Back to List
        </Button>

        {/* Email Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl font-serif">{email.subject ?? 'No subject'}</CardTitle>
                <CardDescription className="mt-1">
                  From: <span className="font-medium text-foreground">{email.sender ?? 'Unknown'}</span>
                </CardDescription>
                <div className="flex items-center gap-3 mt-2">
                  <StatusBadge status={displayStatus} />
                  <ConfidenceBadge confidence={email.confidence} />
                  <span className="text-xs text-muted-foreground">{formatDateFull(email.received_at)}</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Original Email Body */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Original Message</Label>
              <div className="mt-2 p-4 rounded-lg bg-secondary/40 border border-border/30">
                {renderMarkdown(email.body_snippet ?? '')}
              </div>
            </div>

            {/* Flagged Reason */}
            {email.flagged_reason && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Reason Flagged</Label>
                <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <div className="flex items-start gap-2">
                    <FiAlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{email.flagged_reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Auto Reply Sent */}
            {email.auto_reply_sent && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Auto-Reply Sent</Label>
                <div className="mt-2 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                  {renderMarkdown(email.auto_reply_sent)}
                </div>
              </div>
            )}

            {/* Sent Reply */}
            {email.sentReply && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sent Reply</Label>
                <div className="mt-2 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                  {renderMarkdown(email.sentReply)}
                </div>
              </div>
            )}

            {/* Thread & Message IDs */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {email.thread_id && <span>Thread: {email.thread_id}</span>}
              {email.message_id && <span>Message: {email.message_id}</span>}
            </div>
          </CardContent>
        </Card>

        {/* Reply Section -- only for flagged/in_progress */}
        {(displayStatus === 'flagged' || displayStatus === 'in_progress') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-serif flex items-center gap-2">
                <FiEdit className="h-5 w-5" />
                Compose Reply
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Draft button */}
              <Button onClick={() => draftResponse(email)} disabled={draftLoading} variant="secondary" className="gap-2">
                {draftLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiEdit className="h-4 w-4" />}
                {draftLoading ? 'Generating Draft...' : 'Generate Draft'}
              </Button>

              {/* Text area */}
              <div>
                <Label htmlFor="reply-text" className="text-sm">Reply Text</Label>
                <Textarea
                  id="reply-text"
                  placeholder="Type your reply here, or click Generate Draft to have the AI compose one..."
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={8}
                  className="mt-1 font-sans"
                />
              </div>

              {/* Send button */}
              <div className="flex items-center gap-3">
                <Button onClick={() => sendReply(email, draftText)} disabled={sendLoading || !draftText.trim()} className="gap-2">
                  {sendLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiSend className="h-4 w-4" />}
                  {sendLoading ? 'Sending...' : 'Send Reply'}
                </Button>
                {draftText.trim() && (
                  <span className="text-xs text-muted-foreground">{draftText.trim().length} characters</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ========================================================================
  // RENDER: Activity Log Screen
  // ========================================================================

  function ActivityLogScreen() {
    if (selectedEmail) {
      return <EmailDetailView email={selectedEmail} />
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold font-serif">Activity Log</h2>
            <p className="text-sm text-muted-foreground mt-1">Complete history of processed emails</p>
          </div>
          <Button onClick={runEmailMonitor} disabled={monitorLoading} variant="outline" className="gap-2">
            {monitorLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : <HiOutlineRefresh className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search emails by sender or subject..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2">
            <Button variant={filterType === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterType('all')}>All</Button>
            <Button variant={filterType === 'auto_responded' ? 'default' : 'outline'} size="sm" onClick={() => setFilterType('auto_responded')} className="gap-1">
              <HiOutlineCheck className="h-3.5 w-3.5" /> Auto
            </Button>
            <Button variant={filterType === 'flagged' ? 'default' : 'outline'} size="sm" onClick={() => setFilterType('flagged')} className="gap-1">
              <HiOutlineFlag className="h-3.5 w-3.5" /> Flagged
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {filteredEmails.length === 0 ? (
              <div className="text-center py-16 px-4">
                <FiActivity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-lg font-medium font-serif">No activity yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || filterType !== 'all' ? 'No results match your filters' : 'Run the email monitor to start processing emails'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-secondary/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sender</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmails.map(email => {
                      const displayStatus = email.localStatus ?? email.status
                      return (
                        <tr key={email.id} onClick={() => openEmailDetail(email)} className="border-b border-border/30 hover:bg-secondary/30 cursor-pointer transition-colors">
                          <td className="px-4 py-3 text-sm font-medium truncate max-w-[200px]">{email.sender ?? 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm truncate max-w-[250px]">{email.subject ?? '--'}</td>
                          <td className="px-4 py-3">
                            {email.status === 'auto_responded' ? (
                              <Badge variant="outline" className="text-xs">Auto</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Manual</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={displayStatus} /></td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{formatDate(email.received_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // RENDER: Schedule Screen
  // ========================================================================

  function ScheduleScreen() {
    const [logsOpen, setLogsOpen] = useState(false)

    const handleLoadLogs = () => {
      if (!logsOpen) {
        loadScheduleLogs()
      }
      setLogsOpen(!logsOpen)
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-serif">Schedule Management</h2>
          <p className="text-sm text-muted-foreground mt-1">Control the automated email monitoring schedule</p>
        </div>

        {scheduleError && (
          <InlineNotification type="error" message={scheduleError} onDismiss={() => setScheduleError(null)} />
        )}

        {/* Main Schedule Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${schedule?.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  <FiCalendar className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-serif">Email Monitor Schedule</CardTitle>
                  <CardDescription>
                    {schedule?.cron_expression ? cronToHuman(schedule.cron_expression) : 'Every 15 minutes'} (UTC)
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="schedule-toggle" className="text-sm font-medium">
                  {schedule?.is_active ? 'Active' : 'Paused'}
                </Label>
                <Switch
                  id="schedule-toggle"
                  checked={schedule?.is_active ?? false}
                  onCheckedChange={handleToggleSchedule}
                  disabled={scheduleLoading}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-secondary/40">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${schedule?.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <p className="text-sm font-medium">{schedule?.is_active ? 'Active' : 'Paused'}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/40">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Next Run</p>
                <p className="text-sm font-medium mt-1">{schedule?.next_run_time ? formatDate(schedule.next_run_time) : '--'}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/40">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Run</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium">{schedule?.last_run_at ? formatDate(schedule.last_run_at) : 'Never'}</p>
                  {schedule?.last_run_success !== null && schedule?.last_run_success !== undefined && (
                    schedule.last_run_success
                      ? <HiOutlineCheck className="h-4 w-4 text-emerald-600" />
                      : <FiAlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleTriggerNow} disabled={scheduleLoading} variant="outline" className="gap-2">
                {scheduleLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiPlay className="h-4 w-4" />}
                Run Now
              </Button>
              <Button onClick={loadScheduleData} disabled={scheduleLoading} variant="ghost" className="gap-2">
                <HiOutlineRefresh className="h-4 w-4" />
                Refresh Status
              </Button>
            </div>

            <Separator />

            {/* Execution History */}
            <div>
              <button onClick={handleLoadLogs} className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full text-left">
                {logsOpen ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
                Execution History
              </button>
              {logsOpen && (
                <div className="mt-3">
                  {logsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : scheduleLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No execution logs found</p>
                  ) : (
                    <div className="space-y-2">
                      {scheduleLogs.map(log => (
                        <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/30">
                          <div className="flex items-center gap-3">
                            {log.success ? (
                              <HiOutlineCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <FiAlertCircle className="h-4 w-4 text-red-500" />
                            )}
                            <div>
                              <p className="text-sm font-medium">{log.success ? 'Success' : 'Failed'}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(log.executed_at)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Attempt {log.attempt}/{log.max_attempts}</p>
                            {log.error_message && <p className="text-xs text-red-500 truncate max-w-[200px]">{log.error_message}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Schedule Info */}
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Schedule ID</p>
                <p className="font-mono text-xs mt-1 break-all">{scheduleId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Cron Expression</p>
                <p className="font-mono text-xs mt-1">{schedule?.cron_expression ?? '*/15 * * * *'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Timezone</p>
                <p className="text-xs mt-1">{schedule?.timezone ?? 'UTC'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Agent ID</p>
                <p className="font-mono text-xs mt-1 break-all">{schedule?.agent_id ?? EMAIL_MONITOR_AGENT_ID}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // RENDER: Knowledge Base Screen
  // ========================================================================

  function KnowledgeBaseScreen() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-serif">Knowledge Base</h2>
          <p className="text-sm text-muted-foreground mt-1">Upload support documents to improve auto-response accuracy</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <FiDatabase className="h-5 w-5" />
              Support Documents
            </CardTitle>
            <CardDescription>
              Upload PDF, DOCX, or TXT files containing FAQs, product docs, and support articles. Both agents use this knowledge base for accurate responses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KnowledgeBaseUpload ragId={RAG_ID} />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <FiAlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">About the Knowledge Base</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Documents uploaded here are shared between both the Email Monitor Agent and the Human Reply Agent. When the monitor processes incoming emails, it searches this knowledge base for relevant answers. Higher quality documentation leads to more confident auto-responses and fewer flagged emails.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  RAG ID: <span className="font-mono">{RAG_ID}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 bg-card border-r border-border/50 flex flex-col transition-all duration-200`}>
          {/* Logo */}
          <div className="p-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary text-primary-foreground flex-shrink-0">
                <HiOutlineMail className="h-5 w-5" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <h1 className="text-lg font-bold font-serif truncate">Smart Support Hub</h1>
                  <p className="text-xs text-muted-foreground truncate">AI Email Manager</p>
                </div>
              )}
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setCurrentScreen(item.id); setSelectedEmail(null); setSearchQuery(''); setFilterType('all') }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${currentScreen === item.id ? 'bg-primary/10 text-primary border-r-2 border-primary font-medium' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {(item.count ?? 0) > 0 && (
                      <Badge className="ml-auto bg-amber-600 text-white text-xs px-1.5 py-0 border-0">{item.count}</Badge>
                    )}
                  </>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="border-t border-border/30 p-3">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              {sidebarCollapsed ? <HiOutlineChevronRight className="h-4 w-4" /> : <HiOutlineChevronLeft className="h-4 w-4" />}
              {!sidebarCollapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header className="h-14 border-b border-border/50 bg-card px-6 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold font-serif capitalize">
                {currentScreen === 'flagged' ? 'Flagged for Review' : currentScreen === 'knowledge' ? 'Knowledge Base' : currentScreen}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {/* Schedule Status Indicator */}
              <div className="flex items-center gap-2 text-sm">
                <div className={`h-2 w-2 rounded-full ${schedule?.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-muted-foreground hidden sm:inline">{schedule?.is_active ? 'Monitor Active' : 'Monitor Paused'}</span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              {/* Sample Data Toggle */}
              <div className="flex items-center gap-2">
                <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
                <Switch id="sample-toggle" checked={showSampleData} onCheckedChange={setShowSampleData} />
              </div>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Notification */}
            {notification && (
              <div className="mb-4">
                <InlineNotification type={notification.type} message={notification.message} onDismiss={() => setNotification(null)} />
              </div>
            )}

            {/* Screens */}
            {currentScreen === 'dashboard' && <DashboardScreen />}
            {currentScreen === 'flagged' && <FlaggedScreen />}
            {currentScreen === 'activity' && <ActivityLogScreen />}
            {currentScreen === 'schedule' && <ScheduleScreen />}
            {currentScreen === 'knowledge' && <KnowledgeBaseScreen />}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}
