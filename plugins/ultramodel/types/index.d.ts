export type Status = {
  // The model the box has picked for the next turn, by its display label.
  next: string | null
  // The model the running turn was switched to; null when no switch.
  current: string | null
  // Cost of the last finished main-loop turn, in USD; null before any.
  lastUsd: number | null
  // Cost of every finished main-loop turn this session, in USD.
  sessionUsd: number
  // Count of finished turns that ran on a switched model.
  switched: number
}

declare module 'claude-code' {
  interface PluginState {
    ultramodel: { status: Status }
  }
}
