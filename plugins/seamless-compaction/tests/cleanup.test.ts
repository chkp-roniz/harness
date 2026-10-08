import { describe, expect, test } from 'claude-code/testing'

import { cleanup, protectedFrom } from '../hooks/cleanup'
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
    expect(stats.rules).toEqual({ read: 1, dup: 1, trim: 2, noise: 1 })
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
