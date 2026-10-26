// Pure helpers for the ultramodel mod. No engine imports, so plain Node tests can run them.
import type { PromptDecoration } from 'claude-code'

// Model names a prompt can mention, by the word typed.
export const MODELS: Record<string, { id: string; label: string }> = {
  opus: { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
}

// USD per million tokens. Input and output are the published rates. The cache
// write and Haiku cache read rates are assumptions (1.25x and 0.1x of input);
// confirm them before trusting the logged cost.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

export const RAINBOW = ['error', 'warning', 'success', 'suggestion', 'permission', 'claude'] as const

export const NAME = /\b(opus|sonnet|haiku)\b/gi

// The first model named in a prompt, as an API id; null when none is named.
export function pickModel(text: string): string | null {
  const match = text.match(/\b(opus|sonnet|haiku)\b/i)

  return match === null ? null : MODELS[match[1].toLowerCase()].id
}

export function labelOf(id: string): string {
  return Object.values(MODELS).find(model => model.id === id)?.label ?? id
}

// Paints each letter of a model name in a cycling color, as ultrathink does.
export function highlight(text: string): PromptDecoration[] {
  const runs: PromptDecoration[] = []

  for (const match of text.matchAll(NAME)) {
    const start = match.index ?? 0

    for (let i = 0; i < match[0].length; i += 1) {
      runs.push({
        start: start + i,
        end: start + i + 1,
        color: RAINBOW[(start + i) % RAINBOW.length],
        bold: true,
      })
    }
  }

  return runs
}

export function costUsd(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): number | null {
  const price = PRICES[model]

  if (price === undefined) {
    return null
  }

  const usd =
    usage.input_tokens * price.input +
    usage.output_tokens * price.output +
    usage.cache_read_input_tokens * price.cacheRead +
    usage.cache_creation_input_tokens * price.cacheWrite

  return usd / 1_000_000
}
