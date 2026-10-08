export type RecentOp = {
  /** Milliseconds since the epoch. */
  at: number
  agent: string
  trigger: string
  /** Share cleaned away, 0 to 100. */
  pct: number
  result: 'cleanup' | 'engine-summary' | 'skipped'
}

declare module 'claude-code' {
  interface PluginState {
    'seamless-compaction': {
      /** Turned off with `/seamless-compaction off`. */
      disabled: boolean
      /** Newest first. */
      recent: RecentOp[]
    }
  }
}
