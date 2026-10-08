import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RecentOp } from '../types'
import { cleanup, tokensOf } from './cleanup'
import type { CleanupOptions, CleanupStats } from './cleanup'
import { appendLine, formatLine } from './log'
import type { LogIo, Op } from './log'

const MAX_RECENT = 5
const DEFAULT_START_AT = 70 // % of the context window; below it nothing is cleaned

const disabled = atom({ plugin: 'seamless-compaction', key: 'disabled' } as const, false)
const recent = atom({ plugin: 'seamless-compaction', key: 'recent' } as const, [] as RecentOp[])

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)
const k = (tokens: number) => (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens))
const saved = (s: CleanupStats) => s.charsBefore - s.charsAfter

const io = ($: EngineInterface): LogIo => ({
  exists: p => $.fs.exists(p),
  read: p => $.fs.read(p),
  write: (p, t) => $.fs.write(p, t),
})

function line(r: RecentOp): string {
  const t = new Date(r.at).toISOString().slice(11, 16)
  return `${t} ${r.agent} ${r.trigger} ${r.pct.toFixed(1)}% ${r.result}`
}

/** One log line, the state list, and (main session only) a toast. A failure here never breaks a compaction. */
async function record($: EngineInterface, agent: string, trigger: string, stats: CleanupStats, result: Op['result']) {
  try {
    const at = await $.clock.now()
    const op: Op = { at, session: await $.session.id(), agent, trigger, stats, result }
    const home = await $.env.get('HOME')
    if (home) {
      const failed = await appendLine(`${home}/.claude/seamless-compaction.log`, io($), formatLine(op))
      if (failed) $.ui.log(`seamless-compaction: could not write the log (${failed})`)
    }
    await update($, recent, (list: RecentOp[]) =>
      [{ at, agent, trigger, pct: stats.pct, result }, ...(list ?? [])].slice(0, MAX_RECENT),
    )
    if (result === 'cleanup' && agent === 'main') {
      $.ui.toast(`Cleaned context: ${k(tokensOf(stats.charsBefore))} -> ${k(tokensOf(stats.charsAfter))} tokens (-${stats.pct.toFixed(1)}%)`)
    }
  } catch (err) {
    $.ui.log(`seamless-compaction: could not record an operation (${String(err).slice(0, 120)})`)
  }
}

/**
 * How full the main context is, in % of the window the engine compacts at. That window is smaller than the model's
 * when CLAUDE_CODE_AUTO_COMPACT_WINDOW or a setting lowers it, and `context.percent` always measures the model's.
 * Undefined when nothing can be measured (a fresh session, an unreadable figure): that never blocks a cleanup.
 */
export async function fillPct($: EngineInterface): Promise<number | undefined> {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const max = context.breakdown?.rawMaxTokens
    const used = context.tokens ?? context.breakdown?.totalTokens
    if (typeof max === 'number' && max > 0 && typeof used === 'number') return Math.round((used / max) * 1000) / 10
    return context.percent
  } catch {
    return undefined
  }
}

export const register: Register = (on, options) => {
  const startAt = num(options.startAt, DEFAULT_START_AT)
  const minAutoPct = num(options.minAutoPct, 30)
  const clean: Partial<CleanupOptions> = { keepTurns: Math.max(1, num(options.keepTurns, 3)) }

  // ------------------------------------------------------------ start

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'seamless-compaction',
      description: 'Cleanup of old tool results. "on" / "off" switch it, no argument shows the last operations.',
      argumentHint: '[on | off]',
    })
    return next(e)
  })

  // ------------------------------------------------------------ the compaction itself

  on('session.compact', async ($, e, next) => {
    if (e.trigger !== 'auto') return next(e) // manual, precompute and other plugins' compactions pass through untouched
    if (await read($, disabled)) return next(e)

    try {
      const agent = e.agentId ?? 'main'
      // Below startAt the engine compacts as it always did. Only the main session has a figure to check:
      // $.session.usage() is the main context, so a subagent's own compaction (it means that window is full) is not gated.
      if (e.agentId === undefined && ((await fillPct($)) ?? Infinity) < startAt) return next(e)
      const { messages, stats } = cleanup(e.messages ?? (await $.session.messages()), clean)
      // The engine's own compaction (window full), main or subagent.
      if (stats.pct >= minAutoPct) {
        await record($, agent, e.trigger, stats, 'cleanup')
        return { messages }
      }
      await record($, agent, e.trigger, stats, 'engine-summary')
      return stats.changed > 0 ? next({ ...e, messages }) : next(e)
    } catch (err) {
      $.ui.log(`seamless-compaction: left to the engine (${String(err).slice(0, 120)})`)
      return next(e)
    }
  })

  // ------------------------------------------------------------ /seamless-compaction

  on('command.run', { command: 'seamless-compaction' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await update($, disabled, () => arg === 'off')
      return { text: arg === 'off' ? 'seamless-compaction is off for this session only. The engine compacts as before.' : 'seamless-compaction is on for this session.' }
    }
    const list = (await read($, recent)) ?? []
    const state = (await read($, disabled)) ? 'off for this session' : 'on'
    const when = startAt > 0 ? `once the compaction window is ${startAt}% full` : 'whenever the engine compacts'
    return {
      text: [
        ...(arg ? [`Unknown argument "${arg.slice(0, 40)}". Use: /seamless-compaction [on | off].`] : []),
        `seamless-compaction is ${state}. When the engine compacts (window full), it cleans old tool results first, ${when}${startAt > 0 ? '; below that the engine summarizes as before' : ''}.`,
        ...(list.length ? list.map(line) : ['No operation yet in this session.']),
      ].join('\n'),
    }
  })
}
