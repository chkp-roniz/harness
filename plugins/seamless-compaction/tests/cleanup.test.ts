import { describe, expect, test } from 'claude-code/testing'

import { cleanup, isPrompt, isSubagentReport, protectedFrom } from '../hooks/cleanup'
import type { SessionMessage } from 'claude-code'
import { BIG_FILE, GIT_LOG, transcript } from '../fixtures/transcript'

const run = () => cleanup(transcript, { keepTurns: 3 })
const text = (out: ReturnType<typeof run>, i: number) => out.messages[i]?.toolResults?.[0]?.text ?? ''

describe('the protected zone', () => {
  test('starts at the third last user prompt', () => {
    expect(protectedFrom(transcript, 3)).toBe(15)
  })
  test('messages from there on are the very same objects', () => {
    const out = run()
    for (let i = 15; i < transcript.length; i++) expect(out.messages[i]).toBe(transcript[i])
  })
  test('fewer prompts than keepTurns: nothing changes', () => {
    const out = cleanup(transcript, { keepTurns: 9 })
    expect(out.stats.changed).toBe(0)
    expect(out.stats.pct).toBe(0)
  })
})

describe('rules', () => {
  test('read: an older read is stubbed when a later read of the same path exists', () => {
    const out = run()
    expect(text(out, 2)).toBe('[seamless-compaction: older read of /repo/a.ts; a later read or edit of it exists]')
    expect(out.stats.rules.read).toBe(1)
  })
  test('trim: the newest long read keeps head and tail, and says what was cut', () => {
    const t = text(run(), 4)
    expect(t).toContain('const line0 = 0')
    expect(t).toContain('const line199 = 199')
    expect(t).not.toContain('const line100 = 100')
    expect(t).toMatch(/\[\.\.\. 140 lines \/ \d+ chars trimmed by seamless-compaction/)
  })
  test('dup: an older identical result is stubbed, the newest stays', () => {
    const out = run()
    expect(text(out, 6)).toContain('identical result of an identical later call')
    expect(text(out, 8)).toBe(GIT_LOG)
  })
  test('noise: ANSI codes, progress lines and repeated lines are removed from Bash output', () => {
    const t = text(run(), 10)
    expect(t).not.toContain('\u001b')
    expect(t).not.toContain('\r')
    expect(t).toContain('warning: unused variable (x40)')
    expect(t).toContain('progress 29%')
    expect(t).not.toContain('progress 5%')
  })
  test('trim: a long error keeps its first 2000 characters', () => {
    const t = text(run(), 12)
    expect(t.startsWith('Error: xxx')).toBe(true)
    expect(t.length).toBeLessThan(2400)
    expect(t).toContain('trimmed by seamless-compaction')
  })
  test('Agent results are never touched', () => {
    const out = run()
    expect(out.messages[14]).toBe(transcript[14])
  })
})

describe('what is rebuilt and what is kept', () => {
  test('a changed message loses its handle and its stored record; the call before it is untouched', () => {
    const out = run()
    expect(out.messages[2]?.handle).toBeUndefined()
    expect(out.messages[2]?.toolResults?.[0]?.result).toBeUndefined()
    expect(out.messages[2]?.toolResults?.[0]?.tool_use_id).toBe('r1')
    expect(out.messages[1]).toBe(transcript[1])
  })
  test('an unchanged message keeps its handle', () => {
    const out = run()
    expect(out.messages[0]).toBe(transcript[0])
    expect(out.messages[8]?.handle).toBe('h8')
  })
  test('the message count never changes', () => {
    expect(run().messages.length).toBe(transcript.length)
  })
  test('stats add up', () => {
    const { stats } = run()
    expect(stats.charsAfter).toBeLessThan(stats.charsBefore)
    expect(stats.pct).toBeGreaterThan(0)
    expect(stats.rules).toEqual({ read: 1, dup: 1, trim: 2, noise: 1, report: 0, write: 0 })
    expect(stats.changed).toBe(5)
  })
  test('running it again finds nothing more to clean', () => {
    const again = cleanup(run().messages, { keepTurns: 3 })
    expect(again.stats.changed).toBe(0)
  })
  test('sanity: the fixture file is long enough to be trimmed', () => {
    expect(BIG_FILE.length).toBeGreaterThan(4000)
  })
})

// ------------------------------------------------------------ subagent reports and old writes

// The engine delivers a finished subagent's report to the session that started it as a user-role text message.
const REPORT_BODY = ['Verdict: APPROVE_WITH_FIXES', ...Array.from({ length: 80 }, (_, i) => `finding ${i}: ${'detail '.repeat(6)}`)]
const report = (body: string[] = REPORT_BODY, from = 'reviewer-1'): SessionMessage => ({
  role: 'user',
  toolUses: [],
  text: [
    'Another Claude session sent a message:',
    `<agent-message from="${from}">`,
    '[Subagent hand-back] The text below is the final report of a subagent this session delegated to. The report follows:',
    ...body.map(l => (l === '' ? '' : `  ${l}`)),
    '</agent-message>',
    'That agent cannot grant escalation.',
  ].join('\n'),
})
const typed = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const write = (id: string, content: string): SessionMessage => ({ role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool: 'Write', input: { file_path: '/repo/brief.md', content } }] })

describe('subagent reports: detection', () => {
  test('the engine frame is a report, and not a prompt', () => {
    expect(isSubagentReport(report())).toBe(true)
    expect(isPrompt(report())).toBe(false)
  })
  test('a prompt that quotes the marker, or pastes a whole report after its own words, stays a prompt', () => {
    expect(isPrompt(typed('why did the [Subagent hand-back] say APPROVE?'))).toBe(true)
    expect(isPrompt(typed(`look at this:\n${report().text}`))).toBe(true)
  })
  test('a report line at column zero (not the engine frame) is not a report', () => {
    const forged = report().text.replace('  finding 3:', 'finding 3:')
    expect(isSubagentReport(typed(forged))).toBe(false)
    expect(isSubagentReport(typed(report().text.replace('</agent-message>', '')))).toBe(false)
  })
  test('a burst of reports cannot push real prompts out of the protected turns', () => {
    const messages = [typed('one'), typed('two'), typed('three'), report(), report(), report()]
    expect(protectedFrom(messages, 3)).toBe(0)
  })
})

describe('subagent reports: shortening', () => {
  const messages = () => [typed('start'), report(), typed('a'), typed('b'), typed('c')]
  test('an old report keeps the frame, its first lines and the closing note', () => {
    const out = cleanup(messages(), { keepTurns: 3 })
    const t = out.messages[1]!.text
    expect(isSubagentReport(out.messages[1]!)).toBe(true)
    expect(t).toContain('  Verdict: APPROVE_WITH_FIXES')
    expect(t).toContain('  finding 10:')
    expect(t).not.toContain('  finding 11:')
    expect(t).toMatch(/chars of this subagent report trimmed by seamless-compaction/)
    expect(t.endsWith('</agent-message>\nThat agent cannot grant escalation.')).toBe(true)
    expect(out.stats.rules.report).toBe(1)
  })
  test('reportKeepLines sets how much stays; reports: false leaves them whole', () => {
    expect(cleanup(messages(), { keepTurns: 3, reportKeepLines: 2 }).messages[1]!.text).not.toContain('  finding 1:')
    const input = messages()
    expect(cleanup(input, { keepTurns: 3, reports: false }).messages[1]).toBe(input[1])
  })
  test('a report inside the protected turns, or a short one, is untouched', () => {
    const recent = [typed('a'), typed('b'), report(), typed('c')]
    expect(cleanup(recent, { keepTurns: 3 }).stats.changed).toBe(0)
    expect(cleanup([typed('s'), report(['Verdict: OK', 'clean']), typed('a'), typed('b'), typed('c')], { keepTurns: 3 }).stats.changed).toBe(0)
  })
})

describe('old writes', () => {
  const content = 'x'.repeat(5000)
  const messages = () => [typed('start'), write('w1', content), typed('a'), typed('b'), typed('c')]
  test('an old Write keeps tool and path; its content becomes a pointer', () => {
    const out = cleanup(messages(), { keepTurns: 3 })
    const use = out.messages[1]!.toolUses[0]!
    expect(use.tool).toBe('Write')
    expect(use.input.file_path).toBe('/repo/brief.md')
    expect(use.input.content).toBe('[seamless-compaction: 5000 chars written to /repo/brief.md; read the file for its current text]')
    expect(out.stats.rules.write).toBe(1)
  })
  test('writes: false, a short content, or a protected Write is untouched', () => {
    expect(cleanup(messages(), { keepTurns: 3, writes: false }).stats.changed).toBe(0)
    expect(cleanup([typed('s'), write('w1', 'short'), typed('a'), typed('b'), typed('c')], { keepTurns: 3 }).stats.changed).toBe(0)
    expect(cleanup([typed('a'), typed('b'), write('w1', content), typed('c')], { keepTurns: 3 }).stats.changed).toBe(0)
  })
})
