import type { SessionMessage } from 'claude-code'

/** Light cleanup of old tool results. Pure: no engine calls, so it can be tested alone. */

export type Rule = 'read' | 'dup' | 'trim' | 'noise' | 'report' | 'write'

export type CleanupOptions = {
  /** The last N user prompts, and everything after the first of them, are never changed. */
  keepTurns: number
  /** Results longer than this many characters are trimmed (rule "trim"). */
  longChars: number
  /** Old subagent reports shrink to their first lines (rule "report"). */
  reports: boolean
  /** Lines of an old subagent report that are kept: the verdict and top findings come first. */
  reportKeepLines: number
  /** Old Write calls keep their path; their content becomes a pointer to the file (rule "write"). */
  writes: boolean
}

export type CleanupStats = {
  charsBefore: number
  charsAfter: number
  /** Share of the transcript that was cleaned away, 0 to 100, one decimal. */
  pct: number
  /** Results changed per rule. */
  rules: Record<Rule, number>
  /** Messages that were rebuilt (they lose the engine's handle). */
  changed: number
}

export const DEFAULTS: CleanupOptions = { keepTurns: 3, longChars: 4000, reports: true, reportKeepLines: 12, writes: true }

const PROTECTED_TOOLS = new Set(['Agent', 'Task', 'TodoWrite'])
const MIN_STUB_CHARS = 300 // stubbing a smaller result saves nothing
const HEAD_LINES = 40
const TAIL_LINES = 20
const ERROR_KEEP = 2000
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

const REPORT_MIN_CHARS = 1500 // a shorter report stays whole
const WRITE_MIN_CHARS = 1500 // a shorter Write content stays inline

type ToolResult = NonNullable<SessionMessage['toolResults']>[number]
type Use = { tool: string; input: Record<string, unknown> }

/**
 * A finished subagent's report, as the engine delivers it to the session that started the agent: a user-role
 * text message, not a tool result, so the tool rules never see it. The whole frame must match, not just the
 * marker, so a prompt that quotes or pastes a report is still a prompt:
 *
 *   Another Claude session sent a message:
 *   <agent-message from="<agent>">
 *   [Subagent hand-back] <the engine's note>
 *     <every report line indented by two spaces>
 *   </agent-message>
 *   <the engine's closing note>
 */
const FRAME_HEAD = 'Another Claude session sent a message:'
const FRAME_FROM = /^<agent-message from="[^"\n]+">$/
const HANDBACK = '[Subagent hand-back]'
const FRAME_END = '</agent-message>'

export function isSubagentReport(m: SessionMessage): boolean {
  if (m.role !== 'user' || (m.toolResults?.length ?? 0) > 0) return false
  const lines = m.text.split('\n')
  if (lines[0] !== FRAME_HEAD || !FRAME_FROM.test(lines[1] ?? '') || !(lines[2] ?? '').startsWith(HANDBACK)) return false
  const end = lines.indexOf(FRAME_END, 3)
  return end > 3 && lines.slice(3, end).every(l => l === '' || l.startsWith('  '))
}

/** A prompt the person typed. Subagent reports are not, so a burst of them cannot push real prompts out of the protected turns. */
export const isPrompt = (m: SessionMessage) => m.role === 'user' && (m.toolResults?.length ?? 0) === 0 && m.text.trim() !== '' && !isSubagentReport(m)

/** An old report cut to the frame and its first lines; the engine's closing note stays. Undefined when too little would go. */
export function shortenReport(text: string, keepLines: number): string | undefined {
  if (text.length < REPORT_MIN_CHARS) return undefined
  const lines = text.split('\n')
  const end = lines.indexOf(FRAME_END, 3)
  const kept: string[] = []
  let i = 3
  for (; i < end && kept.length < keepLines; i++) if ((lines[i] ?? '').trim() !== '') kept.push(lines[i]!)
  const cut = lines.slice(i, end).join('\n')
  if (cut.trim().length < 200) return undefined
  return [...lines.slice(0, 3), ...kept,
    `  [... ${cut.length} chars of this subagent report trimmed by seamless-compaction; the full text is in the session transcript]`,
    ...lines.slice(end)].join('\n')
}

const bigWrite = (u: NonNullable<SessionMessage['toolUses']>[number]) =>
  u.tool === 'Write' && typeof u.input?.content === 'string' && u.input.content.length >= WRITE_MIN_CHARS

export function sizeOf(m: SessionMessage): number {
  let n = m.text.length
  for (const u of m.toolUses ?? []) n += JSON.stringify(u.input ?? {}).length + u.tool.length
  for (const r of m.toolResults ?? []) n += r.text.length
  return n
}

/** Index of the first protected message: the start of the keepTurns-th last user prompt. */
export function protectedFrom(messages: readonly SessionMessage[], keepTurns: number): number {
  let seen = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m || !isPrompt(m)) continue
    if (++seen >= keepTurns) return i
  }
  return 0 // fewer prompts than keepTurns: everything is protected
}

const pathOf = (input: Record<string, unknown>): string | undefined => {
  const p = input.file_path ?? input.notebook_path ?? input.path
  return typeof p === 'string' ? p : undefined
}

function noise(text: string): string {
  const lines = text.replace(ANSI, '').split('\n').map(l => (l.includes('\r') ? (l.split('\r').filter(Boolean).pop() ?? '') : l))
  const out: string[] = []
  for (let i = 0; i < lines.length; ) {
    let j = i + 1
    while (j < lines.length && lines[j] === lines[i]) j++
    const line = lines[i] ?? ''
    out.push(j - i > 2 && line.trim() !== '' ? `${line} (x${j - i})` : lines.slice(i, j).join('\n'))
    i = j
  }
  return out.join('\n')
}

function trim(text: string, isError: boolean, longChars: number): string | undefined {
  if (isError) {
    if (text.length <= ERROR_KEEP + 200) return undefined
    return `${text.slice(0, ERROR_KEEP)}\n[... ${text.length - ERROR_KEEP} chars of this error trimmed by seamless-compaction; re-run the tool for the full output]`
  }
  if (text.length <= longChars) return undefined
  const lines = text.split('\n')
  if (lines.length > HEAD_LINES + TAIL_LINES + 5) {
    const cut = lines.length - HEAD_LINES - TAIL_LINES
    const dropped = lines.slice(HEAD_LINES, lines.length - TAIL_LINES).join('\n').length
    return [...lines.slice(0, HEAD_LINES), `[... ${cut} lines / ${dropped} chars trimmed by seamless-compaction; re-run the tool for the full output]`, ...lines.slice(-TAIL_LINES)].join('\n')
  }
  // Few but very long lines: cut by characters.
  const head = Math.floor(longChars / 2)
  const tail = Math.floor(longChars / 4)
  return `${text.slice(0, head)}\n[... ${text.length - head - tail} chars trimmed by seamless-compaction; re-run the tool for the full output]\n${text.slice(-tail)}`
}

export function cleanup(messages: readonly SessionMessage[], options: Partial<CleanupOptions> = {}): { messages: SessionMessage[]; stats: CleanupStats } {
  const o = { ...DEFAULTS, ...options }
  const limit = protectedFrom(messages, o.keepTurns)

  // The call each result answers, and where later reads/edits of a path happen.
  const uses = new Map<string, Use>()
  const touched = new Map<string, number>() // path -> index of the last Read/Edit/Write of it
  const lastSame = new Map<string, number>() // tool+input+text -> index of the newest identical result
  messages.forEach((m, i) => {
    for (const u of m.toolUses ?? []) {
      uses.set(u.tool_use_id, { tool: u.tool, input: u.input ?? {} })
      const p = pathOf(u.input ?? {})
      if (p && ['Read', 'Edit', 'Write', 'NotebookEdit'].includes(u.tool)) touched.set(p, i)
    }
  })
  const sameKey = (r: ToolResult) => {
    const u = uses.get(r.tool_use_id)
    return u ? `${u.tool}\u0000${JSON.stringify(u.input)}\u0000${r.text}` : undefined
  }
  messages.forEach((m, i) => {
    for (const r of m.toolResults ?? []) {
      const k = sameKey(r)
      if (k && !r.isError) lastSame.set(k, i)
    }
  })

  const rules: Record<Rule, number> = { read: 0, dup: 0, trim: 0, noise: 0, report: 0, write: 0 }
  let changed = 0
  let charsBefore = 0
  let charsAfter = 0

  const out = messages.map((m, i) => {
    const before = sizeOf(m)
    charsBefore += before
    if (i < limit && o.reports && isSubagentReport(m)) {
      const short = shortenReport(m.text, Math.max(1, o.reportKeepLines))
      if (short !== undefined) {
        rules.report++
        changed++
        const rebuilt: SessionMessage = { role: m.role, text: short, toolUses: m.toolUses }
        charsAfter += sizeOf(rebuilt)
        return rebuilt
      }
    }
    // An old Write's content is on disk already. The call stays, with its path; only the content becomes a pointer.
    if (i < limit && o.writes && (m.toolUses ?? []).some(bigWrite)) {
      const toolUses = m.toolUses.map(u => bigWrite(u)
        ? { ...u, input: { ...u.input, content: `[seamless-compaction: ${(u.input.content as string).length} chars written to ${pathOf(u.input) ?? 'the file'}; read the file for its current text]` } }
        : u)
      rules.write++
      changed++
      const rebuilt: SessionMessage = { role: m.role, text: m.text, toolUses, toolResults: m.toolResults }
      charsAfter += sizeOf(rebuilt)
      return rebuilt
    }
    if (i >= limit || (m.toolResults?.length ?? 0) === 0) {
      charsAfter += before
      return m
    }
    let touchedMessage = false
    const results = m.toolResults!.map(r => {
      const use = uses.get(r.tool_use_id)
      if (!use || PROTECTED_TOOLS.has(use.tool) || r.text.length === 0) return r
      let text = r.text
      const stub = (rule: Rule, why: string) => {
        rules[rule]++
        return `[seamless-compaction: ${why}]`
      }
      const path = pathOf(use.input)
      if (!r.isError && text.length >= MIN_STUB_CHARS) {
        if (use.tool === 'Read' && path && (touched.get(path) ?? -1) > i) text = stub('read', `older read of ${path}; a later read or edit of it exists`)
        else {
          const k = sameKey(r)
          if (k && (lastSame.get(k) ?? i) > i) text = stub('dup', 'identical result of an identical later call; see the later one')
        }
      }
      if (text === r.text) {
        if (use.tool === 'Bash') {
          const clean = noise(text)
          if (text.length - clean.length >= 100) {
            text = clean
            rules.noise++
          }
        }
        const t = trim(text, r.isError, o.longChars)
        if (t !== undefined) {
          text = t
          rules.trim++
        }
      }
      if (text === r.text) return r
      touchedMessage = true
      return { ...r, text, result: undefined }
    })
    if (!touchedMessage) {
      charsAfter += before
      return m
    }
    changed++
    // Rebuilt from its parts: no handle, so the engine reads it as built here.
    const rebuilt: SessionMessage = { role: m.role, text: m.text, toolUses: m.toolUses, toolResults: results }
    charsAfter += sizeOf(rebuilt)
    return rebuilt
  })

  const saved = charsBefore - charsAfter
  const pct = charsBefore > 0 ? Math.round((saved / charsBefore) * 1000) / 10 : 0
  return { messages: out, stats: { charsBefore, charsAfter, pct, rules, changed } }
}

export const tokensOf = (chars: number) => Math.ceil(chars / 4)
