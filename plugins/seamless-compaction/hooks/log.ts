import type { CleanupStats } from './cleanup'
import { tokensOf } from './cleanup'

/** One line per operation in ~/.claude/seamless-compaction.log. Never any conversation content. */

export type Op = {
  at: number
  session: string
  /** 'main' or the subagent's id. */
  agent: string
  trigger: string
  stats: CleanupStats
  /** What happened to the compaction: 'cleanup' (ours answered), 'engine-summary' (too little to clean, engine went on), 'skipped'. */
  result: 'cleanup' | 'engine-summary' | 'skipped'
}

const MAX_BYTES = 1024 * 1024

const k = (tokens: number) => (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens))

export function formatLine(op: Op): string {
  const s = op.stats
  const rules = (Object.entries(s.rules) as [string, number][]).filter(([, n]) => n > 0).map(([r, n]) => `${r}:${n}`).join(',')
  return [
    new Date(op.at).toISOString().replace(/\.\d+Z$/, 'Z'),
    `session=${op.session}`,
    `agent=${op.agent}`,
    `trigger=${op.trigger}`,
    `before=${k(tokensOf(s.charsBefore))}`,
    `after=${k(tokensOf(s.charsAfter))}`,
    `compaction=${s.pct.toFixed(1)}%`,
    op.result === 'cleanup' ? `rules=${rules || 'none'}` : `result=${op.result}`,
  ].join(' ')
}

/** The three file calls the log needs, so this file never holds the engine's `$`. */
export type LogIo = {
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

let queue: Promise<void> = Promise.resolve()

/** Appends one line. Calls are serialized so two writes never lose each other's line. Failures are returned, never thrown. */
export function appendLine(path: string, io: LogIo, line: string): Promise<string | undefined> {
  const run = async (): Promise<string | undefined> => {
    try {
      let text = (await io.exists(path)) ? await io.read(path) : ''
      if (text.length > MAX_BYTES) {
        await io.write(`${path}.1`, text)
        text = ''
      }
      await io.write(path, `${text}${line}\n`)
      return undefined
    } catch (err) {
      return String(err).slice(0, 120)
    }
  }
  const result = queue.then(run)
  queue = result.then(() => undefined)
  return result
}
