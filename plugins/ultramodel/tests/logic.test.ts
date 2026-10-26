import { describe, expect, test } from 'claude-code/testing'

import { costUsd, highlight, labelOf, pickModel, RAINBOW } from '../hooks/logic'

const zero = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

describe('pickModel', () => {
  test('returns the API id of the one model named', () => {
    expect(pickModel('opus please')).toBe('claude-opus-5-5')
    expect(pickModel('use sonnet for this')).toBe('claude-sonnet-5-5')
    expect(pickModel('haiku')).toBe('claude-haiku-5-5')
  })

  test('matches case-insensitively', () => {
    expect(pickModel('OPUS')).toBe('claude-opus-5-5')
    expect(pickModel('Sonnet')).toBe('claude-sonnet-5-5')
  })

  test('takes the first mention when several are named', () => {
    expect(pickModel('opus and sonnet')).toBe('claude-opus-5-5')
    expect(pickModel('sonnet then haiku then opus')).toBe('claude-sonnet-5-5')
  })

  test('returns null when no model is named', () => {
    expect(pickModel('no model here')).toBe(null)
    expect(pickModel('')).toBe(null)
  })

  test('needs whole words', () => {
    expect(pickModel('opuses are big')).toBe(null)
    expect(pickModel('the sonnets')).toBe(null)
    expect(pickModel('haikus')).toBe(null)
  })
})

describe('labelOf', () => {
  test('maps a known id to its label and passes unknown ids through', () => {
    expect(labelOf('claude-opus-5-5')).toBe('Opus 5.5')
    expect(labelOf('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(labelOf('claude-other-1')).toBe('claude-other-1')
  })
})

describe('highlight', () => {
  test('paints every letter of each model name', () => {
    const runs = highlight('use opus now')

    expect(runs.length).toBe(4)
    expect(runs.map(r => [r.start, r.end])).toEqual([[4, 5], [5, 6], [6, 7], [7, 8]])
    expect(runs.every(r => r.bold === true)).toBe(true)
  })

  test('colors cycle through the rainbow by absolute position', () => {
    const runs = highlight('use opus now')

    expect(runs[0].color).toBe(RAINBOW[4 % RAINBOW.length])
    expect(runs[3].color).toBe(RAINBOW[7 % RAINBOW.length])
  })

  test('matches case-insensitively and covers each name', () => {
    expect(highlight('Opus or SONNET').length).toBe(4 + 6)
  })

  test('returns nothing when no model is named', () => {
    expect(highlight('plain text')).toEqual([])
    expect(highlight('')).toEqual([])
  })

  test('can be called twice on the same text', () => {
    expect(highlight('opus').length).toBe(4)
    expect(highlight('opus').length).toBe(4)
  })
})

describe('costUsd', () => {
  test('prices one million tokens at the per-million rate', () => {
    expect(costUsd('claude-opus-5-5', { ...zero, input_tokens: 1_000_000 })).toBe(4)
    expect(costUsd('claude-opus-5-5', { ...zero, output_tokens: 1_000_000 })).toBe(20)
    expect(costUsd('claude-sonnet-5-5', { ...zero, input_tokens: 1_000_000 })).toBe(2)
    expect(costUsd('claude-haiku-5-5', { ...zero, output_tokens: 1_000_000 })).toBe(0.5)
  })

  test('prices cache reads and writes', () => {
    expect(costUsd('claude-opus-5-5', { ...zero, cache_read_input_tokens: 1_000_000 })).toBe(0.2)
    expect(costUsd('claude-opus-5-5', { ...zero, cache_creation_input_tokens: 1_000_000 })).toBe(5)
  })

  test('adds all four token kinds together', () => {
    const usd = costUsd('claude-sonnet-5-5', {
      input_tokens: 500_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 200_000,
    })

    // 0.5*2 + 0.1*10 + 1*0.2 + 0.2*2.5 = 1 + 1 + 0.2 + 0.5
    expect(Math.abs((usd ?? NaN) - 2.7) < 1e-9).toBe(true)
  })

  test('returns null for a model it has no price for', () => {
    expect(costUsd('claude-unknown-1', zero)).toBe(null)
  })

  test('returns zero for an empty turn', () => {
    expect(costUsd('claude-haiku-5-5', zero)).toBe(0)
  })
})
