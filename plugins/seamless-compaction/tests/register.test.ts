import { describe, expect, mock, test } from 'claude-code/testing'

import { transcript } from '../fixtures/transcript'


// The world beneath the plugin: a clock, env, a file system we can read back, the session's figures, and an
// "engine" that answers a compaction with a summary, so a test can tell when the plugin did not answer itself.
function world(on: any, extra: { percent?: number; turns?: number; tokens?: number | null; compactionWindow?: number; usageFails?: boolean } = {}) {
  const clock = mock.clock(on, { now: 1759600000000 })
  mock.env(on, { HOME: '/home/test' })
  const w: any = { files: new Map<string, string>(), toasts: [] as string[], logs: [] as string[], engineCalls: 0, engineSaw: undefined as unknown, engineInstructions: undefined as unknown, failWrite: false, clock }
  on('fs.exists', (_$: unknown, e: { path: string }) => ({ value: w.files.has(e.path) }))
  on('fs.read', (_$: unknown, e: { path: string }) => ({ value: w.files.get(e.path) ?? '' }))
  on('fs.write', (_$: unknown, e: { path: string; text: string }) => { if (w.failWrite) throw new Error('disk full'); w.files.set(e.path, e.text); return { value: undefined } })
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.turns', () => ({ value: extra.turns ?? 10 }))
  // `percent` is the model's window (200k) as the engine reports it. A compaction window, when given, is what the breakdown measures.
  on('session.usage', (_$: unknown, e: { breakdown?: string }) => {
    if (extra.usageFails) throw new Error('usage unavailable')
    const pct = extra.percent ?? 85
    const tokens = extra.tokens === null ? undefined : (extra.tokens ?? Math.round(2000 * pct))
    const context: any = { window: 200000, tokens, percent: tokens === undefined ? undefined : pct }
    if (e?.breakdown && extra.compactionWindow) context.breakdown = { rawMaxTokens: extra.compactionWindow, maxTokens: extra.compactionWindow, totalTokens: 12345, percentage: 0, categories: [], gridRows: [], autocompactSource: 'env', model: 'm' }
    return { value: { startedAt: 0, context, rateLimits: [] } }
  })
  on('session.messages', () => ({ value: transcript }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', (_$: unknown, e: { text: string }) => { w.logs.push(e.text); return { value: undefined } })
  on('ui.toast', (_$: unknown, e: { text: string }) => { w.toasts.push(e.text); return { value: undefined } })
  on('turn.complete', () => ({ text: 'done' }))
  on('session.compact', (_$: unknown, e: { messages: unknown }) => {
    w.engineCalls++
    w.engineSaw = e.messages; w.engineInstructions = (e as any).instructions
    return { messages: [{ role: 'user', text: 'SUMMARY', toolUses: [] }], tokensBefore: 90000, tokensAfter: 5000 }
  })
  return w as typeof w & { log: string }
}

const LOG = '/home/test/.claude/seamless-compaction.log'

describe('the engine compacts (window full)', () => {
  test('a big enough cleanup answers by itself: no summary, one log line with session and percent', async ($, on) => {
    const w = world(on)
    const r = await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
    expect((r.messages ?? []).length).toBe(transcript.length)
    const lines = (w.files.get(LOG) ?? '').trim().split('\n')
    expect(lines.length).toBe(1)
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z session=sess-1 agent=main trigger=auto before=\S+ after=\S+ compaction=\d+\.\d% rules=/)
    expect(w.toasts[0]).toContain('Cleaned context')
  })

  test('too little to clean: the engine summarizes, and the line says so', async ($, on) => {
    const w = world(on)
    const small = transcript.slice(15) // only protected messages
    const r = await $.session.compact({ trigger: 'auto', messages: small } as any)
    expect(w.engineCalls).toBe(1)
    expect((r.messages ?? [])[0]?.text).toBe('SUMMARY')
    expect(w.files.get(LOG)).toContain('result=engine-summary')
    expect(w.files.get(LOG)).toContain('compaction=0.0%')
  })

  test('a subagent compaction is cleaned and logged under its id', async ($, on) => {
    const w = world(on)
    await $.session.compact({ trigger: 'auto', agentId: 'sub9', messages: transcript } as any)
    expect(w.files.get(LOG)).toContain('agent=sub9')
    expect(w.toasts.length).toBe(0) // the toast is for the main session
  })

  test('manual and precompute are left alone', async ($, on) => {
    const w = world(on)
    await $.session.compact({ trigger: 'manual', messages: transcript } as any)
    await $.session.compact({ trigger: 'precompute', messages: transcript } as any)
    expect(w.engineCalls).toBe(2)
    expect(w.files.has(LOG)).toBe(false)
  })

  test('another plugin\'s compaction is left alone', async ($, on) => {
    const w = world(on)
    await $.session.compact({ trigger: 'plugin', instructions: 'keep the plan', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
    expect(w.files.has(LOG)).toBe(false)
  })
})

describe('only once the context is 70% full', () => {
  test('main session below 70%: the engine compacts as before, nothing is logged', async ($, on) => {
    const w = world(on, { percent: 45 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
    expect(w.files.has(LOG)).toBe(false)
  })
  test('main session at exactly 70%: cleaned', async ($, on) => {
    const w = world(on, { percent: 70 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
    expect(w.files.get(LOG)).toContain('agent=main')
  })
  test('a subagent is not gated: its own compaction means its window is full', async ($, on) => {
    const w = world(on, { percent: 10 })
    await $.session.compact({ trigger: 'auto', agentId: 'sub2', messages: transcript } as any)
    expect(w.files.get(LOG)).toContain('agent=sub2')
  })
  test('startAt can be lowered', { options: { startAt: 30 } }, async ($, on) => {
    const w = world(on, { percent: 45 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
  })
})

describe('the gate follows the compaction window, not the model window', () => {
  // The model's window is 200k. A compaction window of 50k (CLAUDE_CODE_AUTO_COMPACT_WINDOW) with 45k used is 90% full,
  // although the engine's own figure says 22.5%.
  test('small compaction window, 90% full of it: cleaned', async ($, on) => {
    const w = world(on, { tokens: 45000, compactionWindow: 50000 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
    expect(w.files.get(LOG)).toContain('agent=main')
  })
  test('small compaction window, only 40% full of it: left to the engine', async ($, on) => {
    const w = world(on, { tokens: 20000, compactionWindow: 50000 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
    expect(w.files.has(LOG)).toBe(false)
  })
  test('compaction window equal to the model window behaves as before', async ($, on) => {
    const w = world(on, { tokens: 150000, compactionWindow: 200000 }) // 75%
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
  })
  test('no token count yet (just after a compaction): the breakdown estimate is used', async ($, on) => {
    // totalTokens in the mock is 12345 over a 20000 window = 61.7%: below 70, so the engine compacts
    const w = world(on, { tokens: null, compactionWindow: 20000 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
  })
  test('no breakdown: falls back to the engine\'s percent', async ($, on) => {
    const w = world(on, { percent: 85 })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
  })
  test('nothing measurable at all: never blocks a cleanup', async ($, on) => {
    const w = world(on, { tokens: null })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
  })
  test('usage failing: never blocks a cleanup', async ($, on) => {
    const w = world(on, { usageFails: true })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(0)
  })
})

describe('other compactions', () => {
  test('a plugin-triggered compaction, even with the old marker text, is left to the engine', async ($, on) => {
    const w = world(on)
    await $.session.compact({ trigger: 'plugin', instructions: 'seamless-compaction:cleanup', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
  })
})

describe('the log', () => {
  test('lines add up, one per operation', async ($, on) => {
    const w = world(on)
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    await $.session.compact({ trigger: 'auto', agentId: 'sub1', messages: transcript } as any)
    expect((w.files.get(LOG) ?? '').trim().split('\n').length).toBe(2)
  })
  test('a log that cannot be written never breaks the compaction', async ($, on) => {
    const w = world(on)
    w.failWrite = true
    const r = await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect((r.messages ?? []).length).toBe(transcript.length)
    expect(w.logs.some((l: string) => l.includes('could not write the log'))).toBe(true)
  })
})

describe('/seamless-compaction', () => {
  test('off hands compactions back to the engine; on brings the cleanup back', async ($, on) => {
    const w = world(on)
    await $.command.run({ command: 'seamless-compaction', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
    await $.command.run({ command: 'seamless-compaction', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    expect(w.engineCalls).toBe(1)
  })
  test('with no argument it lists the last operations', async ($, on) => {
    world(on)
    await $.session.compact({ trigger: 'auto', messages: transcript } as any)
    const text = (await $.command.run({ command: 'seamless-compaction', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text ?? ''
    expect(text).toContain('seamless-compaction is on')
    expect(text).toMatch(/main auto \d+\.\d% cleanup/)
  })
  test('an unknown argument says so and still shows the status', async ($, on) => {
    world(on)
    const text = (await $.command.run({ command: 'seamless-compaction', args: 'bogus', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text ?? ''
    expect(text).toContain('Unknown argument "bogus"')
    expect(text).toContain('seamless-compaction is on')
  })
  test('off says it is for this session only', async ($, on) => {
    world(on)
    const text = (await $.command.run({ command: 'seamless-compaction', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text ?? ''
    expect(text).toContain('this session only')
  })
  test('startAt 0 is described as every engine compaction', { options: { startAt: 0 } }, async ($, on) => {
    world(on)
    const text = (await $.command.run({ command: 'seamless-compaction', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text ?? ''
    expect(text).toContain('whenever the engine compacts')
    expect(text).not.toContain('0% full')
  })
})
