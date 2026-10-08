import type { SessionMessage } from 'claude-code'

/** A transcript with one example of every cleanup rule, then three protected prompts. */

export const BIG_FILE = Array.from({ length: 200 }, (_, i) => `${i + 1}\tconst line${i} = ${i} // padding to make this a real file`).join('\n')
export const GIT_LOG = Array.from({ length: 12 }, (_, i) => `commit ${i}abcdef\nAuthor: someone\n    message ${i}`).join('\n') // ~400 chars
export const NOISY = ['\u001b[32mcompiling\u001b[0m', Array.from({ length: 30 }, (_, i) => `progress ${i}%`).join('\r'), ...Array(40).fill('warning: unused variable'), 'done'].join('\n')
export const ERROR_TEXT = `Error: ${'x'.repeat(6000)}`

const prompt = (text: string, handle: string): SessionMessage => ({ role: 'user', text, toolUses: [], handle })
const call = (id: string, tool: string, input: Record<string, unknown>, handle: string): SessionMessage => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool_use_id: id, tool, input }],
  handle,
})
const result = (id: string, text: string, handle: string, isError = false): SessionMessage => ({
  role: 'user',
  text: '',
  toolUses: [],
  toolResults: [{ tool_use_id: id, text, isError, result: { raw: text } }],
  handle,
})

export const transcript: SessionMessage[] = [
  prompt('Fix the rate limiter', 'h0'), // 0
  call('r1', 'Read', { file_path: '/repo/a.ts' }, 'h1'), // 1
  result('r1', BIG_FILE, 'h2'), // 2: superseded by the later read (rule read)
  call('r2', 'Read', { file_path: '/repo/a.ts' }, 'h3'), // 3
  result('r2', BIG_FILE, 'h4'), // 4: newest read, but long (rule trim)
  call('g1', 'Bash', { command: 'git log' }, 'h5'), // 5
  result('g1', GIT_LOG, 'h6'), // 6: duplicate of g2 (rule dup)
  call('g2', 'Bash', { command: 'git log' }, 'h7'), // 7
  result('g2', GIT_LOG, 'h8'), // 8: newest, stays
  call('b1', 'Bash', { command: 'npm run build' }, 'h9'), // 9
  result('b1', NOISY, 'h10'), // 10: ANSI, progress, repeats (rule noise)
  call('e1', 'Bash', { command: 'npm test' }, 'h11'), // 11
  result('e1', ERROR_TEXT, 'h12', true), // 12: long error (rule trim, errors)
  call('a1', 'Agent', { prompt: 'explore' }, 'h13'), // 13
  result('a1', 'y'.repeat(9000), 'h14'), // 14: Agent results are never touched
  prompt('Now add a test', 'h15'), // 15: first protected prompt (3rd from the end)
  call('r3', 'Read', { file_path: '/repo/b.ts' }, 'h16'),
  result('r3', BIG_FILE, 'h17'), // protected: long but untouched
  prompt('Run it', 'h18'),
  prompt('Thanks', 'h19'),
]
