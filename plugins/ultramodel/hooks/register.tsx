import { atom, read, update } from 'claude-code'
import type { Hook, Register, TurnCompleteInput } from 'claude-code'

import type { Status } from '../types'
import { costUsd, highlight, labelOf, pickModel } from './logic'

type Dollar = Parameters<Hook<'turn.complete'>>[0]

const status = atom({ plugin: 'ultramodel', key: 'status' } as const, {
  next: null,
  current: null,
  lastUsd: null,
  sessionUsd: 0,
  switched: 0,
} as Status)

type Turn = { turnId: string; model: string | null }

let pending: string | null = null
let active: Turn | null = null

export const register: Register = on => {
  on('prompt.submit', ($, e, next) => {
    pending = pickModel(e.text)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const model = pending
      pending = null
      active = { turnId: e.turnId, model }

      if (model !== null) {
        $.ui.toast(`Ultramodel: ${labelOf(model)} for this turn`)
        await update($, status, s => ({ ...s, current: labelOf(model) }))
      }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isSwitched = active !== null && active.model !== null && e.agentId === undefined && e.turnId === active.turnId

    return yield* next(isSwitched ? { ...e, model: active.model } : e)
  })

  on('turn.complete', async ($, e, next) => {
    if (active !== null && e.agentId === undefined && e.turnId === active.turnId) {
      const turn = active
      active = null

      await record($, turn, e)
    }

    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)

    return { ...box, decorations: [...(box.decorations ?? []), ...highlight(box.text)] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, status)

    if (s.current === null && s.switched === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {s.current === null ? null : <Text color="suggestion">Ultramodel: {s.current} this turn </Text>}
        <Text dimColor>
          {s.switched} switched turns, ${s.sessionUsd.toFixed(4)} this session
          {s.lastUsd === null ? '' : `, last $${s.lastUsd.toFixed(4)}`}
        </Text>
      </Box>
    )
  })
}

async function record($: Dollar, turn: Turn, e: TurnCompleteInput): Promise<void> {
  const usage = e.usage
  const usd = usage === undefined ? null : costUsd(usage.model, usage)
  const row = {
    ts: new Date(await $.clock.now()).toISOString(),
    turnId: turn.turnId,
    reason: e.reason,
    requested: turn.model,
    answered: usage?.model ?? null,
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
    usd,
  }

  try {
    await writeLog($, row)
  } catch (err) {
    $.ui.log(`ultramodel: could not write the cost log: ${String(err)}`)
  }

  await update($, status, s => ({
    next: s.next,
    current: null,
    lastUsd: usd,
    sessionUsd: s.sessionUsd + (usd ?? 0),
    switched: s.switched + (turn.model === null ? 0 : 1),
  }))
}

// One JSON line per finished main-loop turn, in ~/.claude/ultramodel/.
// Holds no prompt text: only ids, reasons and token counts.
async function writeLog($: Dollar, row: object): Promise<void> {
  const home = await $.env.get('HOME')
  const day = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const path = `${home}/.claude/ultramodel/usage-${day}.jsonl`
  const prior = (await $.fs.exists(path)) ? await $.fs.read(path) : ''

  await $.fs.write(path, `${prior}${JSON.stringify(row)}\n`)
}
