import { describe, expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { cleanup, protectedFrom, sizeOf } from '../hooks/cleanup'

// Seeded random transcripts. Every property below must hold for every seed.

function rng(seed: number) {
  let s = (Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0 || 1 // spread small seeds
  const next = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
  for (let i = 0; i < 20; i++) next() // warm up
  return next
}
const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0 }
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)] as T

const PATHS = ['/r/a.ts', '/r/b.ts', '/r/c.ts', '/r/d.md']
const CMDS = ['git log', 'git status', 'npm test', 'npm run build', 'ls -la']
const TOOLS = ['Read', 'Read', 'Read', 'Bash', 'Bash', 'Grep', 'Edit', 'Write', 'Agent', 'TodoWrite', 'Task']

function body(r: () => number, kind: string): string {
  const n = Math.floor(r() * r() * 14000) // skewed: many small, some huge
  const line = (i: number) => `${i}\tvalue ${i} ${'z'.repeat(Math.floor(r() * 60))}`
  if (kind === 'ansi') return Array.from({ length: Math.max(1, n / 30) }, (_, i) => `\u001b[3${i % 7}mline ${i % 5}\u001b[0m`).join('\n')
  if (kind === 'progress') return Array.from({ length: Math.max(1, n / 12) }, (_, i) => `step ${i}%`).join('\r') + '\ndone'
  if (kind === 'repeat') return Array(Math.max(1, Math.floor(n / 25))).fill('warning: same thing').join('\n')
  if (kind === 'oneline') return 'q'.repeat(n)
  if (kind === 'empty') return ''
  return Array.from({ length: Math.max(1, Math.floor(n / 40)) }, (_, i) => line(i)).join('\n')
}

function make(seed: number): SessionMessage[] {
  const r = rng(seed)
  const out: SessionMessage[] = []
  let h = 0
  const prompts = 1 + Math.floor(r() * 8)
  let id = 0
  for (let p = 0; p < prompts; p++) {
    out.push({ role: 'user', text: `prompt ${p}`, toolUses: [], handle: `h${h++}` })
    const calls = Math.floor(r() * 7)
    for (let c = 0; c < calls; c++) {
      const tool = pick(r, TOOLS)
      const tid = `t${id++}`
      const input = tool === 'Bash' ? { command: pick(r, CMDS) } : ['Read', 'Edit', 'Write'].includes(tool) ? { file_path: pick(r, PATHS) } : { q: pick(r, ['x', 'y']) }
      out.push({ role: 'assistant', text: r() < 0.3 ? 'thinking out loud' : '', toolUses: [{ tool_use_id: tid, tool, input }], handle: `h${h++}` })
      const kinds = ['lines', 'lines', 'ansi', 'progress', 'repeat', 'oneline', 'empty']
      const same = rng(hash(tool + JSON.stringify(input))) // the same call gives the same output
      const text = r() < 0.45 ? body(same, pick(same, kinds)) : body(r, pick(r, kinds))
      const isError = r() < 0.12
      out.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: tid, text, isError, result: { raw: text } }], handle: `h${h++}` })
    }
    if (r() < 0.6) out.push({ role: 'assistant', text: `answer ${p}`, toolUses: [], handle: `h${h++}` })
  }
  return out
}

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1)
const total = (ms: SessionMessage[]) => ms.reduce((n, m) => n + sizeOf(m), 0)
const results = (ms: SessionMessage[]) => ms.flatMap(m => m.toolResults ?? [])

describe('stress: 400 random transcripts', () => {
  test('structure is never damaged', () => {
    for (const seed of SEEDS) for (const keep of [1, 3]) {
      const input = make(seed)
      const snapshot = JSON.stringify(input)
      const { messages, stats } = cleanup(input, { keepTurns: keep })
      const at = `seed ${seed} keep ${keep}`
      expect(JSON.stringify(input), at + ' input mutated').toBe(snapshot)
      expect(messages.length, at).toBe(input.length)
      input.forEach((m, i) => {
        const o = messages[i]!
        expect(o.role, at).toBe(m.role)
        expect(o.text, at).toBe(m.text)
        expect(o.toolUses, at).toEqual(m.toolUses)
        const a = m.toolResults ?? [], b = o.toolResults ?? []
        expect(b.length, at).toBe(a.length)
        a.forEach((x, j) => {
          expect(b[j]!.tool_use_id, at).toBe(x.tool_use_id)
          expect(b[j]!.isError, at).toBe(x.isError)
          expect(b[j]!.text.length, at + ' result grew').toBeLessThanOrEqual(x.text.length)
        })
        if (o === m) expect(o.handle, at).toBe(m.handle)
        else expect(o.handle, at + ' rebuilt message kept a handle').toBeUndefined()
      })
      expect(stats.charsAfter, at).toBeLessThanOrEqual(stats.charsBefore)
      expect(stats.charsBefore, at).toBe(total(input))
      expect(stats.charsAfter, at).toBe(total(messages))
      const pct = stats.charsBefore === 0 ? 0 : (100 * (stats.charsBefore - stats.charsAfter)) / stats.charsBefore
      expect(Math.abs(stats.pct - pct), at).toBeLessThan(0.051) // pct is rounded to one decimal
    }
  })

  test('the protected zone and the never-touch tools are the very same objects', () => {
    for (const seed of SEEDS) for (const keep of [1, 2, 3]) {
      const input = make(seed)
      const { messages } = cleanup(input, { keepTurns: keep })
      const from = protectedFrom(input, keep)
      for (let i = from; i < input.length; i++) expect(messages[i], `seed ${seed} keep ${keep} idx ${i}`).toBe(input[i])
      const never = new Set<string>()
      for (const m of input) for (const u of m.toolUses) if (['Agent', 'Task', 'TodoWrite'].includes(u.tool)) never.add(u.tool_use_id)
      input.forEach((m, i) => { if ((m.toolResults ?? []).some(x => never.has(x.tool_use_id))) expect(messages[i], `seed ${seed} never-touch ${i}`).toBe(m) })
    }
  })

  test('running it twice finds nothing more (idempotent)', () => {
    for (const seed of SEEDS) for (const keep of [1, 3]) {
      const once = cleanup(make(seed), { keepTurns: keep })
      const twice = cleanup(once.messages, { keepTurns: keep })
      expect(twice.stats.changed, `seed ${seed} keep ${keep}`).toBe(0)
      expect(twice.stats.charsAfter, `seed ${seed} keep ${keep}`).toBe(once.stats.charsAfter)
    }
  })

  test('a larger keepTurns never frees more than a smaller one', () => {
    for (const seed of SEEDS) {
      const freed = [1, 2, 3, 5].map(k => { const s = cleanup(make(seed), { keepTurns: k }).stats; return s.charsBefore - s.charsAfter })
      for (let i = 1; i < freed.length; i++) expect(freed[i]!, `seed ${seed}`).toBeLessThanOrEqual(freed[i - 1]!)
    }
  })

  test('non-Bash errors keep their first 2000 characters when trimmed (Bash ones may also lose ANSI/repeats)', () => {
    for (const seed of SEEDS) {
      const input = make(seed)
      const { messages } = cleanup(input, { keepTurns: 1 })
      input.forEach((m, i) => (m.toolResults ?? []).forEach((x, j) => {
        const y = messages[i]!.toolResults![j]!
        const tool = input.flatMap(q => q.toolUses).find(u => u.tool_use_id === x.tool_use_id)?.tool
        if (x.isError && tool !== 'Bash' && y.text !== x.text && !y.text.startsWith('[seamless-compaction')) expect(y.text.startsWith(x.text.slice(0, 2000)), `seed ${seed}`).toBe(true)
      }))
    }
  })

  test('a result under 300 chars is never stubbed or trimmed (Bash noise removal may still apply)', () => {
    for (const seed of SEEDS) {
      const input = make(seed)
      const { messages } = cleanup(input, { keepTurns: 1 })
      input.forEach((m, i) => (m.toolResults ?? []).forEach((x, j) => {
        if (x.text.length < 300) expect(messages[i]!.toolResults![j]!.text, `seed ${seed}`).not.toMatch(/trimmed by seamless-compaction|^\[seamless-compaction:/)
      }))
    }
  })

  test('the tool_use that goes with a result is never removed or changed', () => {
    for (const seed of SEEDS) {
      const { messages } = cleanup(make(seed), { keepTurns: 1 })
      const uses = new Set(messages.flatMap(m => m.toolUses.map(u => u.tool_use_id)))
      for (const x of results(messages)) expect(uses.has(x.tool_use_id), `seed ${seed} ${x.tool_use_id}`).toBe(true)
    }
  })
})

describe('stress: the generator exercises every rule', () => {
  test('across the seeds each rule fires many times, and many transcripts change', () => {
    const rules = { read: 0, dup: 0, trim: 0, noise: 0 }
    let changed = 0, freed = 0
    for (const seed of SEEDS) {
      const { stats } = cleanup(make(seed), { keepTurns: 1 })
      if (stats.changed > 0) changed++
      freed += stats.charsBefore - stats.charsAfter
      for (const k of Object.keys(rules) as (keyof typeof rules)[]) rules[k] += stats.rules[k] ?? 0
    }
    expect(changed).toBeGreaterThan(SEEDS.length * 0.4)
    expect(freed).toBeGreaterThan(0)
    for (const k of Object.keys(rules) as (keyof typeof rules)[]) expect(rules[k], `rule ${k}`).toBeGreaterThan(20)
  })
})

describe('stress: edge shapes', () => {
  test('empty transcript, only prompts, only results', () => {
    expect(cleanup([], { keepTurns: 3 }).stats.changed).toBe(0)
    const p: SessionMessage[] = [{ role: 'user', text: 'a', toolUses: [] }, { role: 'user', text: 'b', toolUses: [] }]
    expect(cleanup(p, { keepTurns: 1 }).messages).toEqual(p)
    const lone: SessionMessage[] = [{ role: 'user', text: 'x', toolUses: [], toolResults: [{ tool_use_id: 'zz', text: 'k'.repeat(9000), isError: false }] }]
    expect(() => cleanup(lone, { keepTurns: 1 })).not.toThrow()
  })
  test('a result with no matching tool_use does not crash', () => {
    const m: SessionMessage[] = [
      { role: 'user', text: 'a', toolUses: [] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'orphan', text: 'o'.repeat(9000), isError: false }] },
      { role: 'user', text: 'b', toolUses: [] },
    ]
    expect(() => cleanup(m, { keepTurns: 1 })).not.toThrow()
  })
  test('huge single result (2 MB) is trimmed fast', () => {
    const big = Array.from({ length: 40000 }, (_, i) => `row ${i} ${'x'.repeat(40)}`).join('\n')
    const m: SessionMessage[] = [
      { role: 'user', text: 'a', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't', tool: 'Bash', input: { command: 'dump' } }] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: big, isError: false }] },
      { role: 'user', text: 'b', toolUses: [] },
    ]
    const t0 = Date.now()
    const { stats } = cleanup(m, { keepTurns: 1 })
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(stats.pct).toBeGreaterThan(95)
  })
  test('unicode and CRLF text is kept intact where it is not cleaned', () => {
    const t = 'héllo 世界 🚀\r\nline two\r\n'
    const m: SessionMessage[] = [
      { role: 'user', text: 'a', toolUses: [] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'u', text: t, isError: false }] },
      { role: 'user', text: 'b', toolUses: [] },
    ]
    expect(cleanup(m, { keepTurns: 1 }).messages[1]!.toolResults![0]!.text).toBe(t)
  })
  test('a 5000-message transcript is cleaned in under 3 s', () => {
    const input: SessionMessage[] = []
    for (let i = 0; i < 1250; i++) input.push(...make(i + 1).slice(0, 4))
    const t0 = Date.now()
    cleanup(input, { keepTurns: 3 })
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})
